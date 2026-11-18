/**
 * Readers for untrusted JSON, which here means plugin options from opencode.json(c)
 * and the body of `/key/info`. They never throw and never guess: a value of the
 * wrong shape reads as `undefined` so the caller keeps its own default.
 */

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}
