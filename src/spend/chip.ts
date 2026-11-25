/**
 * The platform-independent core of the plugin: turn "which provider is the user
 * on" into the text, colour level and detail body shown by the TUI chip and by
 * the Desktop pill.
 *
 * Nothing here knows about slots, keys or windows, so the TUI part, the Desktop
 * part and the server RPC all share one behaviour.
 */

import { SpendError, fetchKeyInfo, hasNothingToShow, resolveTarget } from "./key-info.js"
import type { SpendOptions, StatusFormat } from "./options.js"
import { formatDetails, formatSpend, parseKeyInfo } from "./usage.js"
import type { SpendSnapshot } from "./usage.js"

export type ChipLevel = "normal" | "warning" | "exceeded" | "error"

export interface Chip {
  /** Footer/pill text. Empty means "render nothing". */
  text: string
  level: ChipLevel
  /** Body of the `/spend` dialog, empty after a failure. */
  details: string
  /** Last failure, empty after a successful refresh. */
  error: string
}

export const EMPTY_CHIP: Chip = { text: "", level: "normal", details: "", error: "" }

/** Kept visible when the lookup breaks, so a stale number is never mistaken for a fresh one. */
export const ERROR_TEXT = "LLM –"

/** A provider entry, as OpenCode hands it to a plugin. */
export interface ProviderSettings {
  readonly name?: string
  readonly settings?: Readonly<Record<string, unknown>>
}

export type LookupProvider = (providerID: string) => Promise<ProviderSettings>

export interface SpendRequest {
  readonly options: SpendOptions
  /** Provider of the model the user is on. Ignored when an option pins one. */
  readonly providerID?: string
  readonly lookupProvider: LookupProvider
  readonly signal?: AbortSignal
}

/** Read the proxy for the requested provider and parse what it answers. */
export async function readSpendSnapshot(request: SpendRequest): Promise<SpendSnapshot> {
  const providerID = request.options.provider ?? request.providerID
  if (!providerID) {
    throw new SpendError("config", "No model is selected, so there is no provider to read spend from.")
  }

  const provider = await request.lookupProvider(providerID)
  const target = resolveTarget({ id: providerID, name: provider.name, settings: provider.settings ?? {} }, request.options)
  return parseKeyInfo(await fetchKeyInfo(target, { signal: request.signal }), request.options.warningPercent)
}

export function chipFromSnapshot(snapshot: SpendSnapshot, format: StatusFormat): Chip {
  return {
    text: formatSpend(snapshot, format),
    level: snapshot.state,
    details: formatDetails(snapshot),
    error: "",
  }
}

/**
 * A failed lookup. `previous` keeps a stale number visible instead of blanking
 * it; a provider that is simply not a LiteLLM proxy stays silent either way.
 */
export function chipFromFailure(error: unknown, previous?: Chip): Chip {
  const quiet = hasNothingToShow(error)
  return {
    text: quiet ? "" : (previous?.text || ERROR_TEXT),
    level: "error",
    details: "",
    error: describe(error),
  }
}

export function describe(error: unknown): string {
  if (error instanceof SpendError) return error.message
  if (error instanceof Error) return `Unexpected error: ${error.message}`
  return `Unexpected error: ${String(error)}`
}
