/**
 * The contract between the server part, which owns the proxy credentials, and
 * every client that wants to show the spend (the Desktop window, another
 * plugin, an HTTP caller).
 *
 * JSON Schema on purpose: it validates without pulling a runtime dependency into
 * the server or into the prebuilt Desktop bundle.
 */

import { Rpc } from "@opencode/plugin/rpc"

const CHIP_LEVELS = ["normal", "warning", "exceeded", "error"] as const

const chipSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    level: { type: "string", enum: CHIP_LEVELS },
    details: { type: "string" },
    error: { type: "string" },
  },
  required: ["text", "level", "details", "error"],
  additionalProperties: false,
} as const

export const SpendRpc = Rpc.define({
  id: "litellm-opencode-plugin.spend",
  methods: {
    read: {
      input: {
        type: "object",
        properties: {
          /** Provider of the model the user is on; the server falls back to the pinned option. */
          providerID: { type: "string" },
        },
        additionalProperties: false,
      },
      output: chipSchema,
    },
  },
  events: {},
})
