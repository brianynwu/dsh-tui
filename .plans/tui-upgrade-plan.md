<!-- Scoped via Foundry's canonical coding cycle (scope-review), Tier-2 dual-cross-vendor planners:
Fable-authored base (claude_plan.sh) refined with Astra's rigor (codex_plan.sh), operator-selected at the
forks (2026-09-15). Operator decisions: (1) base = Fable + Astra rigor; (2) remappable keymap COMBINED with
the permission toggle in Phase 1; (3) SHELL MODE DROPPED (operator uses a real terminal); (4) rewind is
probe-gated. Plan-review (Codex auditor via codex_audit.py --kind plan): R1 = revise (2 blocking:
keymap validator must parse against the probed grammar + prove safety-action resolution; Phase-1 keymap
pre-declared deferred-feature actions — moved to owning phases; +2 suggestions: history pruning, OSC 9
request-identity dedupe) → all closed by construction; R2 = APPROVE, blocking [] (one non-blocking
suggestion folded: history retention uses a documented best-effort `(timestamp, random tiebreak)` total
order, not strict cross-process monotonicity). Plan CLEARS review. Assumed
precondition (NOT a phase): dsh-core already updated to >= 0.1.5-rc.2 with /resume regression re-verified.
NOT YET IMPLEMENTED — operator owns branch + merge. -->

# Plan: dsh-tui `0.1.8-revive` feature upgrade (6 features, gated rewind tail)

## Why

The operator cannot see or change the permission mode, cannot see the child agents couplers spawn, loses prompt history on every `/resume` re-exec, gets no desktop signal when a long turn blocks on approval, and reviews plans through a generic dialog. These are the gaps a user hits daily in herdr/mobile use. Rewind is the headline competitor feature but depends on a core seam whose exact shape we have not read. Everything ships on the existing pi-tui tree and existing seams; nothing touches the couplers/overlay path or the in-place `/model` swap. Shell mode is deliberately OUT (the operator runs shell in a real terminal).

## Assumed precondition (not a phase)

dsh-core (`@deepseek-ai/dsh-*`) is already at ≥ `0.1.5-rc.2`, `/resume` regression re-verified, differentiators confirmed at the new core. The plan may assume the newer-core seams exist but must PROBE each exact name/shape from installed source before building on it — a sibling fork's usage is a hint, never a contract.

## Phasing (owned here)

Combined keymap+toggle is the structural foundation (operator decision 2), so it goes first; later phases route their keys through its action dispatch but must not require one another.

| # | Phase | Size | New files | Touches `src/index.ts`? |
|---|---|---|---|---|
| 1 | Remappable keymap **+** permission-mode toggle + `${permission}` | M | `chat/keymap.ts`, `chat/permission-mode.ts` | key dispatch → action dispatch; `/status` line |
| 2 | OSC 9 wait notification | XS | `chat/notify.ts` | none (dialog mount) |
| 3 | Cross-process prompt history (concurrency-safe) | S | `chat/history-store.ts` | mount + submit hook |
| 4 | Subagent switcher | M | `chat/subagents.ts`, `components/subagent-strip.ts` | key actions, layout slot |
| 5 | Plan-mode review panel | S | `components/plan-panel.ts` | none (dialog mount) |
| 6a | Rewind seam probe | XS | `test/rewind-seam.test.ts` | none |
| 6b | Rewind (gated on 6a) | M | `chat/rewind.ts`, `components/rewind-picker.ts` | double-Esc action |

Tier C (light theme/`theme`, MCP UI, provider CRUD, terminal images, `/tree`, cost, OAuth, auto-update, vim, trajectory/whale) is DEFERRED — none is needed for Tier A/B and none is made nearly-free by a phase. The one Tier-C-adjacent inclusion is `/status` showing the permission mode (Phase 1).

**Rewind gate (operator decision 4):** 6a is a read-only test file, merges regardless. 6b implements rewind IN THIS CYCLE if the probe shows the core continues our coupler-bound `main` agent IN PLACE after an event slice; if continuation requires adopting a NEW/forked agent instance (which would need a couplers/herdr rebind design), 6b moves to its own later cycle. The probe result decides; no mid-cycle re-litigation.

## Done

Done when each phase's checks pass and this standing regression suite is green on the final merge:

