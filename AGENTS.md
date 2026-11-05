# AGENTS.md

OpenCode v2 plugin: `/hide-model` opens a dialog to mark chat models that should
disappear from the `/models` selector. OpenCode loads the TypeScript sources
directly — there is no build step.

## Entrypoints (`package.json` `exports`)

| Export | File | Role |
| ------ | ---- | ---- |
| `.` | `index.ts` | Server plugin (`id: hide-model`): storage, `ctx.model.transform`, RPC |
| `./tui` | `tui.tsx` | OpenTUI/Solid dialog (`id: hide-model-tui`) and `/hide-model` command |
| `./rpc` | `rpc.ts` | RPC contract (JSON Schema) + `unknown` normalizers |

OpenCode resolves the parts through `exports`; a new part must be added there (and
to `files` if it ships to npm). Parts load independently — the TUI cannot rely on
server modules being imported in the same process.

## Commands

```bash
bun install         # required before typecheck; installs the full tree (~356 pkgs)
bun run typecheck   # tsc --noEmit (same as: bun x tsc --noEmit)
npm pack --dry-run  # inspect the publish tarball (6 files incl. LICENSE)
npm publish         # requires `npm login`; prepublishOnly runs the typecheck
```

- No test, lint, formatter or CI setup exists. Do not invent them or claim they ran.
- The README "Verification" table is a historical manual log; no tests are committed.
- Local use: this directory is loaded from `~/.config/opencode/plugins/`; run
  `/reload` in OpenCode after edits. No compile/publish needed to test locally.
- Do not keep both the local directory and the npm package installed — OpenCode
  registers `hide-model` twice and the dialog toggles unpredictably.

## Release

- **The plugin must be published and installable via the command.** A change is only
  shippable when `npm publish` succeeds and both paths resolve:
  `opencode plugin add opencode-tui-model-hide` (registry) and
  `opencode plugin add rodabarbosa/opencode-tui-model-hide` (Git). Confirm the result
  with `opencode plugin list` showing `hide-model <version>`.
- Every release: bump `version` (`npm version patch --no-git-tag-version`), run
  `npm run typecheck` and `npm pack --dry-run` (6 files: sources, README, LICENSE), then
  `npm publish` after `npm login`. `prepublishOnly` enforces the typecheck.
- The published tarball must keep the `exports` for `.` / `./tui` / `./rpc`, the sources
  in `files`, and the `/** @jsxImportSource @opentui/solid */` pragma in `tui.tsx` — the
  installed TUI part does not load without the pragma.
- After installing from the registry or Git, remove the local copy from
  `~/.config/opencode/plugins/` so `hide-model` is not registered twice.

## How it works (easy to break)

- The server is the only thing that filters `/models`; the TUI just edits the list.
  `ctx.model.transform` runs again on every `ctx.model.reload()` and must stay
  idempotent.
- Hidden models are **disabled** (`target.enabled = false`), never removed with
  `editor.remove()` — removing breaks explicit `--model` resolution.
- The dialog catalog (`catalog = rows`) is captured **inside** the transform:
  `editor.list()` still contains disabled candidates, which is what keeps hidden and
  uninstalled-provider models listed and unmarkable. Moving that capture outside
  silently loses them.
- Storage key `hidden-models`, shape `{ hidden: ModelRef[] }` in `ctx.storage`.
  `ModelRef.modelID` is the catalog `model.id` (paired with `providerID`), not a
  provider-facing id; `keyOf()` builds `${providerID}/${modelID}`. Changing either
  orphans persisted entries.
- RPC replies arrive as `unknown`: always run `parseState` / `parseHidden`, never cast.
  Contract edits belong in `rpc.ts` JSON Schema **and** the normalizers together.

## TUI gotchas

- **`tui.tsx` line 1 must keep `/** @jsxImportSource @opentui/solid */`.** `tsconfig.json`
  is not shipped in the npm tarball, so the installed `./tui` part relies on the pragma to
  resolve the Solid JSX runtime; without it the import fails with
  `Cannot find module 'react/jsx-runtime'`. Any new file rendering OpenTUI primitives
  needs the same pragma.
- `context.ui.dialog.set({ size })` only applies to the **active** dialog: call it
  after `dialog.show()`, and again in `onMount` (see `tui.tsx:75`, `tui.tsx:174`).
  `xlarge` (116 cols) is the widest preset; the dialog cannot grow past it.
- Keys are handled by a `prependListener` on `context.renderer.keyInput`, not by the
  keymap layer: our renderable never gets dialog focus, so a mode layer loses to the
  prompt. Keep `preventDefault + stopPropagation` limited to recognized keys, and pass
  `release` as the dialog close callback so the listener is removed (including Esc and
  `/hide-model` toggling closed).
- Rows are sorted once by providerID → name → modelID; the provider grouping in the
  view must keep each row's **global index** (`entry.index`) — cursor, `reveal()` and
  `scrollChildIntoView` depend on it.
- Persistence is serialized through `queue` with last-write-wins; do not fire `set`
  calls in parallel.
- Heights/scroll are terminal-derived (`renderer.height`, ~78%), not fixed caps; keep
  the resize listener paired with its cleanup in the returned disposer.
- Colors follow the sibling `opencode-tui-model-price` dialog: obtain the theme with
  `theme().surface?.("dialog") || context.theme`, then use `text.selected` (cyan),
  `text.base` (white) and `text.muted` (gray) with those literal fallbacks; yellow
  marks the hidden state, `▶` + bold marks the cursor. `@opentui` 0.8 has no `bold`
  or `wrap` text props — use `attributes={TextAttributes.BOLD}` and `wrapMode="none"`.

## Conventions

- **English only** for every user-visible string: dialog labels, toasts, error
  messages, README. Code comments are English too.
- The user-facing command stays `/hide-model` (palette: "Hide models from /models").
  Never override, rename or hijack `/models` itself.
- IDs are intentionally separate: server `hide-model`, TUI `hide-model-tui`, RPC
  contract `hide-model`, row prefix `hide-model.row.`. Renaming one means updating
  every reference.
- Keep the README in sync when changing commands, keybindings, storage keys, plugin
  IDs or behavior — it is the only documentation and the installation/publishing guide.
