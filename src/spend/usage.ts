/**
 * Turning the `/key/info` body into a snapshot, and the snapshot into the text
 * the UI shows.
 */

import { readBoolean, readNumber, readRecord, readString } from "./json.js"
import type { StatusFormat } from "./options.js"

export type SpendState = "normal" | "warning" | "exceeded"

export interface SpendSnapshot {
  readonly spend: number
  readonly budget?: number
  readonly remaining?: number
  /** Share of `budget` already spent, 0-100+. Undefined when the key has no budget. */
  readonly percent?: number
  readonly state: SpendState
  readonly blocked: boolean
  readonly keyAlias?: string
  readonly budgetDuration?: string
  /** ISO timestamp of the next budget reset, as reported by LiteLLM. */
  readonly resetAt?: string
  readonly fetchedAt: number
}

/**
 * Read a key's usage out of the proxy answer.
 *
 * LiteLLM wraps the key in `{ key, info }`; older builds answer with the info
 * itself. `soft_budget` is only used when no hard `max_budget` is set, because
 * a soft budget warns instead of blocking.
 */
export function parseKeyInfo(payload: unknown, warningPercent: number, now = Date.now()): SpendSnapshot {
  const body = readRecord(payload) ?? {}
  const info = readRecord(body.info) ?? body

  const spend = readNumber(info.spend) ?? 0
  const budget = readNumber(info.max_budget) ?? readNumber(info.soft_budget)
  const percent = budget !== undefined && budget > 0 ? (spend / budget) * 100 : undefined
  const blocked = readBoolean(info.blocked) === true

  return {
    spend,
    budget,
    remaining: budget === undefined ? undefined : Math.max(budget - spend, 0),
    percent,
    state: spendState(percent, blocked, warningPercent),
    blocked,
    keyAlias: readString(info.key_alias),
    budgetDuration: readString(info.budget_duration),
    resetAt: readString(info.budget_reset_at),
    fetchedAt: now,
  }
}

function spendState(percent: number | undefined, blocked: boolean, warningPercent: number): SpendState {
  if (blocked) return "exceeded"
  if (percent === undefined) return "normal"
  if (percent >= 100) return "exceeded"
  if (percent >= warningPercent) return "warning"
  return "normal"
}

export function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`
}

/** The footer text: `$3.96 / 13.2%`, `13.2%` or `$3.96` when there is no budget. */
export function formatSpend(snapshot: SpendSnapshot, format: StatusFormat): string {
  const amount = formatAmount(snapshot.spend)
  const percent = snapshot.percent === undefined ? undefined : formatPercent(snapshot.percent)

  if (percent === undefined) return amount
  switch (format) {
    case "amount":
      return amount
    case "percentage":
      return percent
    default:
      return `${amount} / ${percent}`
  }
}

/** Multi-line body of the `/spend` dialog. */
export function formatDetails(snapshot: SpendSnapshot): string {
  const lines = [
    ...budgetLines(snapshot),
    ...keyLines(snapshot),
    `Updated: ${formatTimestamp(new Date(snapshot.fetchedAt).toISOString())}`,
  ]
  return lines.join("\n")
}

function budgetLines(snapshot: SpendSnapshot): string[] {
  if (snapshot.budget === undefined) {
    return [`Spent ${formatAmount(snapshot.spend)} (no budget set on this key)`]
  }

  const lines = [
    `${formatAmount(snapshot.spend)} of ${formatAmount(snapshot.budget)} (${formatPercent(snapshot.percent ?? 0)})`,
    `Remaining: ${formatAmount(snapshot.remaining ?? 0)}`,
  ]
  if (snapshot.budgetDuration) lines.push(`Window: ${snapshot.budgetDuration}`)
  if (snapshot.resetAt) lines.push(`Resets: ${formatTimestamp(snapshot.resetAt)}`)
  return lines
}

function keyLines(snapshot: SpendSnapshot): string[] {
  const lines: string[] = []
  if (snapshot.keyAlias) lines.push(`Key: ${snapshot.keyAlias}`)
  lines.push(`State: ${stateLabel(snapshot)}`)
  return lines
}

function stateLabel(snapshot: SpendSnapshot): string {
  if (snapshot.blocked) return "blocked by LiteLLM"
  if (snapshot.state === "exceeded") return "budget exceeded"
  if (snapshot.state === "warning") return "budget warning"
  return "normal"
}

/** `2026-12-01T00:00:00+00:00` becomes `2026-12-01 00:00`. */
function formatTimestamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value)
  return match ? `${match[1]} ${match[2]}` : value
}
