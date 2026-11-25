# litellm-opencode-plugin

OpenCode plugin that shows how much of your LiteLLM key's budget you have used, right in the TUI
footer.

```
$3.96 / 13.2%
```

Amount spent in the current budget window / share of the key's `max_budget`, colour-coded: neutral
normally, warning from `warningPercent` (default 80), error at 100% or when LiteLLM blocks the key.

## What it does

- **Terminal**: footer chip in `prompt.footer.status` (sessions) and `home.footer.status` (home),
  next to OpenCode's own status indicators.
- **Desktop**: a button in the session header, beside the context toggle, showing the same number and
  opening the same `/spend` details.
- **`/spend` command** (also in the command palette as "LLM spend") opens a dialog with spend,
  budget, remaining, window, reset date, key alias, state and last update.
- **Follows your model**: it reads the provider of the model selected in the prompt, so switching
  models switches the chip. Providers without a LiteLLM `/key/info` endpoint show no chip.
- **Refresh** every `refreshIntervalSeconds` (default 300), on model switch, and ~5s after a turn
  ends, so the number follows what you just spent.

## Where the numbers come from

`GET <proxy-root>/key/info` on your LiteLLM proxy, authenticated with the virtual key itself
(a virtual key may read its own info; no master key needed). Proxy root and key come from the
OpenCode provider you already configured, so there is no second credential to manage:

```
selected model        -> providerID      e.g. litellm
provider.settings     -> baseURL         e.g. https://litellm.example.com/v1
                                         proxy root: https://litellm.example.com
provider.settings     -> apiKey          Bearer token for GET /key/info
```

Fields used: `info.spend`, `info.max_budget`, `info.budget_duration`, `info.budget_reset_at`,
`info.key_alias`, `info.blocked`. Keys without a budget still show the amount, without a
percentage.

## Options

All optional; passed in the object form of the `plugins` entry in `opencode.json(c)`:

