import { defineConfig } from "vitest/config"

/**
 * Tests stay on Vite's defaults. Without this file Vitest would load
 * `vite.config.ts`, whose Solid GUI preset switches the environment to jsdom —
 * unnecessary, since nothing here renders DOM.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
})
