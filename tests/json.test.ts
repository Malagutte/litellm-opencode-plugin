import { describe, expect, it } from "vitest"
import { readBoolean, readNumber, readRecord, readString } from "../src/spend/json.js"

describe("readRecord", () => {
  it("returns plain objects", () => {
    expect(readRecord({ a: 1 })).toEqual({ a: 1 })
  })

  it.each([null, undefined, "text", 42, true, []])("rejects %s", (value) => {
    expect(readRecord(value)).toBeUndefined()
  })
})

describe("readString", () => {
  it("trims surrounding whitespace", () => {
    expect(readString("  sk-test \n")).toBe("sk-test")
  })

  it.each(["", "   ", 42, null, undefined, {}])("rejects %s", (value) => {
    expect(readString(value)).toBeUndefined()
  })
})

describe("readNumber", () => {
  it("accepts finite numbers including zero", () => {
    expect(readNumber(0)).toBe(0)
    expect(readNumber(-1.5)).toBe(-1.5)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, "3", null])("rejects %s", (value) => {
    expect(readNumber(value)).toBeUndefined()
  })
})

describe("readBoolean", () => {
  it("accepts both booleans", () => {
    expect(readBoolean(true)).toBe(true)
    expect(readBoolean(false)).toBe(false)
  })

  it.each(["true", 1, null])("rejects %s", (value) => {
    expect(readBoolean(value)).toBeUndefined()
  })
})
