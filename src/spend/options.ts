/**
 * What the plugin accepts under `plugins[].options`, and how a missing or bogus
 * value falls back to a sane default.
 */

import { readNumber, readString } from "./json.js"

export type StatusFormat = "both" | "amount" | "percentage"

export interface SpendOptions {
  /**
   * Provider to query. Undefined follows the model selected in the prompt, which
   * is what most people want: switch models, switch budget.
   */
  readonly provider?: string
  /** How the footer chip reads: `$3.96 / 13.2%`, `$3.96`, or `13.2%`. */
  readonly format: StatusFormat
  readonly refreshIntervalSeconds: number
  /** Percentage from which the chip switches to the warning colour. */
  readonly warningPercent: number
  /** Overrides the proxy root derived from the provider. */
  readonly baseUrl?: string
  /** Overrides the virtual key derived from the provider. */
  readonly apiKey?: string
}

const DEFAULT_FORMAT: StatusFormat = "both"
const DEFAULT_REFRESH_SECONDS = 300
const DEFAULT_WARNING_PERCENT = 80
/** Polling faster than this would only add load to the proxy. */
const MIN_REFRESH_SECONDS = 15

export function resolveOptions(raw: Readonly<Record<string, unknown>>): SpendOptions {
  return {
    provider: readString(raw.provider),
    format: readFormat(raw.format),
    refreshIntervalSeconds: readRefreshSeconds(raw.refreshIntervalSeconds),
    warningPercent: readWarningPercent(raw.warningPercent),
    baseUrl: readString(raw.baseUrl),
    apiKey: readString(raw.apiKey),
  }
}

function readFormat(value: unknown): StatusFormat {
  return value === "amount" || value === "percentage" ? value : DEFAULT_FORMAT
}

function readRefreshSeconds(value: unknown): number {
  const seconds = readNumber(value)
  return seconds !== undefined && seconds >= MIN_REFRESH_SECONDS ? seconds : DEFAULT_REFRESH_SECONDS
}

function readWarningPercent(value: unknown): number {
  const percent = readNumber(value)
  return percent !== undefined && percent > 0 && percent <= 100 ? percent : DEFAULT_WARNING_PERCENT
}
