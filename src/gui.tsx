/** @jsxImportSource solid-js */
/**
 * Desktop part: a text button in the session header, beside the app's own
 * context toggle, showing the same number as the terminal chip. Clicking it
 * toggles a side panel with the details, the way the host's own context toggle
 * works, instead of opening a dialog.
 *
 * The composer's model/variant row is not extensible, so the session header is
 * the closest host surface that sits next to the model controls. Everything is
 * a thin client of `SpendRpc`: the server part owns the virtual key.
 */

import { Command, Panel, Plugin, Slot, Style } from "@opencode/plugin/gui"
import type { IconName, PanelProps, PanelTab, SessionRef, SlotMap } from "@opencode/plugin/gui"
import { Show, createEffect, createSignal } from "solid-js"
import { SpendRpc } from "./rpc.js"
import type { Chip, ChipLevel } from "./spend/chip.js"

/** The proxy settles spend a moment after a turn ends; a slow poll is enough here. */
const REFRESH_MS = 5 * 60_000
const EMPTY: Chip = { text: "", level: "normal", details: "", error: "" }
const ICON: IconName = "status"
const TAB_ID = "spend"

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
      noSession: "Open a session to see its spend",
      refresh: "Refresh spend",
    },
  },
  setup(ctx) {
    const ui = ctx.ui
    const key = `${ctx.id}:${TAB_ID}`

    // Keyed by provider: a hidden timeline must not overwrite the visible one.
    const [chips, setChips] = createSignal<Record<string, Chip>>({})
    const keyOf = (providerID: string | undefined) => providerID ?? ""
    const chipOf = (providerID: string | undefined) => chips()[keyOf(providerID)] ?? EMPTY

    /** Ask the server part; it owns the provider credentials. */
    const read = async (providerID: string | undefined): Promise<Chip> => {
      const providerKey = keyOf(providerID)
      const answer = (await ctx.client.rpc(SpendRpc).read({ providerID } as { providerID?: string })) as Chip

      setChips((previous) => {
        const last = previous[providerKey]
        // A broken lookup keeps the last good number, like the terminal chip.
        const next = answer.error && last?.text ? { ...answer, text: last.text } : answer
        return { ...previous, [providerKey]: next }
      })

      return chips()[providerKey] ?? EMPTY
    }

    /** Opens the side panel, or closes it when it is already visible. */
    const togglePanel = (session: SessionRef) => ctx.layout.toggle(key, session)

    const spendTab: PanelTab = {
      id: TAB_ID,
      get title() {
        return ctx.t("title")
      },
      closable: "compact",
    }

    const SpendView = (props: { input: PanelProps }) => {
      const providerID = () => props.input.screen.composer.model()?.providerID
      const current = () => chipOf(providerID())

      // Re-read when the session switches model, and on mount.
      createEffect(() => {
        void read(providerID()).catch(() => {})
      })

      return (
        <div class="flex h-full flex-col gap-3 p-4">
          <div class="flex items-center gap-2">
            <ui.Icon name={ICON} class={toneClass(current().level)} />
            <span class={toneClass(current().level)}>{current().text || ctx.t("noData")}</span>
            <ui.IconButton
              class="ml-auto"
              icon="refresh"
              label={ctx.t("refresh")}
              variant="ghost-muted"
              size="small"
              onClick={() => void read(providerID()).catch(() => {})}
            />
          </div>
          <ui.Markdown text={bodyOf(current(), ctx.t)} />
        </div>
      )
    }

    const stopPanel = ctx.add(Panel, {
      id: TAB_ID,
      region: "side",
      width: "narrow",
      list: (input) => (input.open.includes(TAB_ID) ? [spendTab] : []),
      render: (input) => <SpendView input={input} />,
      // A tab stays mounted while hidden, so refresh when it is selected again.
      focus: (input) => void read(input.screen.composer.model()?.providerID).catch(() => {}),
    })

    const HeaderSpend = (props: { input: SlotMap["session.header"] }) => {
      const providerID = () => props.input.screen.composer.model()?.providerID
      const current = () => chipOf(providerID())

      // Re-read when the session switches model, and on mount.
      createEffect(() => {
        void read(providerID()).catch(() => {})
      })

      const toggle = () => togglePanel(props.input.session)

      return (
        <Show when={current().text}>
          {(text) => (
            <Show
              when={props.input.compact}
              fallback={
                <ui.Button variant="ghost-muted" size="small" class="shrink-0" onClick={toggle}>
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
                  onClick={toggle}
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
      run: () => {
        const session = ctx.sessions.current()
        if (!session) {
          ctx.toast.show({ title: ctx.t("title"), description: ctx.t("noSession") })
          return
        }
        togglePanel(session)
      },
    }))

    const stopStyle = ctx.add(Style, STYLES)

    const timer = setInterval(() => {
      const providerID = ctx.screen.current()?.composer.model()?.providerID
      if (providerID) void read(providerID).catch(() => {})
    }, REFRESH_MS)

    return () => {
      clearInterval(timer)
      stopPanel()
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

/** The dialog body is line-per-fact text; a bullet list reads the same in the panel. */
function bodyOf(chip: Chip, t: (key: string) => string): string {
  if (chip.error) return chip.error
  if (!chip.details) return t("noData")
  return chip.details
    .split("\n")
    .map((line) => `- ${line}`)
    .join("\n")
}
