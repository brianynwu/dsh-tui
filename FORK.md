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

## pi-tui 0.85 capability adoption (2026-09-09) — alt-screen + scroll + mouse + LaTeX

Adopts the 0.85 capabilities the pinned pi-tui 0.85.1 exposes (previously bumped-but-unused). Version →
`0.1.5-revive.0`.

- **Alternate-screen renderer** (`src/index.ts`, `src/chat/layout.ts`): swapped `TuiMainScreen` →
  `TuiAltScreen({mouse:true, wheelScrollLines:3, copyOnSelect:true})`. The TUI now owns a full-screen,
  self-scrolling, mouse-aware viewport (wheel scroll, drag-select/copy, transcript search) instead of relying
  on the terminal's native scrollback. `setClearOnShrink` dropped — it is read only by `TuiMainScreen`, never
  by `TuiAltScreen`.
- **`setLayoutRoot` tree** (`src/chat/layout.ts` `buildTuiLayout`): the flat `ui.addChild(...)` stack became a
  single `VStack`. Flow content (header, transcript, spacer, todo, compaction) lives in the SOLE primary
  `ScrollView` (`follow:'end'`); the live input surface (prompt, inline-modal mount, editor) is pinned. The
  scroll region is the only grow+shrink entry; pinned entries are `shrink:0` so a long transcript can never
  clip the editor/prompt/modal. `chat` stays transcript-only (todo/compaction are separate `scrollBody`
  siblings), so its in-place `children` mutations keep their index meaning.
- **Home/End belong to the editor** (`freeEditorHomeEnd`): `TuiAltScreen` registers its viewport input
  listener in its ctor, and `TuiBase.handleTerminalInput` runs listeners before the focused component — so the
  default `tui.altScreen.top`/`bottom` (= `home`/`end`) would steal the editor's line-start/line-end. They are
  unbound (merge-preserving); PageUp/PageDown/wheel still scroll. ctrl+home/ctrl+end are also editor-bound, so
  unbinding — not remapping — is the only conflict-free fix.
- **Clean stop semantics**: every `ui.stop()` (shutdown, start-failure abort, resume handoff) passes
  `{preserveScreen:true}` — the default stop dumps the ENTIRE rendered transcript into the shell's normal
  buffer (`ScrollView.render` is unclipped), and the launcher already captures the session, so the dump is
  suppressed. **The two shell-return sites (shutdown, start-failure) then emit `\x1b[0m`**: `preserveScreen`
  is pi-tui's hand-off-to-successor path and skips the SGR reset, and `\x1b[?1049l` does not restore graphic
  rendition across the buffer switch — so without it the alt-screen's themed background leaks into the shell
  as a black band (attended-live-verify catch, 2026-09-09). `stop()` already restores mouse/autowrap/
  bracketed-paste/kitty/cursor/raw and disables `?2031`; SGR is the sole residual. Resume keeps bare
  `preserveScreen` (the re-exec'd successor repaints).
- **LaTeX renders via the platform** — pi-tui 0.85.1's `Markdown` component already tokenizes/renders LaTeX by
  default (`renderLatex ?? raw` fallback; code/currency/env-var guards built in), and the transcript adds no
  `renderLatex:false` override. NO custom scanner is added; the exported `assistantTextMarkdown` helper is the
  transcript's render seam, and `test/latex.test.ts` drives it (the SHIPPED construction) to pin the floor:
  math renders to Unicode, unsupported falls back to the COMPLETE raw source, currency/env/inline+fenced code
  stay literal.
- **Deferred**: multi-pane (VStack/HStack) layout — revisit once this ships and a concrete layout need exists.

`lib/` rebuilds byte-identically (`npm ci && npm run build`); `sha256(lib/index.js)` = `418dc631…`. vitest
27/27 (editor 10, layout 7, latex 10 — exact-equality render/floor gates). Attended live-verify gates the merge.

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

## pi-tui 0.85.1 bump (`v0.1.4-revive.0`)

Bumps the bundled `@earendil-works/pi-tui` devDep `0.80.7 → 0.85.1` (realigning onto the pi 0.85 line). The
migration surface is two edits, both in `src/index.ts`, proven by `tsc` against the pinned 0.85.1 types:

- **`TUI` → `TuiMainScreen`.** 0.85 made `TUI` an interface (was a concrete class); the instantiable
  regular-screen renderer is now `TuiMainScreen` (ctor `(terminal, showHardwareCursor?, logDirectory?)`, a
  superset of the prior 2-arg call). Every method used is preserved on the interface; `type TUI` imports
  (e.g. `src/chat/resume.ts`) stay valid.
- **`ui.setClearOnShrink(true)`.** 0.85.0 removed pi-tui's env-var defaults and flipped the `clearOnShrink`
  default `true → false`; the explicit call preserves the prior transcript shrink-clear behavior.

pi-tui 0.85.1's own deps (`get-east-asian-width` 1.6.0, `marked` 18.0.5) are unchanged from 0.80.7 and are
already this package's direct deps — no new transitive surface. The **vendored editor stays**: 0.85.1 still
ships `EditorOptions = {paddingX?, autocompleteMaxVisible?}` with no prompt/frame/`setPrompt`, so there is
nothing to un-vendor. New `lib/` baseline hash `83b6a071…` (bundled pi-tui changed — the byte-identical
invariant re-anchors here; a fresh `npm ci && npm run build` reproduces it). vitest 10/10. No pi-tui
capability (alt-screen, ScrollView, mouse, LaTeX, flex layout) is adopted in this release — that is separate
follow-on work.

This release also completes the `@brianynwu` rescope the npm publish (`0.1.3-revive.3`) left half-done: the
bundle's own `cordis.patch.yml` loader-entry imports (and the `@module` doc comments + README titles) still
named `@dsh-tui/dsh-tui`, so the cordis loader hit `ERR_MODULE_NOT_FOUND` once a consumer installed the
renamed package. They now name `@brianynwu/dsh-tui`. (Caught only at attended live-verify — typecheck and
vitest both passed; the baseline above is the post-fix bundle.)

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
