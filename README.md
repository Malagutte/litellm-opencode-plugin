# litellm-opencode-plugin

OpenCode plugin that shows how much of your LiteLLM key's budget you have used, right in the TUI
footer.

```
$3.96 / 13.2%
```

Amount spent in the current budget window / share of the key's `max_budget`, colour-coded: neutral
normally, warning from `warningPercent` (default 80), error at 100% or when LiteLLM blocks the key.

## What it does

- **Footer chip** in `prompt.footer.status` (sessions) and `home.footer.status` (home), next to
  OpenCode's own status indicators.
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
src/index.ts          server part: inert, loads the package through `plugins`
src/tui.tsx           TUI part: renders the chip, registers /spend, decides when to refresh
src/spend/tracker.ts  reactive chip state + refresh rules (no JSX)
src/spend/key-info.ts which proxy and key to use, the /key/info call, error kinds
src/spend/usage.ts    /key/info body -> snapshot, snapshot -> chip and dialog text
src/spend/options.ts  plugin options and their defaults
src/spend/json.ts     readers for untrusted JSON (config and network)
tests/                vitest suite for every module above
scripts/              version.mjs (version pattern), check-package.mjs (tarball guard)
.github/workflows/    ci.yml: install, typecheck, test, package check
opencode.jsonc        loads the plugin from this repo while developing
```

The package exports both parts:

```json
"exports": { ".": "./src/index.ts", "./tui": "./src/tui.tsx" }
```

OpenCode loads TypeScript and TSX directly, so there is no build step. `npm run typecheck` runs
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
is a semver pre-release, so `npm install litellm-opencode-plugin` will not resolve to it unless it is the only
published version — a publish step would need an explicit `--tag`.

### Squash merges

`master` only receives squash merges (repository settings: allow *Squash merging* only, and require
linear history so no merge commits can land). That shapes the version checks:

- **Pull requests**: CI checks the exact hash of the PR head commit, so run `npm run version:sync`
  before pushing to a branch.
- **Master**: the squash commit is created by GitHub at merge time, so its hash cannot be known when
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
| `tests/tracker.test.ts` | provider selection (selected model vs pinned), format option, success/failure transitions, quiet failures, dispose, cancellation of a superseded refresh |

The tracker tests use a fake TUI context (`tests/support/fake-context.ts`) and a stubbed `fetch`, so
nothing touches the network or a real proxy.

## CI

`.github/workflows/ci.yml` runs on every push to `master`/`main` and on every pull request, on the
Node version in `.nvmrc`:

1. version check — `version:check:exact` on pull requests, `version:check` on pushes (see above)
2. `npm ci`
3. `npm run typecheck`
4. `npm test`
5. `npm run check:package` — packs the tarball in dry-run mode and fails when an entrypoint
   (`src/index.ts`, `src/tui.tsx`, the modules behind them) would not ship.

Pull requests are checked out at `github.event.pull_request.head.sha` instead of the merge commit,
otherwise the exact version check could never pass; a push is checked out normally.

Reproduce the whole thing locally:

```sh
nvm use && npm ci && npm run typecheck && npm test && npm run check:package
```

## Develop locally

1. `npm install`
2. Run OpenCode in this repo — `opencode.jsonc` already loads `./`.
3. Select a model served through your LiteLLM proxy; the chip appears in the prompt footer and
   `/spend` opens the detail dialog.

Config and source are hot-reloaded; use `/reload` if something looks stale.

## Use in another project

Point `plugins` at this directory, an absolute path, or a `file://` URL:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/home/me/git/litellm-opencode-plugin"],
}
```

After publishing to npm, the entry becomes `"litellm-opencode-plugin"` or `"litellm-opencode-plugin@1.0.0-<hash>"`. Add
it to the global `~/.config/opencode/opencode.json` to have the chip everywhere.

## Troubleshooting

- **No chip**: the selected provider exposes no `baseURL`/`apiKey`, or its `<root>/key/info` is not
  a LiteLLM endpoint. Run `/spend` for the exact reason.
- **`LLM –`**: the lookup broke — proxy unreachable, revoked key, or an unexpected reply. Run
  `/spend` for the message.
- **No percentage**: the key has no `max_budget` in LiteLLM.
- **Stale number**: the proxy updates spend asynchronously; `/spend` forces a refresh.

Docs: <https://opencode.ai/docs/build/plugins>
