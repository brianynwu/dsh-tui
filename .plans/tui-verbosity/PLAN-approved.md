# Plan (refined, round 1) — dsh-tui fork: configurable verbosity + `/quiet` + reasoning fold + detail overlay

Base: the Fable plan, refined by the operator's dual-planner selections and the GPT plan's contract points.
Author: orchestrator consolidation (Claude) → auditor is Codex (vendor complement). Improvements #1–4 in the
FORK repo `/home/bwu/work/dsh-tui` off `main` @ `34dd9ec`; Foundry re-pin is a named follow-on.

## Operator selections (settled — do not re-open)
- **Reasoning states = distinct `off | preview | full`** (a reasoning-specific enum; the underlying 3-phase
  cycle MECHANISM may be shared internally, but the user-facing names + config values are off/preview/full).
- **`/quiet off` restores the PRIOR view** (a remembered snapshot), not a fixed stock inverse.
- **Overlay opens by BOTH a `/cards` slash command AND a verified-free keybind** (Ctrl+T candidate).

## Why
Boot the TUI quiet and flip quiet/loud in one action without losing tool detail. Today: tool-card startup is
hardcoded `collapsed` (`src/index.ts:347`), reasoning is binary (`transcript.ts:210-216`), quiet takes 3
keypresses across two controls, and seeing one card's full body forces the whole transcript loud.

## Design (settling the open questions)

**Composition (Q1): two independent config fields + one session preset. No `startupView` umbrella, no
redundant third control.** Config = persistence; `/quiet` = session shortcut.

