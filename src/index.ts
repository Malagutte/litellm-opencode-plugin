import { Plugin } from "@opencode/plugin"

/**
 * Server part: intentionally inert.
 *
 * It exists so the package is loaded through the `plugins` entry in
 * opencode.json(c). The TUI part (`./tui`) is what renders the spend chip and
 * the `/spend` command.
 */
export default Plugin.define({
  id: "litellm-opencode-plugin",
  setup() {},
})
