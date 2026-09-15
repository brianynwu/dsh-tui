# dsh-tui — three-way feature comparison & enhancement recommendations

**Base:** `@brianynwu/dsh-tui` `0.1.8-revive.0` (fork of `@dsh-tui/dsh-tui` v0.1.2 — the recovered first-party `@deepseek-ai/dsh-tui`; pinned to dsh-core `0.1.1-rc.2`).
**Compared against:** `ccch1mneyyy/dsh-TUI` (`@deepseek-harness-tui/dsh-tui` v0.10.1) and `tomowang/dsh-tui` (`@tomowang/dsh-tui` v0.8.1).
**Date:** 2026-09-15. **Method:** full source read of all three (Foundry scout:: manual screening, ids 104/106/108), structure grounded via `code_graph_external` (ours n/a-local; ccch1mneyyy 7,453 nodes; tomowang 805 nodes). All three are MIT, TypeScript, Cordis bundles over `dsh-base`.

> This report identifies the highest-value capabilities our fork lacks and gives concrete, file-level recommendations for adding them **against our actual architecture** (pi-tui renderer + `cordis.patch.yml` bundle). It is a feature-mining exercise, not an adoption proposal — we keep our fork (see §7).

---

## 1. Positioning (maturity)

| | **ours** (brianynwu) | **ccch1mneyyy** | **tomowang** |
|---|---|---|---|
| Version | 0.1.8-revive.0 | 0.10.1 | 0.8.1 |
| Stars / forks | 0 / 0 | 3044 / 182 | 14 / 4 |
| Releases | 6 (revive) | 25 | 10 |
| Cadence | revive-only | ~30/3wk (churning) | steady |
| Open issues | 0 | 90 | 2 |
| Renderer | **pi-tui** (`@earendil-works/pi-tui` 0.85.1) | **forked Ink over React 19 + hand-written Yoga** (544-file `src/`) | **pi-tui** (`@earendil-works/pi-tui` 0.84.2) |
| dsh-core pin | **0.1.1-rc.2** | (newer, beta) | 0.1.5-rc.2 |
| Model swap | **in-place** (mutates `ModelSelectionRef.current`) | **forks** the session | in-place (`installModelSelection`) |
| Composition | in-process cordis `--profile` bundle | cordis patch bundle | in-process cordis bundle |

**Read:** ccch1mneyyy is vastly feature-superior but a fast-churning beta on a forked-Ink/React tree — a large surface at odds with our exact-pin discipline, and it *forks the session on model-swap* (our hard in-place constraint). tomowang is a small, clean **same-stack (pi-tui) peer** — its patterns port to us with the least friction. Our fork's differentiators (in-place swap, couplers+herdr transfer, the conciseness/mobile override, the runtime dashboard pane, execve `/resume` handoff) are intact and not matched by either.

---

## 2. Three-way feature matrix

Legend: ✅ present · ⚠️ partial · ❌ absent.

| Capability | ours | ccch1mneyyy | tomowang |
|---|:--:|:--:|:--:|
| Custom/rich renderer | ✅ pi-tui | ✅ forked Ink/React | ✅ pi-tui |
| Streaming output + reasoning display | ✅ | ✅ (3-row ticker) | ✅ |
| Runtime dashboard pane (Timing/Tokens/Context) | ✅ **(ours-only)** | ⚠️ status line | ⚠️ stats line |
| Context bar + TPS meter | ✅ | ✅ (sparkline) | ✅ |
| Phase-aware breathing caret | ✅ **(ours-only)** | ❌ | ❌ |
| Tool cards + diffs (split view) | ⚠️ inline diff | ✅ side-by-side | ⚠️ inline diff |
| Syntax highlighting (per-language) | ❌ | ✅ highlight.js | ❌ |
| Terminal images (Kitty/Sixel) | ❌ | ✅ | ❌ |
| **Permission-mode toggle (Shift+Tab)** | ❌ | ✅ | ✅ |
| Plan-mode review UI | ⚠️ via ask-user detail | ✅ dedicated panel | ✅ dedicated panel |
| **Session rewind / rollback** | ❌ | ✅ double-Esc + `/rewind` | ❌ |
| **Session fork / family tree** | ❌ | ✅ `/tree` `/fork` | ❌ |
| **Subagent switcher / dashboard** | ❌ | ✅ dashboard + agent-view/bg | ✅ docked switcher |
| **Shell mode (`!`)** | ❌ | ⚠️ | ✅ |
| Goal mode (live strip + auto-continue) | ⚠️ goal-restore notice | ✅ | ✅ |
| In-place `/model` swap | ✅ | ❌ (forks) | ✅ |
| Reasoning-effort control | ✅ (Shift+Tab in picker) | ✅ `/effort` slider | ⚠️ |
| LLM-provider CRUD | ❌ | ⚠️ | ✅ |
| MCP client / `/mcp` | ❌ | ✅ | ❌ |
| Remappable keybindings | ❌ (fixed) | ✅ | ⚠️ pi-tui defaults |
| Theming: light + custom | ❌ (fixed dark) | ✅ `/theme` + OSC 11 | ⚠️ branded |
| i18n (zh/en) | ❌ | ✅ | ❌ |
| Desktop notification (OSC 9) | ❌ | ⚠️ | ✅ |
| Cross-process prompt history | ⚠️ in-session | ✅ Ctrl+R search | ✅ |
| `@file` / `@session` autocomplete | ✅ | ✅ (+line ranges, paste-img) | ✅ |
| execve `/resume` handoff | ✅ **(ours-only)** | ⚠️ | ⚠️ |
| Extension seams (overlay/prompt/dashboard) | ✅ **(ours-only, for couplers)** | ✅ plugin host | ⚠️ |
| Cost / balance display | ⚠️ out-of-fork producer | ✅ CNY + balance | ❌ |
| OAuth subscription sign-in | ❌ | ✅ | ❌ |
| Auto-update (`/update`) | ❌ | ✅ | ⚠️ hint only |
| Trajectory/timeline viz, whale mascot, vim mode | ❌ | ✅ | ❌ |

