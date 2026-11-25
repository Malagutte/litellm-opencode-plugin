import { afterEach, describe, expect, it, vi } from "vitest"
import { ERROR_TEXT, chipFromFailure, chipFromSnapshot, readSpendSnapshot } from "../src/spend/chip.js"
import { SpendError } from "../src/spend/key-info.js"
import { resolveOptions } from "../src/spend/options.js"
import { parseKeyInfo } from "../src/spend/usage.js"
import { response } from "./support/fake-context.js"

const options = resolveOptions({})
const NOW = Date.parse("2026-11-19T10:00:00Z")
const PAYLOAD = { info: { spend: 3.96, max_budget: 30 } }

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown = PAYLOAD, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return response(status, body)
  })
  return calls
}

describe("readSpendSnapshot", () => {
  it("queries the provider the caller passes", async () => {
    const calls = stubFetch()
    const lookedUp: string[] = []

    const snapshot = await readSpendSnapshot({
      options,
      providerID: "litellm",
      lookupProvider: async (id) => {
        lookedUp.push(id)
        return { name: "LiteLLM", settings: { baseURL: "https://litellm.example.com/v1", apiKey: "sk-test" } }
      },
    })

    expect(lookedUp).toEqual(["litellm"])
    expect(calls[0]?.url).toBe("https://litellm.example.com/key/info")
    expect(snapshot.spend).toBe(3.96)
    expect(snapshot.budget).toBe(30)
  })

  it("lets the pinned option win over the caller", async () => {
    stubFetch()
    const lookedUp: string[] = []

    await readSpendSnapshot({
      options: resolveOptions({ provider: "pinned" }),
      providerID: "selected",
      lookupProvider: async (id) => {
        lookedUp.push(id)
        return { settings: { baseURL: "https://host/v1", apiKey: "sk-test" } }
      },
    })

    expect(lookedUp).toEqual(["pinned"])
  })

  it("reports a configuration error when nothing says which provider to ask", async () => {
    await expect(
      readSpendSnapshot({ options, providerID: undefined, lookupProvider: async () => ({}) }),
    ).rejects.toMatchObject({ kind: "config" })
  })

  it("treats a provider without proxy settings as a configuration error", async () => {
    await expect(
      readSpendSnapshot({ options, providerID: "litellm", lookupProvider: async () => ({ settings: {} }) }),
    ).rejects.toBeInstanceOf(SpendError)
  })
})

describe("chipFromSnapshot", () => {
  it("builds the text, level and dialog body", () => {
    const chip = chipFromSnapshot(parseKeyInfo(PAYLOAD, 80, NOW), "both")

    expect(chip.text).toBe("$3.96 / 13.2%")
    expect(chip.level).toBe("normal")
    expect(chip.details).toContain("Remaining: $26.04")
    expect(chip.error).toBe("")
  })

  it("honours the configured format", () => {
    expect(chipFromSnapshot(parseKeyInfo(PAYLOAD, 80, NOW), "amount").text).toBe("$3.96")
  })
})

describe("chipFromFailure", () => {
  it("keeps silent for a provider that is not a LiteLLM proxy", () => {
    const chip = chipFromFailure(new SpendError("unsupported", "not a proxy"))
    expect(chip.text).toBe("")
    expect(chip.level).toBe("error")
    expect(chip.error).toBe("not a proxy")
  })

  it("shows a marker when there is no number to keep", () => {
    expect(chipFromFailure(new SpendError("auth", "denied")).text).toBe(ERROR_TEXT)
  })

  it("keeps the last good number when the lookup breaks", () => {
    const previous = { text: "$3.96 / 13.2%", level: "normal" as const, details: "old", error: "" }
    const chip = chipFromFailure(new SpendError("http", "HTTP 500"), previous)

    expect(chip.text).toBe("$3.96 / 13.2%")
    expect(chip.details).toBe("")
  })

  it("describes an unexpected error without throwing", () => {
    expect(chipFromFailure(new Error("boom")).error).toBe("Unexpected error: boom")
    expect(chipFromFailure("boom").error).toBe("Unexpected error: boom")
  })
})
