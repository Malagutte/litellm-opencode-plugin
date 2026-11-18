import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveOptions } from "../src/spend/options.js"
import { createSpendTracker } from "../src/spend/tracker.js"
import { abortError, createFakeContext, litellmProvider, response } from "./support/fake-context.js"

const PAYLOAD = { info: { spend: 3.96, max_budget: 30, budget_duration: "30d", key_alias: "me" } }

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  })
  return calls
}

describe("createSpendTracker", () => {
  it("reads the provider of the model selected in the prompt", async () => {
    const { context, lookedUp } = createFakeContext({
      modelProviderID: "my-litellm",
      providers: { "my-litellm": litellmProvider() },
    })
    const calls = stubFetch(async () => response(200, PAYLOAD))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()

    expect(lookedUp).toEqual(["my-litellm"])
    expect(calls[0]?.url).toBe("https://litellm.example.com/key/info")
    expect(tracker.chip.text).toBe("$3.96 / 13.2%")
    expect(tracker.chip.level).toBe("normal")
    expect(tracker.chip.error).toBe("")
    expect(tracker.chip.details).toContain("Remaining: $26.04")
  })

  it("prefers a pinned provider over the selected model", async () => {
    const { context, lookedUp } = createFakeContext({
      modelProviderID: "selected",
      providers: { pinned: litellmProvider(undefined, undefined, "pinned"), selected: litellmProvider() },
    })
    stubFetch(async () => response(200, PAYLOAD))

    const tracker = createSpendTracker(context, resolveOptions({ provider: "pinned" }))
    await tracker.refresh()

    expect(lookedUp).toEqual(["pinned"])
  })

  it("honours the configured chip format", async () => {
    const { context } = createFakeContext({ modelProviderID: "litellm", providers: { litellm: litellmProvider() } })
    stubFetch(async () => response(200, PAYLOAD))

    const tracker = createSpendTracker(context, resolveOptions({ format: "percentage" }))
    await tracker.refresh()

    expect(tracker.chip.text).toBe("13.2%")
  })

  it("reports the budget state on the chip", async () => {
    const { context } = createFakeContext({ modelProviderID: "litellm", providers: { litellm: litellmProvider() } })
    stubFetch(async () => response(200, { info: { spend: 96, max_budget: 100 } }))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()

    expect(tracker.chip.level).toBe("warning")
  })

  it("stays quiet when no model is selected and nothing is pinned", async () => {
    const { context, lookedUp } = createFakeContext()
    const calls = stubFetch(async () => response(200, PAYLOAD))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()

    expect(lookedUp).toEqual([])
    expect(calls).toEqual([])
    expect(tracker.chip.text).toBe("")
    expect(tracker.chip.error).toContain("No model is selected")
  })

  it("stays quiet for a provider that is not a LiteLLM proxy", async () => {
    const { context } = createFakeContext({ modelProviderID: "anthropic", providers: { anthropic: litellmProvider() } })
    stubFetch(async () => response(404))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()

    expect(tracker.chip.text).toBe("")
    expect(tracker.chip.error).toContain("not a LiteLLM proxy")
  })

  it("stays quiet when the provider exposes no apiKey", async () => {
    const { context } = createFakeContext({
      modelProviderID: "public",
      providers: { public: { settings: { baseURL: "https://host/v1" } } },
    })
    stubFetch(async () => response(200, PAYLOAD))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()

    expect(tracker.chip.text).toBe("")
    expect(tracker.chip.error).toContain("no apiKey")
  })

  it("shows a marker when the lookup breaks", async () => {
    const { context } = createFakeContext({ modelProviderID: "litellm", providers: { litellm: litellmProvider() } })
    stubFetch(async () => response(401))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()

    expect(tracker.chip.text).toBe("LLM –")
    expect(tracker.chip.level).toBe("error")
    expect(tracker.chip.error).toContain("rejected the API key")
  })

  it("keeps the last good number when a later refresh fails", async () => {
    const { context } = createFakeContext({ modelProviderID: "litellm", providers: { litellm: litellmProvider() } })
    let status = 200
    stubFetch(async () => (status === 200 ? response(200, PAYLOAD) : response(500)))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()
    status = 500
    await tracker.refresh()

    expect(tracker.chip.text).toBe("$3.96 / 13.2%")
    expect(tracker.chip.error).toContain("HTTP 500")
    expect(tracker.chip.details).toBe("")
  })

  it("clears the error after a later success", async () => {
    const { context } = createFakeContext({ modelProviderID: "litellm", providers: { litellm: litellmProvider() } })
    let failing = true
    stubFetch(async () => (failing ? response(500) : response(200, PAYLOAD)))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()
    failing = false
    await tracker.refresh()

    expect(tracker.chip.error).toBe("")
    expect(tracker.chip.details).toContain("Remaining:")
  })

  it("stops working after dispose", async () => {
    const { context, lookedUp } = createFakeContext({ modelProviderID: "litellm", providers: { litellm: litellmProvider() } })
    const calls = stubFetch(async () => response(200, PAYLOAD))

    const tracker = createSpendTracker(context, resolveOptions({}))
    await tracker.refresh()
    tracker.dispose()
    await tracker.refresh()

    expect(calls).toHaveLength(1)
    expect(lookedUp).toEqual(["litellm"])
  })

  it("cancels the previous request when refreshing again", async () => {
    const { context } = createFakeContext({ modelProviderID: "litellm", providers: { litellm: litellmProvider() } })

    const signals: Array<AbortSignal | undefined> = []
    let calls = 0
    stubFetch((_url, init) => {
      signals.push(init?.signal ?? undefined)
      calls += 1
      if (calls > 1) return Promise.resolve(response(200, { info: { spend: 9, max_budget: 10 } }))

      // First request hangs until it is aborted, exactly like a real one.
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) return reject(abortError())
        signal.addEventListener("abort", () => reject(abortError()))
      })
    })

    const tracker = createSpendTracker(context, resolveOptions({}))
    const first = tracker.refresh()
    const second = tracker.refresh()

    await second
    await first

    expect(signals[0]?.aborted).toBe(true)
    expect(tracker.chip.text).toBe("$9.00 / 90.0%")
    expect(tracker.chip.error).toBe("")
  })
})
