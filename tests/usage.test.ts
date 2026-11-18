import { describe, expect, it } from "vitest"
import { formatAmount, formatDetails, formatPercent, formatSpend, parseKeyInfo } from "../src/spend/usage.js"

const NOW = Date.parse("2026-11-18T10:00:00Z")
const WARNING_AT = 80

function info(overrides: Record<string, unknown>) {
  return { info: overrides }
}

describe("parseKeyInfo", () => {
  it("reads the wrapped LiteLLM answer", () => {
    const snapshot = parseKeyInfo(
      info({
        spend: 3.96,
        max_budget: 30,
        budget_duration: "30d",
        budget_reset_at: "2026-12-01T00:00:00+00:00",
        key_alias: "me",
      }),
      WARNING_AT,
      NOW,
    )

    expect(snapshot).toEqual({
      spend: 3.96,
      budget: 30,
      remaining: 26.04,
      percent: expect.closeTo(13.2, 10),
      state: "normal",
      blocked: false,
      keyAlias: "me",
      budgetDuration: "30d",
      resetAt: "2026-12-01T00:00:00+00:00",
      fetchedAt: NOW,
    })
  })

  it("also reads an unwrapped answer", () => {
    expect(parseKeyInfo({ spend: 2, max_budget: 10 }, WARNING_AT).percent).toBe(20)
  })

  it("defaults missing numbers instead of guessing", () => {
    const snapshot = parseKeyInfo(null, WARNING_AT, NOW)
    expect(snapshot.spend).toBe(0)
    expect(snapshot.budget).toBeUndefined()
    expect(snapshot.percent).toBeUndefined()
    expect(snapshot.remaining).toBeUndefined()
    expect(snapshot.state).toBe("normal")
  })

  it("falls back to soft_budget when no hard budget is set", () => {
    expect(parseKeyInfo({ spend: 2, soft_budget: 10 }, WARNING_AT).budget).toBe(10)
  })

  it("prefers max_budget over soft_budget", () => {
    expect(parseKeyInfo({ spend: 2, max_budget: 20, soft_budget: 10 }, WARNING_AT).budget).toBe(20)
  })

  it("never reports a negative remaining amount", () => {
    expect(parseKeyInfo({ spend: 42, max_budget: 30 }, WARNING_AT).remaining).toBe(0)
  })

  it.each([
    [0, "normal"],
    [79.9, "normal"],
    [80, "warning"],
    [99.9, "warning"],
    [100, "exceeded"],
    [140, "exceeded"],
  ])("treats %s%% as %s", (percent, state) => {
    expect(parseKeyInfo({ spend: percent, max_budget: 100 }, WARNING_AT).state).toBe(state)
  })

  it("follows the configured warning threshold", () => {
    expect(parseKeyInfo({ spend: 50, max_budget: 100 }, 50).state).toBe("warning")
  })

  it("treats a blocked key as exceeded even below 100%", () => {
    const snapshot = parseKeyInfo({ spend: 1, max_budget: 30, blocked: true }, WARNING_AT)
    expect(snapshot.blocked).toBe(true)
    expect(snapshot.state).toBe("exceeded")
  })

  it("ignores a zero budget instead of dividing by it", () => {
    expect(parseKeyInfo({ spend: 1, max_budget: 0 }, WARNING_AT).percent).toBeUndefined()
  })
})

describe("formatting", () => {
  const withBudget = parseKeyInfo(info({ spend: 3.96, max_budget: 30 }), WARNING_AT, NOW)
  const withoutBudget = parseKeyInfo(info({ spend: 1.5 }), WARNING_AT, NOW)

  it("formats amounts and percentages", () => {
    expect(formatAmount(3.9611)).toBe("$3.96")
    expect(formatAmount(0)).toBe("$0.00")
    expect(formatPercent(13.24)).toBe("13.2%")
  })

  it("shows both, amount or percentage on the chip", () => {
    expect(formatSpend(withBudget, "both")).toBe("$3.96 / 13.2%")
    expect(formatSpend(withBudget, "amount")).toBe("$3.96")
    expect(formatSpend(withBudget, "percentage")).toBe("13.2%")
  })

  it("shows only the amount when the key has no budget", () => {
    expect(formatSpend(withoutBudget, "both")).toBe("$1.50")
    expect(formatSpend(withoutBudget, "percentage")).toBe("$1.50")
  })

  it("writes the dialog body with budget, remaining, window and reset", () => {
    const details = parseKeyInfo(
      info({
        spend: 3.96,
        max_budget: 30,
        budget_duration: "30d",
        budget_reset_at: "2026-12-01T00:00:00+00:00",
        key_alias: "me",
      }),
      WARNING_AT,
      NOW,
    )

    expect(formatDetails(details).split("\n")).toEqual([
      "$3.96 of $30.00 (13.2%)",
      "Remaining: $26.04",
      "Window: 30d",
      "Resets: 2026-12-01 00:00",
      "Key: me",
      "State: normal",
      "Updated: 2026-11-18 10:00",
    ])
  })

  it("says so when the key has no budget", () => {
    expect(formatDetails(withoutBudget)).toContain("Spent $1.50 (no budget set on this key)")
    expect(formatDetails(withoutBudget)).not.toContain("Remaining:")
    expect(formatDetails(withoutBudget)).not.toContain("Window:")
  })

  it.each([
    [{ blocked: true }, "State: blocked by LiteLLM"],
    [{ spend: 42, max_budget: 30 }, "State: budget exceeded"],
    [{ spend: 25, max_budget: 30 }, "State: budget warning"],
    [{ spend: 1, max_budget: 30 }, "State: normal"],
  ])("labels %o as %s", (overrides, line) => {
    expect(formatDetails(parseKeyInfo(info(overrides), WARNING_AT, NOW))).toContain(line)
  })

  it("leaves an unparseable reset timestamp as it came", () => {
    const snapshot = parseKeyInfo(info({ spend: 1, max_budget: 2, budget_reset_at: "soon" }), WARNING_AT, NOW)
    expect(formatDetails(snapshot)).toContain("Resets: soon")
  })
})