- `/model` mid-turn changes `ModelSelectionRef.current` with no fork/reseed (existing `model-context` tests + a live swap).
- `tools/orch/launch_dsh.sh` boots the profile with all 5 couplers + herdr via `cordis.patch.yml`, and a herdr transfer completes.
- `showReasoning=false` + `maxToolOutputLines` still clamp output.
- Dashboard pane renders Timing/Tokens/Context with a cross-process metric stacked.
- `openOverlay` FIFO, `TuiPromptService` fragments, `TuiDashboardService` columns unchanged (existing tests).
- `/resume <id>` execve re-exec lands in the session cwd with profile + overlays, now with prompt history intact.
- `layout` tests pass with the new pinned rows present and absent.
- Existing wheel, mouse, selection/copy, resize, and exit behavior unchanged.
- A blocked feature (e.g. gated 6b) is explicitly incomplete; merging earlier phases never redefines the upgrade's completion.

## Proof

| Check | Establishes | Does not establish |
|---|---|---|
| Per-phase **seam probe** (first step of phases 1, 4, 5, 6a) — import the installed `@deepseek-ai/dsh-*` at the new core and assert the real name/shape | The authoritative consumed contract, supported transitions, observed errors | Future-version compatibility; the sibling fork's usage is a hint only |
| Per-phase **vitest** (behavioral, real-process where relevant) | Controller logic, routing, state transitions, persistence/concurrency, cancellation, failure handling | The seam's real shape; actual terminal delivery; deployed permission confinement |
| **Live verify** via `launch_dsh.sh` (full node suite + one live launch per phase — the launcher is subprocess-driven/unbounded per the reach rule) | Rendering, focus, key routing, coupler/herdr coexistence, profile/overlay integration | Untested terminal emulators / deployments |
| **Terminal-escape byte check** (phase 2) — assert exact bytes on captured stdout | No leaked SGR/OSC (the failure class we removed the color probe for) | — |
| Build + packaged-launch (`tsc` → tsdown → `lib/`, git-installable) | Source/prebuilt agreement, git-installability | Functional correctness alone |
| Independent cross-vendor diff-review | Independent assessment of implementation + evidence | A substitute for execution evidence |

Installed source is authoritative for API claims; deployed behavior is authoritative for integration claims. Competitor findings identify probes and patterns, not contracts.

## Anti (shortcuts → closure by construction)

- **Shadow permission state** → the `${permission}` indicator reads the base's live/acknowledged mode on every render, never a fork-local variable set by the cycler. Test: mutate the fake seam externally, assert the fragment follows; an unknown/rejected/malformed mode is NEVER displayed as a guessed preset nor defaulted to broader access.
- **Silent escalation** → cycling into danger-full-access happens only on an explicit keypress while the composer owns focus; the indicator is in the default prompt template so a deployment can't hide it by accident (only by overriding the template). Mode selection uses core enforcement; a malformed transition cannot relax the floor.
- **Keymap dropping a safety key** → the validator parses EVERY binding against the probed pi-tui grammar (rejecting an unknown action or malformed syntax, not only a duplicate or an empty binding), and PROVES `exit`/`cancel`/each context's cancellation actually RESOLVE in every applicable context before accepting the map — so a nonempty typo cannot pass while leaving a safety action unreachable. An invalid replacement map is rejected ATOMICALLY (retain the last valid map; hot-reload never fails into a keyless or permissive-default UI). Reuse of one chord across mutually-exclusive contexts (picker vs composer) is valid.
- **Notification carrying untrusted text** → the OSC 9 payload is a FIXED literal, never the question/plan body/paths; sanitize all dynamic display text elsewhere.
- **History as a secret sink / lost update** → owner-only (0600) storage; concurrency-safe by construction (immutable, uniquely-named records published by atomic rename — NOT a single shared file with lost updates); validate record schema + filenames; ignore unfinished/truncated records; skip-not-fatal on corrupt lines; bounded (500 entries, 1 MiB aggregate, 64 KiB/entry — oversized prompts stay sendable, just unpersisted). Persist the ORIGINAL submitted text, not expanded fragments. Failures normalize to bounded notices (no raw prompts/paths/exception payloads) while in-memory history + sending stay functional.
- **Subagent view mutating main** → the child view is a read-only second transcript source; main's node identity, scroll state, editor contents, dashboard, and active dialogs are asserted unchanged across swap/back. Child replay triggers NO main-agent action, approval dialog, notification, or duplicate metric. Cancel stale subscriptions and reject late updates after a selection change. The composer, permissions, model selection, questions, and cancellation stay attached to main.
- **Plan panel authorizing an action** → rendered content cannot authorize; expose EXACTLY the response actions/values the core payload supports (never invent approve/revise semantics or infer a plan from its title); preserve FIFO overlay ordering, pending state, single-response behavior; fall back to the generic dialog when the plan discriminator is absent.
- **Fake rewind** → rewind must SLICE session events and continue the canonical session, never clear/hide rendered rows. Proof: `/resume` after rewind replays the truncated transcript. Before adoption, retain the original active session; after an ambiguous adoption error, re-read canonical state before re-enabling submission (do NOT assume transactional rollback). Preserve the current in-place model selection and active permission policy across the handoff (history must not silently restore a different model or broader permissions).
- **Classify every knob (no floor relaxes)** → core permission presets select ENFORCED policy; keymaps select INVOCATION not authorization; display/notification preferences alter PRESENTATION only; persistence/output ceilings BOUND RESOURCES and cannot disable validation; all feature state is runtime state — no env flag relaxes an enforcement or integrity floor.

