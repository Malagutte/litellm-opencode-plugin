/**
 * Version pattern: `<BASE_VERSION>-<short commit hash>`, e.g. `1.0.0-9f3c1ab`.
 *
 *   npm run version:print        print the version HEAD would get
 *   npm run version:sync         write that version into package.json
 *   npm run version:check        fail unless package.json is `1.0.0-<hex>` shaped
 *   npm run version:check:exact  fail unless it matches the current HEAD hash
 *
 * `--exact` matters because a squash merge on main creates a new commit at
 * merge time: the version committed in a pull request can only ever describe
 * the commit the change was authored on, so the default branch checks the shape only.
 */

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const BASE_VERSION = "1.0.0"

const PACKAGE_PATH = fileURLToPath(new URL("../package.json", import.meta.url))
const VERSION_PATTERN = new RegExp(`^${escapeRegExp(BASE_VERSION)}-[0-9a-f]{7,}$`)

const args = new Set(process.argv.slice(2))
const mode = pickMode(args)

const expected = `${BASE_VERSION}-${shortHash()}`

if (mode === "print") {
  console.log(expected)
} else if (mode === "sync") {
  sync()
} else {
  check({ exact: args.has("--exact") })
}

function pickMode(args) {
  const requested = ["sync", "check"].filter((name) => args.has(`--${name}`))
  if (requested.length > 1) fail("Use only one of --sync or --check.")
  return requested[0] ?? "print"
}

function sync() {
  const pkg = readPackage()
  if (pkg.version === expected) {
    console.log(`package.json already says ${expected}`)
    return
  }

  pkg.version = expected
  writeFileSync(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`package.json version set to ${expected}`)
}

function check({ exact }) {
  const current = readPackage().version

  if (current === expected) {
    console.log(`version ${current} matches HEAD`)
    return
  }

  if (exact) {
    fail(`package.json says ${current}, but this commit is ${expected}.\nRun "npm run version:sync" and commit the result.`)
  }

  if (!VERSION_PATTERN.test(current)) {
    fail(`package.json says ${current}, which is not ${BASE_VERSION}-<short hash>.\nRun "npm run version:sync" and commit the result.`)
  }

  console.log(`version ${current} has the ${BASE_VERSION}-<short hash> shape (HEAD is ${expected})`)
}

function readPackage() {
  return JSON.parse(readFileSync(PACKAGE_PATH, "utf8"))
}

function shortHash() {
  try {
    const hash = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return hash.trim()
  } catch {
    fail("Cannot read the current commit: run this inside the repository, after at least one commit exists.")
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
