import { Plugin } from "@opencode/plugin/tui"
import type { Context, KeymapCommand } from "@opencode/plugin/tui/context"
import { Show } from "solid-js"
import { resolveOptions } from "./spend/options.js"
import { createSpendTracker } from "./spend/tracker.js"
import type { ChipLevel, SpendTracker } from "./spend/tracker.js"

/** The proxy settles spend a moment after a turn ends, so refresh slightly later. */
const REFRESH_AFTER_TURN_MS = 5_000
const TOAST_MS = 8_000
const NO_DATA_TEXT = "No spend data yet"

export default Plugin.define({
  id: "litellm-opencode-plugin.tui",
  async setup(context) {
    const options = resolveOptions(context.options)
    const tracker = createSpendTracker(context, options)

    const renderChip = () => chipElement(context, tracker)
    const stopPromptChip = context.ui.slot({ append: "prompt.footer.status", render: renderChip })
    const stopHomeChip = context.ui.slot({ append: "home.footer.status", render: renderChip })

    context.keymap.layer(() => ({ mode: "global", commands: [createSpendCommand(context, tracker)] }))

    const refreshTimer = setInterval(() => void tracker.refresh(), options.refreshIntervalSeconds * 1000)

    // Coalesce several turns finishing in a row into one refresh.
    let afterTurnTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleAfterTurn = () => {
      if (afterTurnTimer) clearTimeout(afterTurnTimer)
      afterTurnTimer = setTimeout(() => {
        afterTurnTimer = undefined
        void tracker.refresh()
      }, REFRESH_AFTER_TURN_MS)
    }

    const stopAfterTurn = context.data.on("session.execution.succeeded", scheduleAfterTurn)
    // The chip follows the model, so a model switch may mean a different provider and budget.
    const stopOnModelChange = context.data.on("session.model.selected", () => void tracker.refresh())

    void tracker.refresh()

    return () => {
      clearInterval(refreshTimer)
      if (afterTurnTimer) clearTimeout(afterTurnTimer)
      stopAfterTurn()
      stopOnModelChange()
      stopPromptChip()
      stopHomeChip()
      tracker.dispose()
    }
  },
})

function chipElement(context: Context, tracker: SpendTracker) {
  return (
    <Show when={tracker.chip.text}>
      <text fg={chipColor(context, tracker.chip.level)}>{tracker.chip.text}</text>
    </Show>
  )
}

function chipColor(context: Context, level: ChipLevel) {
  const feedback = context.theme.text.feedback
  switch (level) {
    case "exceeded":
      return feedback.error.base
    case "warning":
      return feedback.warning.base
    case "error":
      return feedback.error.muted
    default:
      return context.theme.text.base
  }
}

function createSpendCommand(context: Context, tracker: SpendTracker): KeymapCommand {
  return {
    id: "litellm-opencode-plugin.show",
    title: "LLM spend",
    description: "Show LiteLLM spend and budget usage for the active provider",
    group: "LLM",
    palette: true,
    slash: { name: "spend", aliases: ["llm-spend"] },
    run: async () => {
      await tracker.refresh()

      const { error, details } = tracker.chip
      if (error) {
        toast(context, error, "error")
        return
      }
      if (!details) {
        toast(context, NO_DATA_TEXT, "info")
        return
      }
      await context.ui.dialog.alert({ title: "LLM spend", message: details })
    },
  }
}

function toast(context: Context, message: string, variant: "info" | "error"): void {
  context.ui.toast.show({ title: "LLM spend", message, variant, duration: TOAST_MS })
}
