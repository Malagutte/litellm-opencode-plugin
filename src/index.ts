import { Plugin } from "@opencode/plugin"
import { SpendRpc } from "./rpc.js"
import type { Chip } from "./spend/chip.js"
import { chipFromFailure, chipFromSnapshot, readSpendSnapshot } from "./spend/chip.js"
import { isAbort } from "./spend/key-info.js"
import { resolveOptions } from "./spend/options.js"

/**
 * Server part.
 *
 * Invisible by itself: it exists so the package can be listed in `plugins`, and
 * it serves `SpendRpc.read` so the Desktop window (or any client) can ask for
 * the current spend without ever seeing the virtual key.
 */
export default Plugin.define({
  id: "litellm-opencode-plugin",
  async setup(context) {
    const options = resolveOptions(context.options)

    await context.rpc.register(SpendRpc, {
      read: async (input, call): Promise<Chip> => {
        const { providerID } = input as { providerID?: string }

        try {
          const snapshot = await readSpendSnapshot({
            options,
            providerID,
            signal: call.signal,
            lookupProvider: async (id) => {
              const provider = await context.provider.get({ providerID: id })
              return { name: provider.data.name, settings: provider.data.settings }
            },
          })
          return chipFromSnapshot(snapshot, options.format)
        } catch (error) {
          // A cancelled call is the caller's business, not a failed lookup.
          if (isAbort(error)) throw error
          return chipFromFailure(error)
        }
      },
    })
  },
})
