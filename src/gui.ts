/**
 * Desktop part: a pill above the composer showing the same number as the
 * terminal chip, plus a `/spend` command that opens the details.
 *
 * No JSX on purpose. The pill takes plain data and the dialog is the app's own,
 * so the bundle stays a thin client of `SpendRpc` instead of a second
 * implementation of the spend logic.
 */

import { Command, ComposerPill, Plugin } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import { SpendRpc } from "./rpc.js"
import type { Chip, ChipLevel } from "./spend/chip.js"

const REFRESH_MS = 5 * 60_000
const EMPTY: Chip = { text: "", level: "normal", details: "", error: "" }

export default Plugin.define({
  i18n: {
    en: {
      title: "LLM spend",
      description: "Show LiteLLM spend and budget usage for the active provider",
      noData: "No spend data yet",
    },
  },
  setup(ctx) {
    const [chip, setChip] = createSignal<Chip>(EMPTY)

    /** Ask the server part; it owns the provider credentials. */
    const read = async (providerID: string | undefined): Promise<Chip> => {
      const answer = (await ctx.client.rpc(SpendRpc).read({ providerID } as { providerID?: string })) as Chip
      // A broken lookup keeps the last good number, like the terminal chip.
      setChip((previous) => (answer.error && previous.text ? { ...answer, text: previous.text } : answer))
      return chip()
    }

    const providerID = () => ctx.screen.current()?.composer.model()?.providerID

    const showDetails = async (id: string | undefined) => {
      let current: Chip
      try {
        current = await read(id)
      } catch (error) {
        ctx.toast.show({ variant: "error", title: ctx.t("title"), description: messageOf(error) })
        return
      }

      if (current.error) {
        ctx.toast.show({ variant: "error", title: ctx.t("title"), description: current.error })
        return
      }
      if (!current.details) {
        ctx.toast.show({ title: ctx.t("title"), description: ctx.t("noData") })
        return
      }
      await ctx.dialogs.alert({ title: ctx.t("title"), description: current.details })
    }

    // Reading the signal inside `show` re-renders the pill when the number lands.
    let followed: string | undefined
    const stopPill = ctx.add(ComposerPill, {
      id: "spend",
      show: (input) => {
        const id = input.screen.composer.model()?.providerID
        if (id !== followed) {
          followed = id
          void read(id).catch(() => {})
        }

        const current = chip()
        if (!current.text) return undefined

        return {
          label: current.text,
          tone: toneOf(current.level),
          title: current.error || ctx.t("title"),
          run: () => void showDetails(providerID()),
        }
      },
    })

    const stopCommand = ctx.add(Command, () => ({
      id: "spend",
      title: ctx.t("title"),
      description: ctx.t("description"),
      group: "LLM",
      slash: { name: "spend" },
      run: () => void showDetails(providerID()),
    }))

    const timer = setInterval(() => void read(providerID()).catch(() => {}), REFRESH_MS)
    void read(providerID()).catch(() => {})

    return () => {
      clearInterval(timer)
      stopPill()
      stopCommand()
    }
  },
})

function toneOf(level: ChipLevel): "success" | "warning" | "danger" | undefined {
  switch (level) {
    case "warning":
      return "warning"
    case "exceeded":
    case "error":
      return "danger"
    default:
      return undefined
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
