# Plan — dsh-tui 0.1.1-rc.2 → 0.1.5-rc.2 (code) + session store V0→V3 (data), rev 3 (final)

Closure map: F1 → P1 identity guard + tests; F2 → P5 per-file commit protocol; F3 → P5 synthetic fixture; F4 → P5 standalone verify script; F5 → P5 CLI `--store`/`--dry-run` only; S1 → catalog as direct devDependency; S2 → per-invocation report with run id + mode; **F6 → P5 checked store-quiescence gate (fail-closed) covering snapshot AND apply, plus per-file busy refusal; S3 → P5 orphan-`.v3.tmp` recovery test**. Everything else unchanged from rev 2.

## Why
The rc.2 bump is the precondition for the parked TUI upgrade plan and for resuming the operator's 61 real sessions under any current harness. Without D1 the TUI cannot build; without D2 rc.2 refuses every existing log (`SessionFormatUnsupportedError`).

## Done
- **D1**: `npm run typecheck`, `npm run build`, `npm test` green on `0.1.5-rc.2` with no `as any`/`@ts-expect-error` introduced. Live token-by-token render is driven by `agent/assistant-stream` frames (observed in the acceptance run). `/resume` lists sessions with cold titles and last-activity times from one handle read per non-live row; an unreadable log still yields the disabled "Unreadable session" row.
- **D2**: HARD PRECONDITION — no dsh process holds any session under the store when the apply run starts, and the script has verified this itself (it refuses otherwise). Then: every real V0 log under `tools/orch/dsh_home/sessions/` (excluding `*pytest*`) is at V3 at its canonical path, its V0 bytes preserved in an exclusive `.v0` sibling, the script's own pre-apply snapshot exists, the apply report shows 59 migrated / 2 skipped-with-reason / 0 busy / 0 conflicts / 0 errors, and `verify-session-v3.mjs` opens at least one migrated log through rc.2 persistence without `SessionFormatUnsupportedError`. D2 acceptance does not depend on the TUI.

