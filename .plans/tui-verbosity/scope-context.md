# Scope context — dsh-tui fork: user-configurable output-verbosity / quiet-mode (improvements #1–4)

## Why
The fork `@brianynwu/dsh-tui` (repo `/home/bwu/work/dsh-tui`, current pin `34dd9ec`) is the most capable of
three scout TUI candidates at hiding model output, but has gaps a comparison exposed. Add four accepted
improvements so a user can make the TUI quiet (hide the vast majority of reasoning + tool calls/outputs/file
content/diffs) with a PERSISTENT default and better ergonomics. This is a change to the FORK repo (a separate
git repo), followed by a Foundry-side re-pin.

The accepted improvements (a 5th — per-tool-kind granularity — was explicitly REJECTED as disproportionate;
the atomic tool card is the right unit — do NOT design it):
1. **Config default for tool-card visibility.** Add a config field so the startup tool-card visibility is
   configurable (today it is hardcoded `collapsed`). Lets a deployment launch straight into a quiet view.
2. **One-shot "focus/quiet" preset.** A `/quiet` slash command and/or a single keybind that sets reasoning
   off + tool cards hidden together (today: 3 keypresses across two controls), with an inverse to restore.
   Pairs with a config startup default (an umbrella `startupView: full|quiet`, or composed from the
   per-dimension fields — a DESIGN CHOICE, see Open Questions).
3. **Reasoning preview/fold middle state.** Reasoning is currently BINARY (full or hidden). Add a
   collapsed-preview middle state (a 1–3 line preview that expands), mirroring the tool-card 3-state model
   and the two rival TUIs' reasoning previews.
4. **On-demand detail overlay.** A read-only overlay that browses one (or all) tool card's FULL output/diff
   WITHOUT flipping the global tool-card visibility — so the transcript stays quiet but detail is one keypress
   away. Borrowed from tomowang/dsh-tui's Tool Cards / `/trajectory` overlay.

## Current fork architecture (source facts — the planners are tool-free; everything they need is here)

### Config
- `src/config.ts`: `TuiConfig` interface + schemastery `Config` schema + `resolveTuiConfig(config)` →
  `ResolvedTuiConfig`. Existing display fields: `showReasoning` (z.boolean, default **true**, line 71);
  `maxToolOutputLines` (z.number min 1, default **6**, line 72); `maxDiffEditLength` (default 1000, a diff
  DERIVATION cost clamp, not a display toggle). A new field is added in THREE places: the `TuiConfig`
  interface, `tuiConfigSchemaFields` (also referenced by the plugin `Config` schema), and `resolveTuiConfig`'s
  returned object + `ResolvedTuiConfig`. A field with a schema default is TRANSPARENT to a stock deployment
  (no behavior change unless set).
- Config reaches the renderer at `src/index.ts:305` `const resolved = resolveTuiConfig(config)`.

### Reasoning rendering (binary today)
- Settled: `assistantMessageChildren(content, showReasoning, …)` at `src/components/transcript.ts:197`:
  computes `reasoning = textBlocks(content,'reasoning')`, and when `showReasoning` renders a dim italic
  "Reasoning" header + the FULL `new Markdown(reasoning,…)` (lines 210-216). Binary: full block or nothing.
- Streaming: `StreamingAssistantComponent` holds `showReasoning` (transcript.ts:296) and
  `setShowReasoning(show)` (transcript.ts:359) rebuilds; the live path also renders reasoning.
- A reusable head/omit helper already exists: `preview(lines, limit, omitted)` at
  `src/components/xml-tool-output.ts:115` (used by tool cards). A reasoning fold can reuse this shape.
- The startup value: `src/index.ts:344` `let showReasoning = resolved.showReasoning` (config-seeded).

### Tool-card rendering + visibility (3-state, runtime-only default)
- `ToolCardVisibility = 'hidden' | 'collapsed' | 'expanded'` (transcript.ts:425). ALL tool traffic — args,
  result, file reads, diffs, command output — renders inside `ToolCardComponent` (transcript.ts:462).
  `hidden` renders `[]` (nothing, transcript.ts:530); `collapsed` shows a `preview(body, maxOutputLines,…)`
  head/tail (transcript.ts:577); `expanded` shows the full body.