If the same finding class recurs, stop rewording cases — close the surface by construction or narrow the claim.

## Bounds

In: the six features above (permission toggle+keymap, OSC 9, history, subagent switcher, plan panel, gated rewind). Out: the dsh-core update (assumed done), **shell mode (dropped)**, competitor code, all Tier C, any change to coupler wiring, any behavior env flag. Each phase is one branch, one `lib/` rebuild, one prerelease bump (`0.1.8-revive.N`), its own tests + a live-verify note in the PR body. No phase adds a runtime dependency; `node:fs`/`node:path` cover phase 3. Rewind changes conversation history only — it does NOT undo filesystem changes, commands, or external effects (state this in the picker).

## Trade

- **Structural foundation first (operator choice).** Combining the keymap with the toggle front-loads the key-dispatch→action-dispatch migration into Phase 1 (bigger, higher blast radius) but buys one clean keyboard migration and a settled Shift+Tab ownership before any later phase adds a chord. Cost: the first phase is M not S; benefit: phases 2–6 add actions, never raw key branches.
- **Additive beats tidy.** The subagent view duplicates a transcript instance behind a source swap rather than refactoring the main render path. Cost: two render paths; benefit: zero change to the live main path, delete-the-file removal.
- **Rewind gating** trades headline immediacy for not breaking the coupler binding to `main`: implement in-cycle only if the seam continues `main` in place; else its own cycle.
- New controllers sit behind existing services + small composition-root registrations; the shared renderer/editor/event-reducer must not import feature controllers (removal = drop registrations + feature files, base intact). Use existing persistence/rendering/validation where adequate, else Node stdlib — no plugin framework, no storage dependency.

## Unknown (confirm from source; none invented)

1. `ctx.permissionPresets`: list shape, current-mode getter, setter/cycle fn, change-event existence, mid-turn effect. If no event, the fragment re-reads per render (the `${model}` pattern).
2. The exact Shift+Tab + modal dispatch path in `src/index.ts` and how the picker claims focus (for the Phase-1 context ownership).
3. pi-tui key-event naming/normalization for the keymap binding grammar; the settings-reload rejection path.
4. How the pi-tui terminal object exposes a raw write path outside the render tree (phase 2), and whether an OSC write must flush with the next frame.
5. `$DSH_HOME` resolution helper + the editor's history API (bulk preload vs repeated `addToHistory`); available bounded settings facility for cross-process history.
6. `ctx.subagents.listChildren`: fields (id, label, status, session id), child ownership/validation, per-child event access (persisted/live/both), replay↔live ordering + unsubscribe behavior, whether it emits the same `session/event` shape the main replay consumes.
7. The plan-request discriminator (a field/metadata on the ask-user question, not prose), its supported response actions, and pending-request identity/lifecycle.
8. **Highest-risk cheap probe — rewind (6a, first):** snapshot consistency, valid completed-turn boundaries, `turn/end` ordering, continuation IDENTITY (does the core keep our `main` agent or adopt a new one), adoption atomicity/error behavior, preservation of the composed main service. Its result decides 6b's cycle.
9. Existing scripts/fixtures needed to write the stated checks without inventing repo paths. (MCP/provider ownership needs no probe — their UI is deferred.)

