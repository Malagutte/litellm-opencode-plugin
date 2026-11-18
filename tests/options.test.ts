import { describe, expect, it } from "vitest"
import { resolveOptions } from "../src/spend/options.js"

describe("resolveOptions", () => {
  it("falls back to documented defaults when nothing is configured", () => {
    expect(resolveOptions({})).toEqual({
      provider: undefined,
      format: "both",
      refreshIntervalSeconds: 300,
      warningPercent: 80,
      baseUrl: undefined,
      apiKey: undefined,
    })
  })

  it("keeps explicit values", () => {
    expect(
      resolveOptions({
        provider: "litellm",
        format: "percentage",
        refreshIntervalSeconds: 60,
        warningPercent: 90,
        baseUrl: "https://proxy.example.com",
        apiKey: "sk-test",
      }),
    ).toEqual({
      provider: "litellm",
      format: "percentage",
      refreshIntervalSeconds: 60,
      warningPercent: 90,
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-test",
    })
  })

  it("trims strings and treats blanks as absent", () => {
    expect(resolveOptions({ provider: "  litellm  ", apiKey: "   " }).provider).toBe("litellm")
    expect(resolveOptions({ apiKey: "   " }).apiKey).toBeUndefined()
  })

  it("ignores an unknown format", () => {
    expect(resolveOptions({ format: "percent" }).format).toBe("both")
  })

  it("accepts the minimum refresh interval and rejects anything faster", () => {
    expect(resolveOptions({ refreshIntervalSeconds: 15 }).refreshIntervalSeconds).toBe(15)
    expect(resolveOptions({ refreshIntervalSeconds: 14 }).refreshIntervalSeconds).toBe(300)
    expect(resolveOptions({ refreshIntervalSeconds: "60" }).refreshIntervalSeconds).toBe(300)
  })

  it("keeps warning percentages inside 1-100", () => {
    expect(resolveOptions({ warningPercent: 100 }).warningPercent).toBe(100)
    expect(resolveOptions({ warningPercent: 1 }).warningPercent).toBe(1)
    expect(resolveOptions({ warningPercent: 0 }).warningPercent).toBe(80)
    expect(resolveOptions({ warningPercent: 101 }).warningPercent).toBe(80)
  })
})
