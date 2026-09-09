# Fork notes — revived `@dsh-tui/dsh-tui`

This is a maintained fork of **`@dsh-tui/dsh-tui` v0.1.2** (`github.com/dsh-tui/dsh-tui`), itself the
MIT-licensed republish of the **original first-party `@deepseek-ai/dsh-tui`** recovered from the
deepseek-harness repository history (see `LICENSE`). DeepSeek later dropped the terminal TUI from the
monorepo in favor of the web UI; this line revives the terminal front-door.

## Why this fork exists

The community successor `@deepseek-harness-tui/dsh-tui` (a pi-Ink port) changed `/model` swaps to **fork the
session** on every switch (pi-agent-core `Session Tree` semantics). That is incompatible with dsh-core /
Olympus, whose model swap is **in-place** (`session.selectModel` / a `ModelSelectionRef` mutation, same
session continues). This fork keeps the original's dsh-core-native **in-place** model selection
(`src/chat/model-command.ts`: mutates `target.current`, "New steps will use it", no fork/reseed) and is an
**in-process cordis `--profile` bundle** — so it composes with a launcher's `--patch` overlays natively.

## Changes vs upstream v0.1.2

- `package.json`: version → `0.1.3-revive.0`; widened all 25 `@deepseek-ai/dsh-*` peer ranges from
  `^0.1.0-rc.6` to `^0.1.0-rc.6 || ^0.1.1-rc.1` so they resolve against the current dsh-core `0.1.1-rc.2`
  (the upstream caret does not span prereleases across patch tuples — the same reason the pi TUI enumerates
  versions; verified with node-semver).

## Rebuildable-compatibility patch (2026-09-09) — supersedes the "static" note below

The revive shipped a prebuilt `lib/` but NOT a buildable source tree, and its `src` was NOT actually
compatible with the pinned base. This patch makes the fork rebuild deterministically against
`@deepseek-ai/*@0.1.1-rc.2`:

- **`ctx.commands.execute` arg fix** (`src/index.ts`): pinned `@deepseek-ai/dsh-commands@0.1.1-rc.2` is
  `execute(agentId, line, images, signal?)` (4 args); the revive passed 3 → `signal` undefined →
  `signal.aborted` threw on EVERY slash command. Now `execute(agent, text, [], controller.signal)`. The arg
  shape is enforced by `tsc` against the pinned `dsh-commands` types, so a regression is a build error.
- **Vendored Editor** (`src/vendor/editor.ts`): the revive's renderer is NOT self-contained — it extends
  `@earendil-works/pi-tui`'s `Editor`, and the frameless prompt-gutter model it uses came from a **pnpm-patched
  pi-tui 0.80.7 that was never published** (published 0.80.7 dropped `prompt`/`frame`/`setPrompt`). That patched
  Editor is now vendored (reconstructed as TS from this package's own MIT bundle), so the fork depends only on
  pi-tui 0.80.7's still-published primitives. See its header for KNOWN pre-existing (faithfully-carried) issues.
- **Committed build config the revive omitted**: `tsconfig.json` (`emitDeclarationOnly`+`declarationMap` →
  `lib/types`), `tsconfig.typecheck.json` (`noEmit` typecheck — TS rejects `--noEmit` with `emitDeclarationOnly`),
  `tsdown.config.ts` (4 ESM `.js` entries → `lib/`, bundle pi-tui, externalize `@deepseek-ai/*`). `npm run build`
  now cleans + regenerates `lib/` from `src/`.
- **Deterministic base pin**: `package.json` `overrides` + a committed `package-lock.json` (a fresh npm resolve
  floats the base off `0.1.1-rc.2`). Proven: a fresh clone + `npm ci` + `npm run build` regenerates `lib/`
  byte-identically.
- **Render regression tests** (`test/editor.test.ts`).

## Editor-hardening pass (2026-09-09, `v0.1.3-revive.2`)

Fixes the three pre-existing upstream editor defects the rebuildable-compat patch above carried faithfully as
recorded debt (all interactive-editor only; `src/vendor/editor.ts`, with a vitest regression per defect):

- **D1 — undo now snapshots paste metadata.** The undo stack stores an `UndoSnapshot` (`state` + `pastes` +
  `pasteCounter`), not bare `EditorState`, so `undo()` no longer restores a `[paste #N ...]` marker whose
  backing content was dropped (which `getExpandedText()` would then yield as the raw marker).
- **D2 — `handleBackspace` renumbers paste ids order-independently.** It rebuilds `this.pastes` from a
  snapshot, then rewrites marker ids in the text as a pure transform — a text-order walk can no longer
  overwrite a not-yet-read entry when markers appear in non-ascending id order.
- **D3 — the autocomplete request chain tolerates rejection.** A rejected/aborted provider call is caught at
  the serialized-chain boundary, so it neither poisons the next request (`await previousTask`) nor escapes as
  an unhandled rejection.

`lib/` is unchanged from `16a33a8` (byte-identical); this release adds only the version bump + these notes.

## ~~Verified compatible with current dsh-core `0.1.1-rc.2` (static, 2026-09-08)~~ — SUPERSEDED

This earlier static review was INCOMPLETE and partly WRONG. It checked only the model-controller path and
claimed the "renderer is self-contained … no pi" — but the renderer extends `@earendil-works/pi-tui`'s
`Editor`, and a full typecheck against `0.1.1-rc.2` found the `commands.execute` skew it missed. The
rebuildable-compatibility patch above replaces it with a full typecheck + a byte-identical clean-room rebuild.

## Publish / identity (`v0.1.3-revive.3`)

Rescoped and published to npm as **`@brianynwu/dsh-tui`** (`0.1.3-revive.3`). The upstream name
`@dsh-tui/dsh-tui` is owned by another maintainer (`thomaslwang` on npm), so it cannot be republished
there — this line owns its own scope (`@brianynwu`, `publishConfig.access: public`). The `lib/` is
byte-identical to `v0.1.3-revive.2`; this release changes only the package identity (name + version) and
these notes. Foundry consumes the fork by git-SHA pin (rebuildable, live-verified) and does not depend on
the npm publish; the registry copy is for external/registry-based consumers.
