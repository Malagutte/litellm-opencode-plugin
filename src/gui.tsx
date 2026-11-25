/** @jsxImportSource solid-js */
/**
 * Desktop part: a text button in the session header, beside the app's own
 * context toggle, showing the same number as the terminal chip, plus a
 * `/spend` command that opens the details.
 *
 * The composer's model/variant row is not extensible, so the session header is
 * the closest host surface that sits next to the model controls. The button is
 * a thin client of `SpendRpc`: the server part owns the virtual key.
 */

import { Command, Plugin, Slot, Style } from "@opencode/plugin/gui"
import type { IconName, SlotMap } from "@opencode/plugin/gui"
import { Show, createEffect, createSignal } from "solid-js"
import { SpendRpc } from "./rpc.js"
import type { Chip, ChipLevel } from "./spend/chip.js"

/** The proxy settles spend a moment after a turn ends; a slow poll is enough here. */
const REFRESH_MS = 5 * 60_000
const EMPTY: Chip = { text: "", level: "normal", details: "", error: "" }
const ICON: IconName = "status"

/** Same colours the app gives its own state text. */
const STYLES = `
.llm-spend--warning { color: var(--v2-state-fg-warning); }
.llm-spend--danger { color: var(--v2-state-fg-danger); }
`

export default Plugin.define({
  i18n: {
    en: {
      title: "LLM spend",
      description: "Show LiteLLM spend and budget usage for the active provider",
      noData: "No spend data yet",
    },
  },
  setup(ctx) {
    const ui = ctx.ui

    // Keyed by provider: a hidden timeline must not overwrite the visible one.
    const [chips, setChips] = createSignal<Record<string, Chip>>({})
    const keyOf = (providerID: string | undefined) => providerID ?? ""
    const chipOf = (providerID: string | undefined) => chips()[keyOf(providerID)] ?? EMPTY

    /** Ask the server part; it owns the provider credentials. */
    const read = async (providerID: string | undefined): Promise<Chip> => {
      const key = keyOf(providerID)
      const answer = (await ctx.client.rpc(SpendRpc).read({ providerID } as { providerID?: string })) as Chip

      setChips((previous) => {
        const last = previous[key]
        // A broken lookup keeps the last good number, like the terminal chip.
        const next = answer.error && last?.text ? { ...answer, text: last.text } : answer
        return { ...previous, [key]: next }
      })

      return chips()[key] ?? EMPTY
    }

    const showDetails = async (providerID: string | undefined) => {
      let current: Chip
      try {
        current = await read(providerID)
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

    const HeaderSpend = (props: { input: SlotMap["session.header"] }) => {
      const providerID = () => props.input.screen.composer.model()?.providerID
      const current = () => chipOf(providerID())

      // Re-read when the session switches model, and on mount.
      createEffect(() => {
        void read(providerID()).catch(() => {})
      })

      return (
        <Show when={current().text}>
          {(text) => (
            <Show
              when={props.input.compact}
              fallback={
                <ui.Button
                  variant="ghost-muted"
                  size="small"
                  class="shrink-0"
                  onClick={() => void showDetails(providerID())}
                >
                  <span class={toneClass(current().level)}>{text()}</span>
                </ui.Button>
              }
            >
              <ui.Tooltip value={text()}>
                <ui.IconButton
                  icon={ICON}
                  label={text()}
                  variant="ghost-muted"
                  size="small"
                  onClick={() => void showDetails(providerID())}
                />
              </ui.Tooltip>
            </Show>
          )}
        </Show>
      )
    }

    const stopSlot = ctx.add(Slot, {
      at: "session.header",
      order: 10,
      render: (input) => <HeaderSpend input={input} />,
    })

    const stopCommand = ctx.add(Command, () => ({
      id: "spend",
      title: ctx.t("title"),
      description: ctx.t("description"),
      group: "LLM",
      slash: { name: "spend" },
      run: () => void showDetails(ctx.screen.current()?.composer.model()?.providerID),
    }))

    const stopStyle = ctx.add(Style, STYLES)

    const timer = setInterval(() => {
      const providerID = ctx.screen.current()?.composer.model()?.providerID
      if (providerID) void read(providerID).catch(() => {})
    }, REFRESH_MS)

    return () => {
      clearInterval(timer)
      stopSlot()
      stopCommand()
      stopStyle()
    }
  },
})

function toneClass(level: ChipLevel): string {
  if (level === "warning") return "llm-spend--warning"
  if (level === "exceeded" || level === "error") return "llm-spend--danger"
  return ""
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