## Proof
| Check | Establishes | Does NOT establish |
|---|---|---|
| `tsc` typecheck/build | consumed shapes match the installed `.d.ts` | that the runtime emits frames on the ctx the TUI listens on |
| vitest: synthetic frames + synthetic `assistant/message`/`assistant/attempt` events | fold/timing/token logic incl. stale attemptId, stale revision, stale end, abandoned, attempt-only | wire ordering of `end` vs durable event (U3) |
| vitest: resume with a fake `sessionPersistence` | one read feeds title + lastActivity; abort closes; degrade-to-disabled row | real `read()` paging/inherited semantics (U2) |
| Live run `dsh --profile tui` checklist | frames drive render; glyph transitions; `/resume` works | anything beyond that profile |
| P5 per-file self-check (decompress temp → header `version===3`) | migrated bytes parse with the V3 stamp | rc.2 acceptance |
| `scripts/verify-session-v3.mjs` (rc.2 `open(id,'read')` → `read()`) | rc.2 accepts the migrated log; the negative case fires on V0 | semantic equivalence of every event (catalog's job) |
| vitest on the migration script (synthetic V0 fixture in a temp store) | crash-safe commit incl. orphan-tmp start state, idempotence, conflict, unreadable, pytest exclusion, quiescence refusal | the 2 odd-header real logs (reported, not asserted) |
| Quiescence gate (fd scan + per-file lock probe) | no holder at check time; a held session is refused per file | a writer that starts AFTER the gate passes (residual, see Trade) |

## Anti (foreclosed shortcuts)
- Deleting `case 'assistant/chunk'` without the frame listener → P1 test asserts `streaming.update` per chunk frame AND the live run.
- Coarsening the live glyph to "always waiting" → timing tests assert thinking→responding from frames.
- Guarding only `attemptId` → tests include same-attemptId stale-revision chunk and a stale `end`.
- `lastActivityAt` returning `undefined` for non-live rows → resume test asserts the stub log's last event time.
- Swallowing resume errors → only the row degrades; no raw path/id/bytes in row text.
- D2 mutating originals → canonical inode is only ever replaced by atomic rename of a validated temp; tests assert `.v0` bytes equal input and canonical present at every step.
- D2 skipping preservation when `.v0` exists → hard per-file error unless bytes equal current canonical.
- D2 quiescence as advice only → the gate is code: apply mode exits non-zero without touching any file when a holder is found; the detector failing to run (e.g. `/proc` unreadable) is itself a refusal. `--dry-run` cannot bypass the gate for apply; there is no `--force`.
- Real session bytes in the test tree → fixture synthesized in the test file.
- Counting usage twice → tokens test with both `usage` and a usage chunk asserts one count.

## Bounds
In: BC1–BC7 rewires, tests below, two devDependencies (`dsh-tool-todo`, `dsh-session-format-catalog`), the migration script (with snapshot + quiescence gate built in), the verify script, the acceptance run. Out: the 6-feature TUI upgrade, todos-projection move, cordis/schemastery/pi-tui changes, migrating `sessions.rc6.bak/` (both scripts take `--store`), any Foundry Python change, any general online writer-coordination scheme (attended one-time offline migration only).

## Trade
- **Resume browsing cost**: one handle open + full read per non-live row, bounded by `resumeScanConcurrency` and abort; one read feeds title and last-activity.
- **Live phase glyph**: process-local `LiveStepPhase` fed from frames; same fidelity (frame `time` is the persisted stamp); lost on TUI restart mid-step until the next frame.
- **Timing fold seam**: one pure function over `TimedStreamChunk[]` for replay and live.
- **D2 commit protocol**: validate → preserve (copy `COPYFILE_EXCL`, not hard link, so an old-harness append during a crash window cannot alter the preserved bytes) → rename. Costs one extra read + byte compare per file; buys a canonical file present at every instant.
- **D2 quiescence gate**: two detectors (whole-run `/proc` fd scan; per-file rc.2 lock probe when U11 exposes one) plus the operator precondition. Buys lost-append safety for the snapshot and every rename; sells one residual TOCTOU (a dsh started after the scan and before a given file's rename). Accepted: the operator is attending and instructed to start nothing; the per-file probe narrows the window to milliseconds per file. A general lock-held-for-the-whole-run scheme is out of scope.
- **Snapshot inside the script**: moving `cp -a` under the gate costs a fresh `sessions.v0-<runId>.bak/` per apply that actually migrates something; buys that the snapshot is never a live-store race. Reruns with nothing to migrate take no snapshot.

## Unknown (implementer confirms before coding the consumer)
- **U1 (test first)**: TUI `ctx` receives `agent/assistant-stream` for its agent; temporary `console.error(f.type)` listener in a live run.
- **U2**: `SessionHandle.read()` return shape; full log from seq 0 including inherited, or own suffix only (then `readCompleteLog` fetches the parent prefix).
- **U3**: `end` frame vs durable event ordering; design idempotent either way.
- **U4**: `AskUserQuestionRequestEvent` field names; `ctx.on` returns the disposer.
- **U5**: `assistant/message.usage` equals the stream's last `usage` chunk.
- **U6**: catalog entrypoint (programmatic vs CLI; JSONL text vs records; header id rewrite).
- **U7**: `dsh` non-interactive mode; the 2 odd-header logs.
- **U8**: `persistence.open(id,'read',opts)` accepts an abort signal.
- **U9**: how to construct rc.2 `sessionPersistence` against a store root outside the TUI.
- **U10**: minimal V0 event set the v0→v1 step accepts (for the synthetic fixture).
- **U11 (F6, resolve before P5 code)**: the rc.2 per-session lock mechanism as exposed to a standalone script: (a) a lock file beside the log (name/location) whose presence/flock state marks a holder, and/or (b) an `open(id, <write access>)` that throws a distinct held/busy error class, and whether that acquisition happens BEFORE format validation (if `SessionFormatUnsupportedError` fires first on a V0 log, (b) cannot probe V0 files and (a) is the per-file detector). The gate's per-file leg uses whichever is real; if neither is exposed, the per-file leg is absent and the whole-run fd scan + operator precondition are the load-bearing gate (documented in the report header as `perFileProbe:none`).
- **U12**: whether rc.2 persistence keeps the log fd open between appends (determines how much the fd scan alone can see; motivates U11's per-file leg).

## Deliverables
1. `dsh-tui` branch (operator-owned), commits per phase P0–P4.
2. `dsh-tui/scripts/migrate-sessions.mjs`, `dsh-tui/scripts/verify-session-v3.mjs`, vitest coverage, per-invocation report `<root>/sessions.migration-<runId>.log`, script-made snapshot `<root>/sessions.v0-<runId>.bak/`, `.v0` siblings beside each migrated log.

## Steps

### P0 — deps + mechanical (BC1, BC6, BC7)
- `package.json`: add `@deepseek-ai/dsh-tool-todo@0.1.5-rc.2` (devDependencies + overrides + peer `^0.1.5-rc.1`) and `@deepseek-ai/dsh-session-format-catalog@0.1.5-rc.2` (devDependencies + overrides); `npm install`.
- 13 `.events` → `.snapshotEvents()`: `src/index.ts` 409, 448, 541, 744, 750, 859, 1086, 1323, 1793, 1903; `src/chat/tokens.ts:80`; `src/chat/helpers.ts:94`; `src/chat/resume.ts:109`.
- `skill-invocation.ts:7`: `assertNever` from `@deepseek-ai/dsh-util-values`. `transcript.ts:21`: `JsonValue` from `dsh-util-values`, `TodoItem` from `dsh-tool-todo`. `index.ts`: `import type {} from '@deepseek-ai/dsh-tool-todo'` beside line 37.
- **Accept**: remaining errors only at BC2/BC3/BC4/BC5 sites. Commit.

### P3 (pulled forward) — questions.ts (BC5)
- `const dispose = ctx.on('user-questions/request', async (request, next) => {...existing ask body...; return answer})`; `unregister` calls `dispose`; never `next()` on the claim path.
- Test: handler resolves the queued `PendingQuestion` and does not delegate.
- **Accept**: `questions.ts` clean; U4 confirmed first.

### P1 — streaming rewire (BC2) + timing + tokens
- `src/index.ts`: delete `case 'assistant/chunk'`; add `case 'assistant/attempt'` (feed timing/tokens; if live component open for `{turn,step}` and unsettled → `retractFailedStreaming()`); add `ctx.on('agent/assistant-stream', ({frame}) => onStreamFrame(frame))` beside both `session/event` registrations (1774/1812).
- `onStreamFrame` with `live: {attemptId, revision, turn, step} | null` and `isLive(frame) = live !== null && frame.attemptId === live.attemptId && frame.revision === live.revision`:
  - `start`: if `live` open with different identity → `retractFailedStreaming()`; set `live`; `startAssistantStep({turn,step})`; `livePhase.begin(turn, step)`.
  - `chunk`: `!isLive` → ignore; else `streaming.update(frame.chunk)`; `applyTurnFolding(turn)`; `livePhase.observe(frame.time, frame.chunk)`.
  - `end`: `!isLive` → ignore entirely (no retract, no clear); else `abandoned` or committed `assistant/attempt` → `retractFailedStreaming()`; committed `assistant/message` → nothing (durable event settles at 958); then clear `live`, `livePhase.reset()`.
- `src/chat/timing.ts`: pure `foldStreamTiming(chunks: readonly TimedStreamChunk[], ...)` with the existing classification; replay calls `expandAssistantStream(event.data.stream)` for `assistant/message`/`assistant/attempt`; tools phase stays on durable tool events; `openStepPhase`/`runningPhaseGlyph` read `LiveStepPhase`.
- `src/chat/tokens.ts`: `assistant/message` → `event.data.usage` else last of `assistantStreamChunks(stream,'usage')`; `assistant/attempt` → last usage chunk; remove the chunk branch.
- Tests: normal sequence; abandoned; foreign attemptId chunk; same-attemptId stale-revision chunk; stale `end` (either field) neither retracts nor clears and a following live chunk still renders; start-while-open retracts old; attempt-only durable event; `foldStreamTiming` nonzero thinking+responding; live phase transitions; single usage count.
- **Accept**: three files clean; tests green; U1 probe done.

### P2 — resume.ts handle-read (BC3 + BC4)
- `readCompleteLog(persistence, id, signal)`: `open(id,'read'[, {signal}])` → `read()` (loop if paged) → `inheritedEventCount` → `finally close()`.
- `projectedTitle`: live → `sessionProjections.snapshot(live)`; non-live → `sessionProjectionCache.cachedSnapshot(header, inheritedEventCount)` ?? `coldSnapshot(header, inheritedEventCount, events)`.
- `lastActivityAt`: live → `snapshotEvents().at(-1)?.time`; non-live → `events.at(-1)?.time` from the same read. Errors/abort → disabled "Unreadable session" row. Keep `resumeScanConcurrency`.
- Tests: one open/close per row with correct title + time; reject → disabled row; abort → close called; live row opens nothing.
- **Accept**: typecheck fully green.

### P4 — build, full suite, live acceptance (D1)
- `npm run typecheck && npm run build && npm test` (full vitest).
- Headless attempt per U7 (frame counter ≥1 start, ≥1 chunk, 1 end per step) or skip.
- Interactive `dsh --profile tui` checklist: incremental render; glyph thinking→responding; settle identical after `/resume`; `/resume` rows show titles + times. OPTIONAL combined smoke if D2 landed: a migrated session opens and replays.
- Diff-review `python -m tools.review.codex_audit --repo /home/bwu/work/dsh-tui ...`, ≤3 rounds; operator merges.

### P5 (D2, independent) — session store V0→V3
- **Operator precondition (hard, stated in the script's `--help` and the report header)**: stop every dsh process using `<root>` before running apply. The script verifies this itself and refuses otherwise.
- **CLI**: `scripts/migrate-sessions.mjs --store <root> [--dry-run]`. Pytest workspace exclusion built in. No other flags.
- **Report (S2)**: `runId = <ISO>-<dry|apply>`; `<root>/sessions.migration-<runId>.log`; line 0 `{runId, mode, store, startedAt, gate:{fdScan, perFileProbe:'lock-file'|'open-write'|'none'}, snapshotDir?}`; one line per file `{runId, relPath, outcome, detail?}`; last line totals `{migrated, skippedAlreadyV3, skippedUnreadableHeader, busy, conflicts, errors}`.
- **Apply-mode sequence**:
  1. **Quiescence gate (F6), whole run**: resolve `<root>` to a real path; scan `/proc/[0-9]*/fd/*` via `readlinkSync`, excluding own pid; any target under `<root>/sessions` ⇒ exit non-zero with `store-busy` (report the pid count only, not the paths of the held logs beyond relPath) and touch nothing. If `/proc` is unreadable or the scan throws ⇒ exit non-zero `gate-unavailable` (fail closed). Also apply the per-file probe from U11 across ALL candidate files up front; any holder ⇒ same refusal. Dry-run also runs the gate and reports its verdict but never exits on it (nothing is written in dry-run).
  2. **Classify** every candidate (step 0 below) without writing. If `migrate-able == 0` ⇒ report totals and exit 0 with no snapshot.
  3. **Snapshot under the gate**: `cp -a`-equivalent recursive copy of `<root>/sessions` to `<root>/sessions.v0-<runId>.bak/` (fresh name per run; refuse if it exists). Re-run the fd scan immediately after; a new holder ⇒ `store-busy`, leave the snapshot, touch no session file.
  4. **Per-file commit**, re-running the per-file probe (U11 leg) immediately before step 1 of each file; a holder ⇒ `error:session-busy`, skip that file, continue the batch.
- **Per-file protocol (F2)** with `canonical`, `v0 = canonical + '.v0'`, `tmp = canonical + '.v3.tmp'`:
  0. Read `canonical` → `zlib.zstdDecompressSync` → header. `version===3` → `skip:already-v3`; unparseable/other shape → `skip:unreadable-header`; decompress failure → `error:unreadable`. Dry-run stops here.
  1. Catalog chained V0→V3 → `zlib.zstdCompressSync` → write `tmp` with `'w'` (an orphan `tmp` from a prior crash is overwritten; it is ours by name), fsync; re-read `tmp`, decompress, assert header `version===3`; failure → unlink `tmp`, `error:validate-failed`. Nothing else touched.
  2. `copyFileSync(canonical, v0, COPYFILE_EXCL)`, fsync `v0`. `EEXIST` → compare `v0` bytes with the in-memory canonical bytes; equal → proceed; differ → unlink `tmp`, `error:v0-conflict`.
  3. `renameSync(tmp, canonical)`; fsync dir; `migrated`.
  - Recovery: crash after 1 → orphan `tmp`, rerun overwrites (tested, S3); after 2 → `v0` equals canonical, rerun passes the compare; after 3 → `already-v3`. No state lacks a canonical file; no state a rerun cannot classify. The canonical path is never opened for writing.
- **Standalone acceptance (F4)**: `scripts/verify-session-v3.mjs --store <root> --id <id>` constructs rc.2 `sessionPersistence` (U9), `open(id,'read')` → `read()` → `close()`, prints event count, exit 0; non-zero naming the error class otherwise. Run on one migrated id; run on a `.v0` copy placed at canonical position in a scratch store to confirm the negative case fires.
- **Tests (F3, S3, F6)** — fixture from `makeV0Log()` (attested header shape + U10 events) compressed into a temp store:
  - migrates: canonical V3, `v0` equals input;
  - rerun → `already-v3`, no mtime changes;
  - pre-existing equal `v0` → migrates; differing `v0` → `v0-conflict`, files untouched, no `tmp`;
  - **orphan `tmp` (random bytes) beside a V0 canonical → run completes, canonical V3, `v0` equals input, no `tmp` remains** (S3);
  - truncated zstd → `unreadable`, untouched;
  - `*pytest*` workspace not visited;
  - report has header, per-file, totals lines with run id; dry-run writes no session files and no snapshot;
  - **gate: spawn a child `node -e` that holds a file under the temp store open and idles; apply exits non-zero `store-busy`, no snapshot dir, no session file changed; kill child; apply then succeeds** (F6). If U11 yields a per-file probe, add: a held lock (created per the discovered mechanism) on one session → that file `session-busy`, the others migrate;
  - snapshot dir exists after a successful apply and its files equal the pre-run canonicals.
- **Accept**: apply report totals 59 migrated / 2 skipped-with-reason / 0 busy / 0 conflicts / 0 errors with `gate.fdScan: clean`; `verify-session-v3.mjs` passes on a migrated id and fails on the V0 negative case; `sessions.v0-<runId>.bak/` present.

## Operator decisions
None mandatory. Recommendation: leave `sessions.rc6.bak/` unmigrated (stale backup; `--store` covers it later).