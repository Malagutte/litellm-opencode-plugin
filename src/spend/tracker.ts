/**
 * The terminal UI's view of the shared core: a reactive chip, one in-flight
 * request, and the rule that a failed refresh never blanks a good number.
 *
 * No JSX here, so the refresh rules stay readable next to each other and the
 * TUI file only renders and wires events.
 */

import type { Context } from "@opencode/plugin/tui/context"
import type { Chip } from "./chip.js"
import { EMPTY_CHIP, chipFromFailure, chipFromSnapshot, readSpendSnapshot } from "./chip.js"
import { isAbort } from "./key-info.js"
import type { SpendOptions } from "./options.js"

export type { Chip, ChipLevel } from "./chip.js"

export interface SpendTracker {
  /** Reactive store: read `chip.text` inside JSX and it re-renders. */
  readonly chip: Chip
  /** Re-read the proxy. Concurrent calls cancel the previous one. */
  refresh(): Promise<void>
  dispose(): void
}

const STORAGE_KEY = "chip"

export function createSpendTracker(context: Context, options: SpendOptions): SpendTracker {
  const [chip, mutateChip] = context.storage.memory<Chip>(STORAGE_KEY, { initial: { ...EMPTY_CHIP } })

  let inFlight: AbortController | undefined
  let disposed = false

  async function refresh(): Promise<void> {
    if (disposed) return

    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    try {
      const snapshot = await readSpendSnapshot({
        options,
        providerID: context.ui.model.current()?.providerID,
        signal: controller.signal,
        lookupProvider: async (providerID) => {
          const provider = await context.client.provider.get({ providerID })
          return { name: provider.data.name, settings: provider.data.settings }
        },
      })
      if (!disposed) mutateChip((current) => Object.assign(current, chipFromSnapshot(snapshot, options.format)))
    } catch (error) {
      if (!isAbort(error)) mutateChip((current) => Object.assign(current, chipFromFailure(error, current)))
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