- Startup value is HARDCODED: `src/index.ts:347` `let toolsVisibility: ToolCardVisibility = 'collapsed'`
  (NOT config-seeded — this is the #1 gap). `setToolsVisibility(next)` (index.ts:1289) applies to all cards
  and, on `hidden`, folds each turn's steps into one assistant message (`applyTurnFolding`, index.ts:1297)
  → a true conversation-only view. Context cards never fully hide (index.ts:1293).

### Existing runtime controls (the composition surface #1–3 must integrate with)
- **Ctrl+O** → `toggleTools()` cycles collapsed→expanded→hidden (index.ts:1301, key at 1831).
- **Ctrl+R** → `toggleReasoning()` toggles showReasoning (index.ts:1323, key at 1835).
- **`/details [collapsed|expanded|hidden] [reasoning on|off]`** slash command (`runDetails` index.ts:1353,
  registered index.ts:1568). No-arg opens `DetailsDialog`.
- **`DetailsDialog`** (`src/components/dialogs.ts:444`): a 2-entry `SelectList` (Tool cards | Reasoning); Tab
  cycles the highlighted entry and applies immediately. Tool cards cycles the 3 phases
  (`TOOL_CARD_PHASES = ['collapsed','expanded','hidden']`, dialogs.ts:436); Reasoning is BINARY
  (`reasoningLabel()` shown/hidden). `DetailsSelection = { visibility, showReasoning }` (dialogs.ts:431).
  Opened via `overlayManager.open(...)` (index.ts:1330).
- Help line documents `Ctrl+O cycle cards • Ctrl+R toggle reasoning • Ctrl+L redraw` (index.ts:1391).

### Overlay infrastructure (for #4)
- `src/extension/overlay-manager.ts`: `OverlayManager.open(request, placement)` →
  `TuiOverlaySession` (line 179); `openOverlay(request)` (line 362). DetailsDialog is already an overlay
  Component. A new detail-browser overlay would be a Component opened through this manager. Note **Ctrl+O is
  already bound** (tool cycle) — a new overlay needs its own key/command (tomowang uses Ctrl+O for its
  overlay, but here that is taken).

### Tests
- Fork uses **vitest**; specs in `test/` (dashboard/editor/layout/latex/stream/timing/tokens-usage/
  model-context/prompt-metrics/resume-*). New specs needed for: config default seeding, `/quiet` +
  inverse, reasoningFold 3-state (config + Ctrl+R + DetailsDialog), the detail overlay. `test/config.*`
  or a new spec; follow the existing style (independent construction, assert render output).
- Build must stay reproducible (`npm ci && npm run build` → byte-identical `lib/`); the Foundry doctor pins
  `sha256(lib/index.js)`.

### Foundry-side coupling (post-merge re-pin — name it in the plan, do NOT implement in the fork cycle)
- The fork is consumed by git-SHA pin. On merge, bump `TUI_PIN_SHA` (doctor.sh:57) and `_TUI_PIN_SHA`
  (tests/test_orch.py:35), README/design, and reinstall the tui profile. A new config field with a schema
  DEFAULT needs NO cordis.patch.yml change UNLESS Olympus wants a non-default (e.g. quiet-by-default) as the
  Olympus profile default — that is an operator/product choice, NOT forced by this cycle. Note: a cordis
  `--patch` on the tui row REPLACES the whole config block, so if Foundry sets ANY new field it must restate
  the fields it wants (schema defaults otherwise apply for unset fields).

## Open design questions (the genuinely-contested space — resolve with a coherent model)
1. **Composition model.** Do #1 + #2 + #3 unify under ONE umbrella `startupView: 'full' | 'quiet'` (a preset
   that seeds both dimensions), or per-dimension config fields (`toolCardVisibility`, `reasoningFold`) PLUS a
   `/quiet` command that sets them, or BOTH (fields for precise control + a preset command as a shortcut)?
   What is the smallest coherent surface that isn't redundant?
2. **`reasoningFold` vs the existing `showReasoning`.** `reasoningFold: off|preview|full` supersedes the
   binary `showReasoning` (default true = `full`). How to migrate: deprecate/alias `showReasoning`, keep both,
   or map `showReasoning:false → off`, `true → full` and make `preview` the new opt-in? Ctrl+R currently
   toggles binary — does it now cycle 3 states, or toggle full↔off with preview only via config/`/details`?
   The `DetailsSelection`/`DetailsDialog` reasoning entry must change from binary to 3-phase to match.
3. **Quiet-preset semantics.** Exactly what does `/quiet` set (reasoning `off` + tools `hidden`?), what is
   its inverse (restore the config defaults, or a fixed `full`+`collapsed`?), and is it also a keybind (which
   free key — Ctrl+O/R/L/E are taken)? Does it persist for the session only, or is `startupView` the persist
   path?
4. **Detail-overlay scope + entry.** Does the overlay browse ALL tool cards (a scrollable list like
   tomowang's) or the currently-selected/last card? What key/command opens it (Ctrl+O is taken)? Read-only
   navigation only (no transcript mutation). Reuse `OverlayManager` + a new Component.
5. **Sequencing.** #1 is tiny and independent; #4 is the largest (new component). Can these ship as separate
   commits/PRs within one branch, or is a combined coherent config model a prerequisite that forces order
   (#1/#3 config model → #2 preset → #4 overlay)?

## Proof / acceptance
- Fork: `npm ci && npm run build` reproducible; `npx vitest run` green incl. new specs; typecheck clean.
- Attended live-verify (the fork's real terminal — no gate reproduces render/TTY): quiet default at boot,
  `/quiet` + inverse, reasoning preview↔full↔off, the detail overlay open/scroll/close, all cleanly.
- Foundry re-pin: doctor 8/8 at the new sha; `uv run pytest` (full) green; the pin bump in both files.

## Anti (shortcuts that fake success)
- Do NOT add a redundant second control that duplicates an existing one (e.g. a config field AND a preset
  AND a keybind all doing the same thing with divergent semantics) — pick the minimal coherent set.
- Do NOT leave `showReasoning` and `reasoningFold` both live with conflicting meaning.
- Do NOT make a new config field change stock (unset) behavior — schema defaults must preserve current output.
- Do NOT implement the Foundry re-pin inside the fork cycle; name it as the follow-on.
- Do NOT design per-tool-kind / input-vs-output granularity (rejected).

## Bounds / non-goals
- In: the fork repo's config + render + runtime-control + overlay + tests, for improvements #1–4. A named
  (not implemented) Foundry re-pin follow-on.
- Out: the rejected #5; the dsh-tui web/headless profiles; the persistence writer/decoder; the black-band
  herdr issue (upstream); anything outside display verbosity.
- §2.6 proportionality: #4 (overlay) is the largest — keep it minimal (reuse OverlayManager); if its cost
  outweighs benefit, the plan may stage it last or flag it for an operator go/no-go.

## Environment
- Window = Claude → Codex auditor for plan-review + diff-review (`python -m tools.review.codex_audit --repo
  /home/bwu/work/dsh-tui`, self-affirm sha). Independence computed on the REFINED plan author.
- Fork branch off `/home/bwu/work/dsh-tui` `main` (@ `34dd9ec`). Foundry re-pin is a separate follow-on cycle.