| Option | Default | Meaning |
| --- | --- | --- |
| `provider` | selected model's provider | Pin one provider instead of following the model |
| `format` | `both` | `both` → `$3.96 / 13.2%`, `amount` → `$3.96`, `percentage` → `13.2%` |
| `refreshIntervalSeconds` | `300` | Background refresh period (minimum 15) |
| `warningPercent` | `80` | Percentage from which the chip turns warning-coloured |
| `baseUrl` | provider's `baseURL` | Override the proxy root |
| `apiKey` | provider's `apiKey` | Override the virtual key |

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "litellm-opencode-plugin",
      "options": { "format": "both", "warningPercent": 80 },
    },
  ],
}
```

## Layout

```
src/index.ts          server part: serves SpendRpc.read, hides the virtual key
src/rpc.ts            SpendRpc: the contract between the server part and its clients
src/tui.tsx           TUI part: renders the chip, registers /spend, decides when to refresh
src/gui.tsx           Desktop part: session-header button + /spend, a thin SpendRpc client
src/spend/chip.ts     shared core: provider -> chip text, level and dialog body
src/spend/tracker.ts  the TUI's reactive chip and refresh rules (no JSX)
src/spend/key-info.ts which proxy and key to use, the /key/info call, error kinds
src/spend/usage.ts    /key/info body -> snapshot, snapshot -> chip and dialog text
src/spend/options.ts  plugin options and their defaults
src/spend/json.ts     readers for untrusted JSON (config and network)
vite.config.ts        builds the Desktop bundle
tests/                vitest suite for every module above
scripts/              version.mjs (version pattern), check-package.mjs (tarball guard)
.github/workflows/    ci.yml (checks), publish.yml (npm releases)
LICENSE               MIT
opencode.jsonc        loads the plugin from this repo while developing
```

The package exports every part:

```json
"exports": {
  ".": "./src/index.ts",
  "./tui": "./src/tui.tsx",
  "./rpc": "./src/rpc.ts",
  "./gui-experimental": "./dist/gui-experimental.cjs"
}
```

The terminal and server parts are TypeScript that OpenCode loads directly. The Desktop part is the
one generated artifact: the app loads no TypeScript, so `npm run build:gui` writes the CommonJS
bundle that `./gui-experimental` points at. Build it once after cloning; `npm run typecheck` runs
`tsc --noEmit` for editor/type safety only.

## Versioning

Every commit is versioned `<BASE_VERSION>-<short commit hash>`, currently `1.0.0-9f3c1ab`:

```sh
npm run version:print        # the version this commit would get
npm run version:sync         # write it into package.json
npm run version:check        # fail unless package.json is 1.0.0-<hex> shaped
npm run version:check:exact  # fail unless it matches the current HEAD hash
```

`BASE_VERSION` lives in `scripts/version.mjs`; bump it (e.g. to `1.1.0`) in a pull request. The result
is a semver pre-release: it never satisfies a `^1.0.0` range, so it is published under the `next`
dist-tag and a stable release needs a version without the hash.

### Squash merges

`main` only receives squash merges (repository settings: allow *Squash merging* only, and require
linear history so no merge commits can land). That shapes the version checks:

- **Pull requests**: CI checks the exact hash of the PR head commit, so run `npm run version:sync`
  before pushing to a branch.
- **`main`**: the squash commit is created by GitHub at merge time, so its hash cannot be known when
  the pull request is written. CI therefore only checks the `1.0.0-<hex>` shape there, and the
  committed version describes the commit the change was authored on — one commit behind `HEAD` by
  construction.

First push after cloning the repository: the initial commit has no version yet, so run
`npm run version:sync` after it and commit the result.

## Tests

Vitest needs Node 18+; the default shell Node 14 cannot run it. `.nvmrc` pins 22, so:

```sh
nvm use            # picks up .nvmrc
npm test           # single run
npm run test:watch # watch mode
```

| File | Covers |
| --- | --- |
| `tests/json.test.ts` | the defensive JSON readers |
| `tests/options.test.ts` | defaults, trimming, clamping (refresh interval, warning percent, format) |
| `tests/key-info.test.ts` | proxy-root normalisation, target resolution, HTTP status → error kind, abort passthrough, quiet-vs-visible predicate |
| `tests/usage.test.ts` | `/key/info` parsing (wrapped/unwrapped, soft budget, blocked, no budget, thresholds) and chip/dialog formatting |
| `tests/chip.test.ts` | the shared core: provider choice, pinned option, snapshot→chip text/level, failure keeping the last good number, quiet non-LiteLLM providers |
| `tests/tracker.test.ts` | provider selection (selected model vs pinned), format option, success/failure transitions, quiet failures, dispose, cancellation of a superseded refresh |

The tracker tests use a fake TUI context (`tests/support/fake-context.ts`) and a stubbed `fetch`, so
nothing touches the network or a real proxy.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request, on the
Node version in `.nvmrc`:

1. version check — `version:check:exact` on pull requests, `version:check` on pushes (see above)
2. `npm ci`
3. `npm run build:gui` — writes `dist/gui-experimental.cjs`, the Desktop bundle
4. `npm run typecheck`
5. `npm test`
6. `npm run check:package` — packs the tarball in dry-run mode and fails when an entrypoint
   (`src/index.ts`, `src/tui.tsx`, `dist/gui-experimental.cjs`, the modules behind them) would not
   ship.

Pull requests are checked out at `github.event.pull_request.head.sha` instead of the merge commit,
otherwise the exact version check could never pass; a push is checked out normally.

Reproduce the whole thing locally:

```sh
nvm use && npm ci && npm run typecheck && npm test && npm run check:package
```

## Publishing

`.github/workflows/publish.yml` runs manually (`workflow_dispatch`) and uses npm **trusted
publishing** (OIDC): the job asks for `id-token: write` and npm exchanges it for a short-lived token,
so there is no `NPM_TOKEN` secret to leak.

| What it publishes | Dist-tag | How users install it |
| --- | --- | --- |
| `1.0.0-<short hash>` computed from `HEAD` at publish time | `next` | `npm install litellm-opencode-plugin@next` |
| whatever you type in the `release` input, e.g. `1.0.0` | `latest` | `npm install litellm-opencode-plugin` |

The version is written inside the job with `npm version --no-git-tag-version`, so the tarball carries
its own commit hash and no bot commit lands on `main`. `prepublishOnly` re-runs typecheck, tests and
the tarball guard, so a broken package cannot be published even by hand.

One-time setup on npmjs.com: the package's *Settings → Trusted Publisher* → GitHub Actions, with
repository `Malagutte/litellm-opencode-plugin`, workflow `publish.yml` and no environment. Until that
entry exists, publish once by hand (`npm publish --access public --tag next`) and attach it afterwards.

## Develop locally

1. `npm install`
2. `npm run build:gui` — the Desktop part is a prebuilt bundle; `npm run build:gui -- --watch`
   rebuilds it on every save and reloads it in the running app
3. Run OpenCode in this repo — `opencode.jsonc` already loads `./`.
4. Select a model served through your LiteLLM proxy; the chip appears in the prompt footer (terminal)
   or as a pill above the composer (Desktop), and `/spend` opens the detail dialog.

Server and terminal code is hot-reloaded; use `/reload` if something looks stale.

## Desktop

The Desktop app loads only the GUI part, so the terminal chip never appears there — that is why the
package ships `./gui-experimental` (built by `vite.config.ts` into `dist/gui-experimental.cjs`).

- The button sits in the session header, next to the app's context toggle. It follows the model of the
  session you are in; when the header is compact it becomes an icon with the number as its tooltip.
- `/spend` opens the app's own dialog with the same body the terminal shows.
- The window never sees the virtual key: it calls `SpendRpc.read` and the **server part** does the
  provider lookup and the `/key/info` request.
- The plugin is listed under *Settings → Extensions → Plugins*, where it can be switched off.
- A local directory needs `dist/gui-experimental.cjs` to exist before the app loads it, hence step 2
  above; an installed package gets it from the tarball.

## Install

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["litellm-opencode-plugin@next"],
}
```

Published builds are pre-releases (`1.0.0-<short hash>`), so ask for `@next` or pin an exact version.
A bare `litellm-opencode-plugin` only resolves once a stable version such as `1.0.0` has gone to
`latest` (see [Publishing](#publishing)).

Put the entry in the global `~/.config/opencode/opencode.json` to have the chip in every project, or
in a project's `opencode.jsonc` to scope it. Config changes apply without a restart.

### From a local checkout

Point `plugins` at this directory, an absolute path, or a `file://` URL:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/home/me/git/litellm-opencode-plugin"],
}
```

## Troubleshooting

- **No chip**: the selected provider exposes no `baseURL`/`apiKey`, or its `<root>/key/info` is not
  a LiteLLM endpoint. Run `/spend` for the exact reason.
- **No button in Desktop**: check *Settings → Extensions → Plugins* — a local checkout without
  `dist/gui-experimental.cjs` (`npm run build:gui`) has nothing for the app to load.
- **`LLM –`**: the lookup broke — proxy unreachable, revoked key, or an unexpected reply. Run
  `/spend` for the message.
- **No percentage**: the key has no `max_budget` in LiteLLM.
- **Stale number**: the proxy updates spend asynchronously; `/spend` forces a refresh.

Docs: <https://opencode.ai/docs/build/plugins>

## Licence

MIT — see [LICENSE](LICENSE). Not affiliated with, or endorsed by, LiteLLM or OpenCode.