## Deliverables and Steps

**Phase 1 — keymap + permission toggle.** Probe Unknowns 1–3. Add `src/chat/keymap.ts`: `TuiConfig.keys` (schemastery record action→binding) whose defaults equal every CURRENT binding PLUS Phase 1's own `cyclePermission` — and NOTHING for features that do not yet exist: later phases register their own action + default into the keymap when they land (`subagentPrev/Next/Back` in Phase 4, `rewind` in Phase 6b), so a deferred feature's keymap surface never lives in the foundation and its removal stays local. A resolver maps a pi-tui key event to an action WITH context ownership (active dialog/model-picker consumes its keys before the base composer). An ATOMIC validator (run after Unknown 3 establishes the accepted pi-tui binding grammar): parse EVERY binding against that grammar and reject an unknown action or malformed/unrecognized syntax; reject a duplicate-within-context; and PROVE the required safety actions (`exit`, `cancel`, and each context's cancellation) RESOLVE in every applicable context before accepting the map — otherwise retain the last valid map (an invalid reload never yields a keyless or ambiguous safety path). Replace raw key branches in `src/index.ts` with an action switch. Add `src/chat/permission-mode.ts` exporting `list/current/cycle` over the confirmed seam, mirroring `src/chat/model-command.ts`; if the seam has no cycle call, cycle is index+1 mod n over its own ordering, never a hardcoded name list; keep mode state in core, serialize transition requests, show the acknowledged mode incl. external changes. In the base composer Shift+Tab→`cyclePermission`; inside the model picker Shift+Tab keeps effort-cycling (context ownership). Add `${permission}` to `src/prompt.ts` (short textual mode indicator + supplementary three-tone color) and append to the default template; add the mode to `/status`. **Vitest:** context precedence; unchanged default actions; remap/reload; invalid-map atomic retention; cycle wraps; fragment follows external change; rejected/overlapping mode changes; unknown mode never shown as a guessed preset. **Live:** all three presets against real base enforcement with overlays loaded; picker Shift+Tab; in-place `/model` and a permission change while an agent runs; a herdr transfer.

**Phase 2 — OSC 9.** Probe Unknown 4 AND the pending-request identity/lifecycle (the stable per-request id from Unknown 7, pulled forward into this phase — dedupe is unreliable without it: a remount would otherwise read as a fresh none→pending transition). Add `src/chat/notify.ts`: a none→actionable-pending transition detector keyed on that stable request IDENTITY (from real approval/question state in `src/chat/questions.ts` + the dialog mount, never transcript text) and a writer emitting `ESC ] 9 ; <fixed text> BEL` through the terminal's raw path, only while mounted and only from the live listener (never replay). Dedupe by request identity across streaming updates, overlay-queue movement, and remounts. `TuiConfig.notifications: boolean` (default true, presentation-only — never affects approval handling). **Vitest:** one emission per transition; none on replay/remount; exact payload bytes; disabled pref; teardown. **Live:** trigger a real question + approval in the herdr path; record whether the terminal delivers OSC 9 (emission ≠ desktop delivery).

**Phase 3 — history.** Probe Unknown 5. Add `src/chat/history-store.ts` under a confirmed `$DSH_HOME` root: prefer a confirmed bounded concurrency-safe settings facility; else a TUI-owned store of immutable uniquely-named records published by atomic rename (no shared-file lost updates/stale locks). `load()` returns the last 500 (schema+filename validated, unfinished/corrupt skipped, concurrent disappearance handled); `append()` writes the ORIGINAL submitted text (not expanded fragments), owner-only 0600, ceilings 500/1 MiB/64 KiB (oversize stays sendable, unpersisted). **Retention:** records carry a deterministic TOTAL order `(wall-clock timestamp, random tiebreak)` — documented as BEST-EFFORT CHRONOLOGY, not strict cross-process monotonicity (a process-local counter is not globally comparable and wall-clock is not monotonic across processes/clock adjustments; the smaller truthful guarantee avoids adding coordination). `load()` and `append()` prune the oldest records past the entry/aggregate ceiling under that order, so history never grows unbounded NOR permanently stalls at the limit; a bounded transient overshoot under concurrent writers is explicitly allowed (pruning is eventual, not locked). Preload the editor on mount; refresh at the start of a history-navigation sequence (so a running process sees new entries); preserve the unsent draft + a stable navigation snapshot. Normalize read/decode/permission/full-disk/write failures to bounded notices; keep in-memory history + sending working. **Vitest:** two real processes writing concurrently; deterministic recall; crash-before-publish; malformed/truncated/oversized; unavailable storage; draft preservation. **Live:** submit in two TUIs, recall across both, restart, execve `/resume`; confirm the history root survives cwd changes.

**Phase 4 — subagent switcher.** Probe Unknown 6. Add `src/chat/subagents.ts` (projection: children of main via the confirmed core service using stable session ids + parent/child validation; selected index; `next/prev/back`) and `src/components/subagent-strip.ts` as a `shrink:0` row in `src/chat/layout.ts` above the dashboard slot, rendered only when children exist. Register this phase's OWN keymap actions + defaults (`subagentPrev/Next/Back`, `/agents` focus) into `TuiConfig.keys` — added here, not pre-declared in Phase 1, so removing the feature removes its keymap surface. Left/Right select while the strip owns focus (ordinary editor arrows keep cursor behavior); Esc returns to main. On select, build a second transcript instance from the child's event stream (reuse the transcript reducer/renderer with a different source) and swap it into the ScrollView; on back, restore main and drop the child instance. Establish replay→live continuity via the core's actual cursor/subscription guarantees; cancel old subscriptions + reject late updates after a selection change. Composer/permissions/model/questions/cancel stay on main; label the viewed child + state submissions target main. **Vitest:** projection; strip render by status; layout with/without the row; interleaved replay/live; rapid selection changes; child completion/disappearance; parent mismatch; subscription cleanup; main node identity + scroll + editor + dashboard preserved; main-targeted input. **Live:** children from the real coupler/orchestration setup; switch during streaming, return, confirm no missing/duplicated events.

**Phase 5 — plan panel.** Probe Unknown 7. Add `src/components/plan-panel.ts` rendering the plan payload as scrollable markdown inside the existing question/modal mount (reuse markdown rendering + dialog-size config; responsive for narrow/mobile), exposing exactly the core-supported response actions/values, same answer keys as the generic dialog. Detect via the core discriminator, fall back to the generic dialog when absent. Preserve FIFO ordering, pending state, single-response. **Vitest:** detection; fallback; captured real plan shapes; large/streaming where supported; narrow layouts; dismissal; duplicate-response prevention; existing generic dialogs intact. **Live:** complete a real plan request through every advertised response action; confirm the agent receives the expected values and external overlay producers still queue.

**Phase 6a — rewind probe.** Add `test/rewind-seam.test.ts` asserting the snapshot/slice/continuation-adoption calls exist and RECORDING in the PR body whether continuation preserves the `main` agent identity (Unknown 8). Merge regardless of outcome — its result decides 6b's cycle by construction.

**Phase 6b — rewind (gated on 6a).** Register this phase's OWN `rewind` action + default into `TuiConfig.keys` (added here, not in Phase 1). Register double-Esc as the `rewind` action only in the idle main composer (no foreground modal/child-strip focus), fixed 400 ms; an Esc that cancels a running turn never arms rewind even if the turn immediately ends. Populate the picker from confirmed completed-turn boundaries; show what remains + state files/external effects are unchanged. Before commit, verify canonical session identity, current revision/consistency condition, selected boundary, and quiescence. Use the core snapshot/slice/continuation-adoption; preserve the original durable session (never simulate by hiding rows). Gate submission during the handoff; continue through the composed main-agent seam so couplers/herdr/overlays/listeners stay attached; rebind transcript/status/error/inbox to the adopted session + expose its real session id; refresh session-scoped metrics without disrupting external dashboard producers. Preserve the in-place model selection + active permission policy. Failure recovery from observed core semantics (retain the original before adoption; re-read canonical state after an ambiguous error before re-enabling submission). **Vitest:** double-Esc timing + context ownership; cancel-then-end race; stale boundaries; concurrent event arrival; snapshot/adoption failures; canonical-state recovery; original-session preservation; continued model/permission state; listener cleanup; replay over a sliced fixture. **Live:** rewind a real multi-turn session with tool activity, continue, change `/model` in place, resume BOTH original and continued sessions through `launch_dsh.sh`; confirm overlays/couplers/herdr/permissions remain effective.