---

## 3. Most important features missing from our fork (ranked)

Ranked by **value to our operator-tool use** (launch_dsh-driven, couplers/herdr, mobile/herdr steering) ÷ **effort against pi-tui**. Each cites where a competitor implements it.

| # | Missing feature | Who has it | Value | Effort | Tier |
|---|---|---|:--:|:--:|:--:|
| 1 | **Permission-mode toggle** (Shift+Tab read-only/workspace-write/danger-full-access) | both | High (safety, control-visibility) | Low–Med | **Do** |
| 2 | **Subagent switcher** (view a child's transcript) | both | High (couplers/orchestration run subagents) | Med | **Do** |
| 3 | **Shell mode** (`!cmd` outside the agent loop) | tomowang | Med–High (daily ergonomics) | Low | **Do** |
| 4 | **OSC 9 desktop notification** on approval/question wait | tomowang | Med (long-turn/mobile) | Low | **Do** |
| 5 | **Cross-process prompt history** | tomowang | Med | Low | **Do** |
| 6 | **Session rewind / rollback** (double-Esc) | ccch1mneyyy | High (recoverability; the headline gap) | High | **Plan** |
| 7 | **Plan-mode review panel** (dedicated) | both | Med | Low–Med | **Plan** |
| 8 | **Remappable keybindings** | ccch1mneyyy | Med | Med | **Plan** |
| 9 | **Light-theme + `/theme`** | ccch1mneyyy | Med | Med (see caveat) | **Consider** |
| 10 | **MCP surface / `/mcp`** | ccch1mneyyy | Med (base-bundle dependent) | Med | **Consider** |
| 11 | Terminal images (Kitty/Sixel) | ccch1mneyyy | Low–Med | High | **Defer** |
| 12 | Session fork / `/tree`, cost display, OAuth, auto-update, vim, timeline/whale | ccch1mneyyy | Low (polish / not aligned) | High | **Defer** |

**Cross-cutting gate (read first):** several high-value features (permission presets, subagent listing, rewind event-slicing) depend on dsh-core seams that our fork's pinned **0.1.1-rc.2** may not expose — tomowang uses them at **0.1.5-rc.2**. Our pin is deliberate (0.1.2 broke the `/resume` seam — `README.md:53-56`). So **step 0 for items 1/2/6 is a seam probe against 0.1.1-rc.2**, and possibly a controlled peer-range widen with a fresh `/resume` regression check, before building UI on top. Treat "is `ctx.permissionPresets` / `ctx.subagents` present at our pin?" as an explicit unknown to confirm from source, not an assumption.

---

## 4. Recommendations — Tier "Do" (high value, low–moderate effort)

### 4.1 Permission-mode toggle (Shift+Tab)
**What:** cycle read-only / workspace-write / danger-full-access with a live status indicator, like both competitors.
**Reference:** tomowang `src/index.ts:1180-1190` + `src/tui/liveText.ts:65-106` (cycle via `ctx.permissionPresets`, colored indicator in the dock); ccch1mneyyy `src/sessionModes.ts` + `src/dsh-adapter/channel/mode-permission.ts` + `PermissionsPicker.tsx`.
**Why for us:** our fork delegates *all* permission to the base bundle with **no in-fork UI** — the operator can't see or change the mode. Given couplers can run shell/fs tools, a visible mode + a one-key toggle is a real safety-UX win.
**How, against our code:**
1. Seam probe: confirm `ctx.permissionPresets` (or the equivalent) is exposed by dsh-core `0.1.1-rc.2`; if only in ≥0.1.5, evaluate the peer widen (§3 gate).
2. Add a `mode` reader/cycler in a new `src/chat/permission-mode.ts` (mirror `src/chat/model-command.ts`'s controller shape).
3. Bind Shift+Tab in the key handler (`src/index.ts:1290-1304`) — Shift+Tab is currently only used *inside* the model picker for effort cycling (`src/chat/model-command.ts:139-206`), so guard it to the base composer.
4. Surface the current mode via the existing **prompt template** (`src/prompt.ts:50-95`) — add a `${permission}` fragment — and/or a dashboard column via `TuiDashboardService` (`src/dashboard.ts:54-128`). No new render primitive needed.
**Effort:** Low–Med. **Risk:** Low (additive; the toggle just calls a base seam). **Watch:** the Shift+Tab overload.

### 4.2 Subagent switcher (view a child's transcript)
**What:** a docked strip of active subagents; ←/→ to peek a child's transcript in the scroll region, Esc back.
**Reference:** tomowang is the cleanest same-stack model — `src/tui/liveText.ts:108-190` (strip) + `src/tui/TuiApp.ts:147-194` (swap only the `TranscriptArea`, keep dock/composer live) + `src/index.ts:551-584` (stream child from persistence); driven by `ctx.subagents.listChildren`. ccch1mneyyy is richer (`SubagentDashboard.tsx`, agent-view) but on forked-Ink.
**Why for us:** our orchestration/couplers spawn subagents; today we render only the main agent — child work is invisible. Highest-leverage because our workflows are multi-agent.
**How, against our code:**
1. Seam probe `ctx.subagents.listChildren` at our pin.
2. New `src/chat/subagents.ts` (projection of child list + selected child) + a strip component in `src/components/transcript.ts` (pinned `shrink:0`, same slot pattern as the dashboard pane in `src/chat/layout.ts:76-97`).
3. Reuse the existing event-replay path (`src/index.ts:1774-1852`) pointed at the selected child session for the transcript swap — our renderer already replays `session/event`, so this is a source-swap, not a new renderer.
**Effort:** Med. **Risk:** Med (session-scoping the replay). **Fit:** excellent — pi-tui + our layout slots make tomowang's approach a near-direct port.

### 4.3 Shell mode (`!cmd`)
**What:** a leading `!` on an empty prompt runs a local shell command outside the agent loop; output streamed to a display-only (never-logged) transcript row.
**Reference:** tomowang `src/index.ts:1107-1130` + `src/tui/CustomEditor.ts:171-184` (editor detects the `!` prefix) + `src/render.ts:92-110` (yellow-bordered display-only row).
**Why for us:** fast escape hatch (git status, ls) without leaving the TUI or spending a turn — high daily value, and it never pollutes session history.
**How:** intercept in the submit handler (`src/index.ts:1547-1569`) before `agent.followup()`; spawn via `node:child_process`, stream into a new display-only card variant in `src/components/transcript.ts` (reuse the `terminal` render intent at `:461-514`). No base-bundle dependency.
**Effort:** Low. **Risk:** Low (self-contained; keep it display-only + escaped via our existing `displayText`).

### 4.4 OSC 9 desktop notification on approval/question wait
**Reference:** tomowang `src/tui/TuiApp.ts:496-503` (fires OSC 9 once when an approval/question wait starts).
**Why for us:** long turns + herdr/mobile steering — a bell when the agent needs input is valuable and trivial.
**How:** in our ask-user/approval mount (`src/chat/questions.ts`, `src/components/dialogs.ts:806-968`) emit the OSC 9 escape on first pending. **Effort:** trivial. **Risk:** none.

### 4.5 Cross-process prompt history
**Reference:** tomowang `src/index.ts:93-101,361-366` (persist prompt history under a settings namespace, recall ↑/↓ across processes + `/clear`).
**Why for us:** ours is in-session only (`src/index.ts:937,1298`) — history is lost on exit/execve-resume. Persisting it (e.g. under `$DSH_HOME`) survives the `/resume` re-exec.
**How:** back the editor's `addToHistory` with a small persisted store keyed like the config (`src/config.ts`); load on mount. **Effort:** Low. **Risk:** Low.

---

## 5. Recommendations — Tier "Plan" (higher effort / needs design)

### 5.1 Session rewind / rollback (double-Esc) — the headline gap
**What:** rewind the transcript to a chosen prior turn and continue from there. Both the README taglines of the competitors and Foundry's own scout screening flag this as *the* distinguishing feature we lack.
**Reference:** ccch1mneyyy `src/dsh-adapter/channel/session-rewind.ts` (waits for `turn/end`, snapshots + slices live session events, adopts a **forked** agent) + `RewindPicker.tsx`; `/rewind` and double-Esc.
**Why for us:** recoverability from a bad turn without restarting — high value, but the hardest item because it touches session-event slicing and agent adoption, which live in dsh-core.
**How / feasibility:** needs a dsh-core seam to snapshot+slice session events and adopt a forked agent (ccch1mneyyy does this at a newer core). **Step 0 is a capability probe at 0.1.1-rc.2**; if absent, this is gated on the peer-widen (§3) and should be a **standalone coding-cycle**, not a drive-by. Our in-place-swap model actually *simplifies* the "continue" half (no per-swap fork), but the rewind itself still needs event slicing. Bind double-Esc carefully — Esc currently cancels the turn (`src/index.ts:1752-1755`).
**Effort:** High. **Risk:** Med–High (core-seam dependent). **Recommendation:** design-doc it separately; do not start before the seam probe.

### 5.2 Dedicated plan-mode review panel
Our plan review currently rides the generic ask-user dialog's `detail` field (`src/components/dialogs.ts:806-968`). Both competitors have a dedicated panel (tomowang `QuestionOverlay` plan label; ccch1mneyyy `PlanReviewPanel.tsx`). Low–Med effort: a specialized render of the plan payload in our existing dialog mount. **Do this alongside 4.1** (both are control-surface UX).

### 5.3 Remappable keybindings
Our keys are fixed (`src/index.ts:1290-1304`). Introduce a keymap indirection (action → binding) config, mirroring ccch1mneyyy `src/utils/keymap.ts` (`SHORTCUT_ACTIONS`). Med effort; unblocks user preference + resolves the Shift+Tab overload cleanly. Config via our schemastery `TuiConfig` (`src/config.ts:31-184`).

---

## 6. Tier "Consider" / "Defer"

- **Light-theme + `/theme`** (ccch1mneyyy): valuable, but our fork **deliberately removed the terminal color-scheme probe** to prevent an SGR exit-leak (`src/index.ts:1184-1195`). Adding light mode means an explicit user setting (not OSC 11 auto-detect) to preserve that decision. Med effort. *Consider.*
- **MCP `/mcp`** (ccch1mneyyy via `@deepseek-ai/dsh-mcp-client`): depends on whether MCP is wired in our base bundle (`cordis.patch.yml`). If the base provides it, a `/mcp` status view is small; if not, out of scope here. *Consider after a base-bundle check.*
- **LLM-provider CRUD** (tomowang `src/index.ts:448-717`): useful but likely owned by the base bundle for us; low marginal value in-fork. *Consider.*
- **Terminal images** (ccch1mneyyy Kitty/Sixel): high effort (graphics protocols + worker quantization), low alignment with our headless/mobile/coupler use. *Defer.*
- **Session fork/`/tree`, cost/balance, OAuth sign-in, auto-update, vim mode, trajectory/timeline viz, whale mascot** (ccch1mneyyy polish): not aligned with our operator-tool role, or high effort for low benefit. Cost is *partly covered* already by our out-of-fork dashboard producer. *Defer.*

---

## 7. Why we keep our fork (not adopt either)

- **ccch1mneyyy** forks the session on `/model` (violates our in-place constraint), is a fast-churning beta (~30 releases/3wk, experimental `/api`) at odds with our exact-pin discipline, and is a 544-file forked-Ink/React surface. Foundry scout adjudicated it **defeated** for adoption (decision stands); it is a **feature reference** only.
- **tomowang** is a smaller same-stack peer — redundant with our fork, which already fills the in-process operator-tool slot and carries the couplers+herdr seam. Scout verdict: **pass** (feature reference).
- Our fork uniquely: in-place model swap, couplers+herdr transfer unchanged, the conciseness/mobile override (`showReasoning`/`maxToolOutputLines`), the runtime dashboard pane, the extension service seams, and the execve `/resume` handoff.

**The play:** mine the features above into our fork; keep the compact pi-tui base and the pin discipline. The top five "Do" items (permission toggle, subagent switcher, shell mode, OSC 9, persisted history) are all additive, mostly low-effort, and — because tomowang is the same pi-tui stack — port with low friction. The rewind (§5.1) is the one high-value item that needs a real design pass and a core-seam probe first.

---

## 8. Provenance

- Foundry scout:: screenings (this session, 2026-09-15): ccch1mneyyy id 104 (`screened`, verdict pursue-as-reference, 7453-node topo), tomowang id 108 (`screened`, verdict pass-as-reference, 805-node topo), ours id 106 (`degraded_open`, local). Topo via `code_graph_external` (gVisor).
- Source read of all three `src/` trees; competitor file:line cites are from their trees at clone time (ccch1mneyyy `main`@v0.10.1-era, tomowang `main`@v0.8.1). ccch1mneyyy churns fast — re-verify cites before implementing against a moving target.
- Our-fork cites are against `@brianynwu/dsh-tui` `0.1.8-revive.0` working tree.
