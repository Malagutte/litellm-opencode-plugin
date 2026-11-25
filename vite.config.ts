import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

/**
 * Builds the prebuilt CommonJS bundle that `./gui-experimental` exports.
 * The Desktop app loads no TypeScript, so this is the only generated artifact.
 */
export default defineConfig({
  plugins: [gui({ entry: "src/gui.tsx", outFile: "dist/gui-experimental.cjs" })],
})
