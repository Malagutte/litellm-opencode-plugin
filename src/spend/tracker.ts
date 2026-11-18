/**
 * Everything that changes over time: the reactive chip state, the in-flight
 * request, and the rules for turning a refresh into a chip update.
 *
 * No JSX here, so the refresh rules stay readable next to each other and the
 * TUI file only renders and wires events.
 */

import type { Context } from "@opencode/plugin/tui/context"
import { SpendError, fetchKeyInfo, hasNothingToShow, isAbort, resolveTarget } from "./key-info.js"
import type { SpendOptions, StatusFormat } from "./options.js"
import { formatDetails, formatSpend, parseKeyInfo } from "./usage.js"
import type { SpendSnapshot } from "./usage.js"

export type ChipLevel = "normal" | "warning" | "exceeded" | "error"

export interface Chip {
  /** Footer text. Empty means "render nothing". */
  text: string
  level: ChipLevel
  /** Body of the `/spend` dialog, empty after a failure. */
  details: string
  /** Last failure, empty after a successful refresh. */
  error: string
}

export interface SpendTracker {
  /** Reactive store: read `chip.text` inside JSX and it re-renders. */
  readonly chip: Chip
  /** Re-read the proxy. Concurrent calls cancel the previous one. */
  refresh(): Promise<void>
  dispose(): void
}

const STORAGE_KEY = "chip"
/** Kept visible when the lookup breaks, so a stale number is never mistaken for a fresh one. */
const ERROR_TEXT = "LLM –"

type MutateChip = (mutation: (chip: Chip) => void) => void

export function createSpendTracker(context: Context, options: SpendOptions): SpendTracker {
  const [chip, mutateChip] = context.storage.memory<Chip>(STORAGE_KEY, {
    initial: { text: "", level: "normal", details: "", error: "" },
  })

  let inFlight: AbortController | undefined
  let disposed = false

  async function refresh(): Promise<void> {
    if (disposed) return

    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    try {
      const snapshot = await readSnapshot(context, options, controller.signal)
      if (!disposed) storeSnapshot(mutateChip, snapshot, options.format)
    } catch (error) {
      if (!isAbort(error)) storeFailure(mutateChip, error)
    } finally {
      if (inFlight === controller) inFlight = undefined
    }
  }

  return {
    chip,
    refresh,
    dispose() {
      disposed = true
      inFlight?.abort()
      inFlight = undefined
    },
  }
}

/** Which provider to ask, and what it answered, in one place. */
async function readSnapshot(context: Context, options: SpendOptions, signal: AbortSignal): Promise<SpendSnapshot> {
  const providerID = options.provider ?? context.ui.model.current()?.providerID
  if (!providerID) {
    throw new SpendError("config", "No model is selected, so there is no provider to read spend from.")
  }

  const provider = await context.client.provider.get({ providerID })
  const target = resolveTarget({ id: providerID, name: provider.data.name, settings: provider.data.settings }, options)
  return parseKeyInfo(await fetchKeyInfo(target, { signal }), options.warningPercent)
}

function storeSnapshot(mutateChip: MutateChip, snapshot: SpendSnapshot, format: StatusFormat): void {
  mutateChip((chip) => {
    chip.text = formatSpend(snapshot, format)
    chip.level = snapshot.state
    chip.details = formatDetails(snapshot)
    chip.error = ""
  })
}

function storeFailure(mutateChip: MutateChip, error: unknown): void {
  // A provider without a LiteLLM endpoint is not an error the user can act on:
  // clear the chip. A broken lookup keeps a visible marker.
  const quiet = hasNothingToShow(error)

  mutateChip((chip) => {
    if (quiet) chip.text = ""
    else if (!chip.text) chip.text = ERROR_TEXT

    chip.level = "error"
    chip.details = ""
    chip.error = describe(error)
  })
}

function describe(error: unknown): string {
  if (error instanceof SpendError) return error.message
  if (error instanceof Error) return `Unexpected error: ${error.message}`
  return `Unexpected error: ${String(error)}`
}
