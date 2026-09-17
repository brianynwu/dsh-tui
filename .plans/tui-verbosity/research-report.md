# dsh-family TUI output-verbosity / display-mode capability — research report

**Date:** 2026-09-16 · **Scope:** how much control a user has over hiding model output detail
(reasoning, tool inputs/outputs, file content, diffs) across the three scout TUI candidates.
**Subjects:** #106 `@brianynwu/dsh-tui` (our fork, `/home/bwu/work/dsh-tui`) · #104 `ccch1mneyyy/dsh-TUI`
("chimney", pi-Ink) · `tomowang/dsh-tui` (pi-tui, log-authoritative).

Evidence: direct source read of the fork; two independent source audits (freshly-cloned repos) of the other
two. Every claim below is anchored to a render CONSUMER (a defined-but-unused knob was rejected).

---

## 1. Executive answer (for the fork)

**Yes — the fork can hide the vast majority of model output, and it is the most capable of the three at
doing so.** All model output falls in three independently-controllable buckets:

| Target | Control | Default |
|---|---|---|
| Model reasoning | `Ctrl+R` · `/details reasoning off` · config `showReasoning:false` (persists) | shown |
| Tool calls — inputs, outputs, file content, diffs (all of it) | `Ctrl+O` cycles collapsed→expanded→**hidden** · `/details hidden` | collapsed |
| Collapsed tool-output length | config `maxToolOutputLines` (default 6) | 6-line head/tail |

**"Just the conversation":** `Ctrl+R` (reasoning off) + `Ctrl+O` twice (→ `hidden`), or
`/details hidden` + `/details reasoning off`. Left with your prompts + the assistant's final prose only.

Why it works: all tool traffic — args, results, file reads, diffs — is rendered inside atomic **tool cards**
(`src/components/transcript.ts:462`). The `hidden` state renders literally nothing and folds each turn's
steps into one assistant message (`src/index.ts:1295`), giving a true conversation-only view.

**The one real limit:** tool-card visibility is NOT a configurable startup default — it is hardcoded to
`collapsed` (`src/index.ts:347`), so the quiet state must be re-toggled every session. Reasoning CAN be
defaulted off (config), tool cards cannot. Visibility is also global/all-or-nothing (no per-card peek), and
reasoning is binary (no collapsed-preview middle state).

---

## 2. Cross-candidate comparison

| Capability | **#106 fork (ours)** | **#104 chimney (pi-Ink)** | **tomowang/dsh-tui** |
|---|---|---|---|
| Render stack | self-contained pi-tui | own render (pi-family) | pi-tui, log-authoritative |
| Default transcript density | detailed (collapsed cards) | detailed (collapsed) | **compact one-liners (fixed)** |
| Hide reasoning entirely | ✅ Ctrl+R / `/details` / config default | ⚠️ collapse-to-preview only | ❌ always 80-char preview line |
| **Hide tool cards entirely (conversation-only)** | ✅ **only one of the three** | ❌ preview only | ❌ always a one-line row |
| Expand full detail **inline** | ✅ Ctrl+O→expanded | ✅ Ctrl+O / per-card click | ❌ only via read-only overlay |
| Configurable tool-output cap | ✅ `maxToolOutputLines` | ❌ hard-coded 3 | ❌ hard-coded (100 char / 20 shell) |
| Runtime keyboard control of density | ✅ Ctrl+O / Ctrl+R / `/details` / dialog | ✅ Ctrl+O + Ctrl+E + per-card click | ❌ none (overlay ≠ transcript) |
| Static config surface | ⚠️ 2 fields | ✅ richest: `thinkingFold`, `diffLayout`, `foldTerminalCommand`, `minimal` | ❌ none |
| On-demand detail overlay | ❌ | ❌ | ✅ Tool Cards / `/trajectory` browser |

### Design philosophy, per candidate
- **#106 fork — detailed-by-default, fully toggleable.** Only candidate that can collapse to a true
  conversation-only view AND the only one with a configurable output cap. You choose quiet or full per
  session. Weakness: the quiet choice doesn't persist; global-only; binary reasoning.
- **tomowang — compact-always, zero knobs.** Quiet look for free, but a straitjacket: reasoning is a fixed
  80-char line, every tool call/result a fixed one-liner (100-char truncation), all caps hard-coded, and its
  own `AGENTS.md` states there is intentionally "no mode to switch." Full detail only via a read-only overlay
  (`Ctrl+O` Tool Cards / `/trajectory`) that never changes the transcript. Cannot fully hide even the
  one-liners; cannot expand inline; cannot configure anything.
- **#104 chimney — richest static config + runtime collapse, but no categorical hide.** `thinkingFold`
  (preview/full), `diffLayout` (auto/split/unified), `foldTerminalCommand`, `minimal` (decorative-only),
  global `Ctrl+O` verbose + `Ctrl+E` window + per-card mouse click. But it can only SHRINK to previews — no
  layer can be fully hidden; line caps (3 text / 8 diff / 1000-char line clip) are hard-coded constants.

**Verdict:** the fork wins on flexibility (quiet OR full, on demand) and is the only one that reaches a true
conversation-only view. tomowang is quiet-but-rigid; chimney is configurable-but-cannot-fully-hide. The
improvements below borrow the best of the other two into the fork's toggleable model.

---

## 3. Recommended improvements to the fork (accepted set)

Ranked; each cites the pattern it borrows.

1. **Config default for tool-card visibility** — add `toolCardVisibility: 'collapsed'|'expanded'|'hidden'`
   (default `collapsed`) and seed `src/index.ts:347` from it exactly as `showReasoning` seeds line 344.
   Closes the "must Ctrl+O every session" gap; lets a launch start quiet. Borrows tomowang's proven
   compact-by-default stance while staying reversible. ~small, in-pattern.
2. **One-shot "focus/quiet" preset** — a `/quiet` command and/or single keybind that sets reasoning off +
   tools hidden together (today: 3 keypresses across 2 controls), with an inverse to restore. Pairs with a
   config `startupView: full|quiet` umbrella.
3. **Reasoning preview/fold middle state** — `reasoningFold: off|preview|full`, mirroring tomowang's 80-char
   `✦ think` line and chimney's `thinkingFold: preview|full`. The fork's reasoning is binary; a folded 1–3
   line preview expandable via `Ctrl+R` matches the 3-state model tool cards already have.
4. **On-demand detail overlay** — borrow tomowang's Tool Cards / `/trajectory` browser: keep the transcript
   quiet yet peek one tool's full output/diff WITHOUT flipping global visibility. Cleaner than per-card mouse
   state and fits the fork's keyboard-first / herdr-mobile context.

(A fifth idea — per-tool-kind / input-vs-output granularity — was considered and dropped as disproportionate;
the atomic tool card is the right unit.)

Items 1–2 are small and directly serve the "hide the majority" goal; 3–4 are higher-value ergonomic upgrades
borrowing proven patterns. Next step: a canonical coding cycle (dual cross-vendor planners) over items 1–4,
resolving how they compose into one coherent config + runtime model.