**Config fields (`src/config.ts` — interface + `tuiConfigSchemaFields` + `resolveTuiConfig` + `ResolvedTuiConfig`):**
| Field | Contract |
|---|---|
| `toolCardVisibility` | `'hidden'\|'collapsed'\|'expanded'`; schema default `'collapsed'` (= today's hardcode). |
| `reasoningFold` | Optional `'off'\|'preview'\|'full'`; NO schema default (optional so an injected default can't mask legacy `showReasoning:false`). Explicit value wins over `showReasoning`. |
| `showReasoning` | Kept, deprecated alias. Resolve: `reasoningFold ?? (showReasoning ? 'full' : 'off')`. Retain its existing default `true`. |

Resolve ONCE into canonical `toolCardVisibility` + `reasoningFold`; runtime components hold NO competing
reasoning boolean. Stock (unset) config → `toolCardVisibility:'collapsed'`, `reasoningFold:'full'` →
**pre-existing transcript / tool-card / reasoning output unchanged vs `34dd9ec`** (the C4 help line gains a
`/cards` token — the one intentional always-rendered delta; see S1 below). Existing `showReasoning:false`
deployments keep hiding reasoning.

**Reasoning 3-state render (`src/components/transcript.ts`):**
- `assistantMessageChildren(content, reasoningFold, …)` (currently a `showReasoning` boolean at :197):
  `full` = today's dim italic "Reasoning" header + full `Markdown` (:210-216); `preview` = the same header +
  the reasoning body run through the existing `preview(lines, REASONING_PREVIEW_LINES, omitted)`
  (xml-tool-output.ts:115) with a `… +N lines (Ctrl+R to expand)` omission cue; `off` = neither header nor
  body. `REASONING_PREVIEW_LINES = 3` module constant, no new knob.
- Apply to BOTH the settled path and the streaming path (`StreamingAssistantComponent`, transcript.ts:296/359):
  replace `showReasoning:boolean` + `setShowReasoning` with `reasoningFold` + `setReasoningFold(fold)`.
  Probe (Unknown-7) whether the two share a render helper; if not, apply the preview in both.
- **`preview()` line-vs-row semantics**: probe (Unknown-3) whether it counts source lines or rendered rows at
  a narrow width; the 3-row budget must hold after wrapping — if `preview` counts source lines, wrap first or
  use the width-aware path.

**Runtime controls (`src/index.ts` + `src/components/dialogs.ts`):**
- Ctrl+O unchanged (tool cycle collapsed→expanded→hidden + turn folding).
- **Ctrl+R cycles reasoning `full → off → preview → full`** (first press from stock `full` → `off`, preserving
  today's "one press hides reasoning" muscle memory), via `setReasoningFold`.
- `DetailsSelection` becomes `{ tools: ToolCardVisibility, reasoning: ReasoningFold }`; the DetailsDialog
  Reasoning entry cycles the 3 fold states (dialogs.ts:444, replacing the binary `reasoningLabel`).
- `/details` grammar extends to `[collapsed|expanded|hidden] [reasoning off|preview|full]`; keep
  `reasoning on|off` as aliases (`on→full`, `off→off`). Unknown tokens rejected with the usage message, NO
  partial apply (trusted-window control, not an adversarial boundary).

**`/quiet` (remembered session toggle) — snapshot lifecycle is load-bearing (plan-review B1):**
- Define **quiet ≡ `tools==='hidden' && reasoning==='off'`**. Keep a single nullable `preQuiet` snapshot.
- `/quiet` / `/quiet on`: **idempotent when already quiet** (do nothing — do NOT re-snapshot, so a repeated
  `on` can never overwrite the real prior view with `{hidden,off}`). Otherwise snapshot
  `preQuiet = {tools, reasoning}` (the current non-quiet pair), then `setToolsVisibility('hidden')` +
  `setReasoningFold('off')` through the EXISTING setters (turn folding index.ts:1297 + streaming run as via keys).
- `/quiet off`: restore `preQuiet` if set, then **clear it (`preQuiet = undefined`)** so a stale snapshot can
  never survive a later restore; if `preQuiet` is unset, restore the config-resolved startup pair, and if THAT
  pair is itself quiet, restore stock `collapsed`/`full` (so `/quiet off` always changes something visible).
- No-arg `/quiet` while already quiet ⇒ `/quiet off`. Session-only; persistent quiet uses the config fields.
- Invariant (spec-asserted): `on`→`off` restores the exact prior pair; `on`→`on`→`off` still restores the
  ORIGINAL prior pair (second `on` is a no-op); `off` when not quiet is a well-defined restore-or-stock.

**Detail overlay (`src/components/cards-overlay.ts`, name per repo convention):**
- Read-only pane of ALL tool cards in the current session, each rendered as its collapsed header + its FULL
  (expanded) body, via a shared card-body builder extracted from `ToolCardComponent` (Unknown-5) — do NOT
  re-derive diffs; reuse existing formatting. Snapshot on open (initial selection = latest card); reopening
  refreshes streaming results. Navigation: prev/next card, ↑/↓ + PgUp/PgDn + Home/End scroll, Esc/q close;
  empty-state when no cards. Opened via `overlayManager.open(...)` (like DetailsDialog, index.ts:1330).
- Opened by BOTH `/cards` AND a verified-free keybind (Ctrl+T candidate; Unknown-2). Documented in the help
  line + README.
- MUST NOT mutate `toolsVisibility`, any card component's phase, or turn folding. "Full detail" = complete
  RETAINED output + available derived diff, without `maxToolOutputLines` truncation; `maxDiffEditLength`
  stays a derivation-cost bound (the overlay must NOT turn a display choice into an unbounded derivation);
  an unavailable/over-cap diff is represented clearly, never silently blank.

**Sequencing (Q5): one branch, four stacked commits, each with its own spec + Codex diff-review.**
`C1` config-seed (#1) → `C2` reasoning 3-state (#3: canonical resolve + alias, settled+streaming render,
Ctrl+R, DetailsDialog, `/details`) → `C3` `/quiet` (#2, depends on C2's setter) → `C4` overlay (#4, largest,
reviewed last). C4 is the operator go/no-go point IF Unknown-1 shows card bodies are not retained when
hidden/folded (then C4 needs a small retained-card list at the card-creation insertion point).

## Done
- Fork branch: `npm ci && npm run build` reproducible (`lib/` byte-identical over two clean builds; record
  `sha256(lib/index.js)`); `npx vitest run` green incl. 4 new specs; typecheck clean (Unknown-6: exact cmd).
- Under stock config, the pre-existing transcript / tool-card / reasoning output is unchanged vs `34dd9ec`
  (spec asserts resolved defaults + a reasoning-render fixture captured at C1 before C2 lands); the ONLY
  intentional always-rendered delta is the C4 help-line `/cards` token (S1). `showReasoning:false` still
  hides; `reasoningFold` wins over it.
- `/quiet` → cards hidden + turns folded + reasoning off; `/quiet off` → restores prior (or stock).
- Ctrl+R cycles full→off→preview→full; DetailsDialog + `/details` drive all 3 reasoning states.
- `/cards` AND the keybind open the full-body browser while `toolsVisibility` stays `hidden`; close leaves the
  transcript untouched.
- Attended live-verify checklist run in a real terminal. Foundry re-pin NAMED, not done.

## Proof
| Check | Establishes | Does not establish |
|---|---|---|
| `test/config.*` through the real schema parser: stock / `showReasoning:false` / explicit `reasoningFold` / `toolCardVisibility:'hidden'` | Field plumbing, alias precedence, default transparency, enum validation, invalid-value rejection | Rendering/TTY |
| Reasoning spec: `assistantMessageChildren` at off/preview/full + streaming `setReasoningFold`; width-bounded preview at narrow width; **the actual Ctrl+R handler cycles full→off→preview→full; the DetailsDialog Reasoning entry cycles all 3 and emits the right `DetailsSelection`** (plan-review B2) | 3-state render, byte-equal `full` vs pre-change fixture, 3-row preview budget, both controls drive all 3 states | TTY input routing |
| Quiet spec: apply → state pair + folding invoked; `on`→`off` restores prior; `on`→`on`→`off` restores the ORIGINAL prior (2nd `on` no-op); `off` when not quiet restores config/stock; `preQuiet` cleared after restore | Snapshot-lifecycle invariant + command semantics through the real setters | Key handling |
| Overlay spec: N cards at `toolsVisibility:'hidden'` incl. a body > `maxToolOutputLines` + a diff fixture → full bodies present; nav/empty-state; global visibility + card phases unchanged after open/close | Read-only, completeness, non-mutation | Real overlay input routing |
| Two clean `npm ci && npm run build` | Foundry pin viability (byte-identical `lib/`) | Behavior |
| Attended live-verify | Boot-quiet, `/quiet`+off, Ctrl+R 3 states, DetailsDialog, `/cards`+keybind open/scroll/nav/close, focus restore | Beyond one operator session |
| Foundry doctor 8/8 + full `uv run pytest` (follow-on) | Consumer install + pin consistency | After the fork cycle |

## Anti (foreclosed)
- Binary `showReasoning` and `reasoningFold` diverging: resolve collapses to ONE canonical value; `showReasoning`
  read in exactly one place. Grep `showReasoning` after C2 → only `config.ts` + the deprecation note.
- Default drift: C1 fixture + resolved-defaults spec; any schema-default change fails it.
- `/quiet` bypassing folding by poking state fields: it MUST call the setters; spec asserts the folding path ran.
- Overlay "working" by flipping cards expanded: spec asserts `toolsVisibility` + each card phase unchanged.
- Overlay showing collapsed previews / calling a preview "full detail": spec asserts a body > `maxToolOutputLines`
  appears in full; the overlay must not turn a display choice into an unbounded derivation (`maxDiffEditLength` bound kept).
- Quiet implemented only in settled render: exercise streaming + folded turns too.
- Hardcoding fixture output or excluding long/wrapped content to pass tests.
- Skipping live-verify because vitest is green: vitest can't drive TTY/overlay input — the checklist is a Done item.

## Bounds / non-goals
In: fork `src/config.ts`, `src/components/transcript.ts`, `src/components/dialogs.ts`, `src/index.ts`, new
`src/components/cards-overlay.ts`, 4 specs, README/help text. Out: rejected per-tool-kind / input-vs-output
granularity; a reasoning preview-length knob; a `/quiet` keybind (deferred pending a free chord — the overlay
keybind is in scope); two-level overlay browser, overlay search/filter/live-update; web/headless profiles;
persistence writer/decoder; the herdr black-band; **the Foundry re-pin** (follow-on: bump `TUI_PIN_SHA`
doctor.sh:57 + `_TUI_PIN_SHA` tests/test_orch.py:35, README/design, reinstall the tui profile; a cordis
`--patch` change ONLY if Olympus opts into quiet-by-default, restating every field the row wants since the
patch replaces the whole config block). §2.6: C4 is largest — stage last; operator go/no-go if Unknown-1 forces a retained list.

## Trade
- Distinct `off|preview|full` (operator) over a shared Visibility vocab: domain-clear names; the 3-phase
  cycle mechanism is still shared internally where clean.
- Remembered `/quiet off` (operator) over a fixed inverse: a small `preQuiet` snapshot buys "restore what I had".
- Both `/cards` + keybind (operator): discoverable AND fast; cost is one extra registration + a chord probe.
- Back-compat: `showReasoning` kept as a one-line alias, not removed.
- Ctrl+R gains a 3rd state (`full→off→preview→full`); first press still hides (muscle memory preserved).
- Overlay minimalism: flat all-cards browser, snapshot+refresh; blast radius = one file + `/cards` + a keybind + a help token; reads card data, never writes transcript state (one-way dependency).

## Unknown (probe FIRST, in order — record findings in the context)
1. **Highest-risk, cheapest:** does `applyTurnFolding` (index.ts:1297) discard `ToolCardComponent`s / their
   bodies when hidden? Trace a long-output + diff fixture. If bodies aren't retained, C4 needs a retained
   card list populated at card creation — confirm that insertion point before committing to C4.
2. Free Ctrl chord for the overlay: enumerate the key handler (index.ts:1831-1840) + editor/overlay binds;
   avoid Ctrl+S/Q (flow control); confirm Ctrl+T free across global/editor/overlay AND in the real terminal.
3. `preview()` counts source lines vs rendered rows (xml-tool-output.ts:115); test one long line at narrow width.
4. Schemastery optional-without-default + enum/union syntax: confirm `reasoningFold` resolves to `undefined`
   when unset from an existing const/union field in config.ts (or the schemastery API in node_modules).
5. The overlay Component contract (DetailsDialog dialogs.ts:444 is the template): key events, size/scroll
   ownership, pending/error card representation, diff-cap fallback.
6. Exact typecheck command, generated-file/reproducible-build procedure, spec filename convention in `test/`.
7. Whether streaming reasoning shares the settled render path (transcript.ts:296/359); if not, apply preview in both.

## Steps
1. Branch off `main` @ `34dd9ec`; run Unknown probes 1–7; record findings.
2. **C1** — `toolCardVisibility` field + seed index.ts:347; config spec; capture stock reasoning fixture. Build+vitest+typecheck. Diff-review.
3. **C2** — `reasoningFold` field + `showReasoning` alias (canonical resolve); 3-state settled+streaming render via `preview()`; Ctrl+R cycle; DetailsDialog 3-state; `/details` grammar + on/off aliases. Reasoning spec asserts fixture equality at `full`; grep `showReasoning` → only config.ts. Diff-review.
4. **C3** — `/quiet [on|off]` via existing setters with `preQuiet` memory; quiet spec. Diff-review.
5. **C4** — cards-overlay component + `/cards` + verified keybind; overlay spec; help line. Diff-review. Operator go/no-go only if probe 1 forced a retained list.
6. Two clean reproducible builds; attended live-verify checklist. Merge to fork `main`; record the SHA.
7. Hand off the Foundry re-pin cycle (pin bump both files, doctor 8/8, full `uv run pytest`, profile reinstall; cordis patch only if Olympus chooses quiet-by-default).
