/**
 * Guards the published tarball: the entrypoints the OpenCode plugin loader
 * resolves, the sources they import, and the licence/readme npm users expect
 * must actually be inside it.
 *
 * Run with `npm run check:package`. Exits non-zero with the missing paths.
 */

import { execFileSync } from "node:child_process"

const REQUIRED_FILES = [
  "package.json",
  "README.md",
  "LICENSE",
  "src/index.ts",
  "src/tui.tsx",
  "src/spend/tracker.ts",
  "src/spend/key-info.ts",
  "src/spend/usage.ts",
  "src/spend/options.ts",
  "src/spend/json.ts",
  "src/spend/chip.ts",
  "src/rpc.ts",
  "src/gui.tsx",
  "dist/gui-experimental.cjs",
]

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })
const [tarball] = JSON.parse(output)
const packed = new Set(tarball.files.map((file) => file.path))

const missing = REQUIRED_FILES.filter((file) => !packed.has(file))
if (missing.length > 0) {
  console.error(`Missing from ${tarball.filename}:\n  ${missing.join("\n  ")}`)
  process.exit(1)
}

console.log(`${tarball.filename}: ${tarball.entryCount} files, all entrypoints present`)
