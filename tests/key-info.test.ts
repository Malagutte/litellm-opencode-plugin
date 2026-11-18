import { describe, expect, it } from "vitest"
import { fetchKeyInfo, hasNothingToShow, proxyRoot, resolveTarget, SpendError } from "../src/spend/key-info.js"
import { resolveOptions } from "../src/spend/options.js"
import { abortError, response } from "./support/fake-context.js"

const options = resolveOptions({})
const target = { baseUrl: "https://litellm.example.com", apiKey: "sk-test" }

describe("proxyRoot", () => {
  it.each([
    ["https://host/v1", "https://host"],
    ["https://host/v1/", "https://host"],
    ["https://host/", "https://host"],
    ["  https://host/v1  ", "https://host"],
    ["https://host/sub/V1", "https://host/sub"],
  ])("turns %s into %s", (input, expected) => {
    expect(proxyRoot(input)).toBe(expected)
  })
})

describe("resolveTarget", () => {
  it("reads baseURL and apiKey from the provider settings", () => {
    const resolved = resolveTarget({ id: "litellm", settings: { baseURL: "https://host/v1", apiKey: "sk-test" } }, options)
    expect(resolved).toEqual({ baseUrl: "https://host", apiKey: "sk-test" })
  })

  it("lets options override the provider", () => {
    const resolved = resolveTarget(
      { id: "litellm", settings: { baseURL: "https://host/v1", apiKey: "sk-provider" } },
      { ...options, baseUrl: "https://other.example.com", apiKey: "sk-option" },
    )
    expect(resolved).toEqual({ baseUrl: "https://other.example.com", apiKey: "sk-option" })
  })

  it("names the provider when there is no baseURL", () => {
    expect(() => resolveTarget({ id: "litellm", name: "LiteLLM", settings: {} }, options)).toThrow(
      'Provider "LiteLLM" has no baseURL',
    )
  })

  it("names the provider when there is no apiKey", () => {
    expect(() => resolveTarget({ id: "litellm", settings: { baseURL: "https://host" } }, options)).toThrow(
      'Provider "litellm" has no apiKey',
    )
  })

  it("treats provider errors as configuration errors", () => {
    try {
      resolveTarget({ id: "litellm", settings: {} }, options)
      expect.unreachable("resolveTarget should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(SpendError)
      expect((error as SpendError).kind).toBe("config")
    }
  })
})

describe("fetchKeyInfo", () => {
  it("asks the proxy root for the key and sends the bearer token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const body = { info: { spend: 1 } }

    const payload = await fetchKeyInfo(target, {
      fetch: async (url, init) => {
        calls.push({ url, init })
        return response(200, body)
      },
    })

    expect(payload).toEqual(body)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://litellm.example.com/key/info")
    expect(calls[0]?.init?.headers).toEqual({ Authorization: "Bearer sk-test", Accept: "application/json" })
  })

  it.each([404, 405])("reports HTTP %i as an unsupported provider", async (status) => {
    await expect(fetchKeyInfo(target, { fetch: async () => response(status) })).rejects.toMatchObject({
      kind: "unsupported",
    })
  })

  it.each([401, 403])("reports HTTP %i as an auth failure", async (status) => {
    await expect(fetchKeyInfo(target, { fetch: async () => response(status) })).rejects.toMatchObject({ kind: "auth" })
  })

  it("reports any other status as an HTTP failure and mentions the status", async () => {
    await expect(fetchKeyInfo(target, { fetch: async () => response(500) })).rejects.toMatchObject({
      kind: "http",
      message: expect.stringContaining("HTTP 500"),
    })
  })

  it("reports an unreachable proxy as a network failure", async () => {
    await expect(
      fetchKeyInfo(target, {
        fetch: async () => {
          throw new Error("ECONNREFUSED")
        },
      }),
    ).rejects.toMatchObject({ kind: "network", message: expect.stringContaining("ECONNREFUSED") })
  })

  it("rethrows aborts untouched instead of reporting them", async () => {
    const abort = abortError()
    const failure = fetchKeyInfo(target, {
      fetch: async () => {
        throw abort
      },
    })

    await expect(failure).rejects.toBe(abort)
  })
})

describe("hasNothingToShow", () => {
  it.each(["config", "unsupported"] as const)("hides %s failures", (kind) => {
    expect(hasNothingToShow(new SpendError(kind, "x"))).toBe(true)
  })

  it.each(["auth", "http", "network"] as const)("shows %s failures", (kind) => {
    expect(hasNothingToShow(new SpendError(kind, "x"))).toBe(false)
  })

  it("does not hide unexpected errors", () => {
    expect(hasNothingToShow(new Error("boom"))).toBe(false)
    expect(hasNothingToShow("boom")).toBe(false)
  })
})
