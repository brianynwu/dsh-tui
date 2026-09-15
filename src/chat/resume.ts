/**
 * Session-resume sub-controller for the interactive chat channel: the
 * `/resume` selector, one metadata-plus-title scan that tolerates a corrupt
 * neighbor, the pre-handoff preflight, and the terminal handoff itself.
 * @module @deepseek-ai/dsh-tui/chat/resume
 */

import type { TUI } from '@earendil-works/pi-tui'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import { errorChain } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-session-title'
import type {
  SessionQueryEngine,
  SessionRecord,
} from '@deepseek-ai/dsh-session-query'
import type { HintEditor } from './helpers.ts'
import { formatCwd } from './helpers.ts'
import type { TuiOverlaySession } from '../extension/types.ts'
import type { TuiRuntime } from '../runtime.ts'
import {
  ResumePicker,
  summarizeResumeCandidate,
  type ResumeCandidate,
} from '../components/dialogs.ts'
import type { ChannelNotice, ChatChannelDeps } from './channel.ts'
import { readCompleteLog, resolveRows, type ResumeRowMeta, type ResumeScanDeps } from './resume-scan.ts'

/** Collaborators the resume controller needs from the chat channel. */
export interface ResumeControllerDeps extends ChatChannelDeps, ChannelNotice {
  readonly agent: Agent
  readonly runtime: TuiRuntime
  /**
   * The optional session-query service, re-read at each use. `sessionQuery` is
   * mounted by an independent plugin, and a flat config tree gives no ordering
   * guarantee between it and this front door, so a value captured once at
   * construction can be `undefined` even though the service arrives moments later.
   */
  readonly sessionQuery: (this: void) => SessionQueryEngine | undefined
  readonly ui: TUI
  readonly editor: HintEditor
  /** Current agent status, re-read at each resume precondition point. */
  agentStatus(): AgentStatus
}

/** Session-resume controller for one chat channel. */
export interface ResumeController {
  /** Open the searchable session selector, scoped to this workspace until the user widens it. */
  showResume(): void
}

/**
 * Build the session-resume controller for one chat channel.
 * @param deps - channel collaborators, terminal handles, and optional services.
 * @returns the controller wired to the `/resume` command.
 */
export function createResumeController(deps: ResumeControllerDeps): ResumeController {
  const {
    ctx, agent, runtime, resolved, palette, overlayManager,
    sessionQuery, ui, editor,
  } = deps
  let resumeOverlay: TuiOverlaySession | undefined
  let resumeInFlight = false
  let resumeScan = 0

  /** Label any session's own workspace the way the prompt labels the current one. */
  const workspaceLabel = (cwd: string | undefined): string =>
    runtime.formatCwd?.(cwd) ?? formatCwd(cwd)

  /** Summarize one record from metadata and its batch-folded title. */
  const summarize = (
    record: SessionRecord,
    title: string | undefined,
    lastActivityAt: number | undefined,
  ): ResumeCandidate => summarizeResumeCandidate(
    record,
    title,
    lastActivityAt,
    agent.session.id,
    agent.session.header.cwd,
    workspaceLabel,
  )

  /** The disabled fallback row for a session whose title read failed. */
  const unreadableCandidate = (
    record: SessionRecord,
    lastActivityAt: number | undefined,
    error: unknown,
  ): ResumeCandidate => ({
    record,
    title: 'Unreadable session',
    lastActivityAt: lastActivityAt ?? record.header.createdAt,
    currentWorkspace: record.header.cwd === agent.session.header.cwd,
    workspaceLabel: workspaceLabel(record.header.cwd),
    disabledReason: `session cannot be loaded: ${errorChain(error)}`,
  })

  /**
   * Assemble the resume-scan store access from the plugin context: live
   * in-memory reads, one-handle log reads ({@link readCompleteLog}, BC3/BC4), the
   * projection-cache cold title fold when the cache is mounted, and the
   * cache-absent batch title read. The bounded scan orchestration lives in
   * `./resume-scan.ts`.
   */
  const scanDeps = (listQuery: SessionQueryEngine): ResumeScanDeps => {
    const cache = ctx.get('sessionProjectionCache')
    return {
      liveEvents: (id) => ctx.sessions.get(id)?.snapshotEvents(),
      liveTitle: (id) => {
        const live = ctx.sessions.get(id)
        return live === undefined ? undefined : ctx.get('sessionProjections')?.snapshot(live).values.title
      },
      readLog: (id, signal) => readCompleteLog(ctx.get('sessionPersistence'), id, signal),
      cacheTitle: cache === undefined
        ? undefined
        : (record, log) => {
            const cached = cache.cachedSnapshot(record.header, log.inheritedEventCount)
            return cached !== undefined && 'title' in cached.values
              ? cached.values.title
              : cache.coldSnapshot(record.header, log.inheritedEventCount, log.events).values.title
          },
      batchTitles: (records, signal) => listQuery.readTitleSnapshots(records.map(record => record.header.id), signal),
      concurrency: resolved.resumeScanConcurrency,
    }
  }

  /** The latest logged provider/model route, for the preflight availability check. */
  const resumeRoute = (events: readonly SessionEvent[]): { provider: string; model: string } | undefined => {
    const header = events.findLast(item => item.type === 'request/header')
    if (header?.type === 'request/header') {
      return { provider: header.data.header.config.provider, model: header.data.header.config.model }
    }
    const assistant = events.findLast(item => item.type === 'assistant/message')
    return assistant?.type === 'assistant/message'
      ? { provider: assistant.data.message.source.provider, model: assistant.data.message.source.model }
      : undefined
  }

  /**
   * Re-read every mutable precondition immediately before terminal handoff and
   * resolve the exact identity and workspace the host will re-exec into. This
   * is where the one chosen log is fully read, replay-validated, and checked
   * for a currently-available route — the listing never does any of that.
   */
  const preflightResume = async (sessionId: SessionId): Promise<{ id: SessionId; cwd: string }> => {
    const query = sessionQuery()
    /* v8 ignore start -- showResume alone calls this after proving the optional service exists */
    if (query === undefined) throw new Error('Resume is unavailable: session query is not mounted.')
    /* v8 ignore stop */
    const initialStatus = deps.agentStatus()
    if (initialStatus !== 'idle') throw new Error(`Resume requires an idle agent (status: ${initialStatus}).`)
    const record = (await query.listSessions()).find(candidate => candidate.header.id === sessionId)
    if (record === undefined) throw new Error(`Session "${sessionId}" is no longer available.`)
    const candidate = summarize(record, undefined, undefined)
    if (candidate.disabledReason !== undefined) throw new Error(candidate.disabledReason)
    let events: readonly SessionEvent[]
    try {
      events = (await query.readSession(record.header.id)).events
    } catch (error: unknown) {
      throw new Error(`session cannot be loaded: ${errorChain(error)}`)
    }
    const route = resumeRoute(events)
    if (route !== undefined && !ctx.llm.listProviders().some(provider => provider.id === route.provider)) {
      throw new Error(`session is complete, but route is currently unavailable (${route.provider}/${route.model})`)
    }
    const cwd = record.header.cwd
    /* v8 ignore next -- summarizeResumeCandidate disables a cwd-less record, so the check above already rejected it */
    if (cwd === undefined) throw new Error(`Session "${sessionId}" has no recorded workspace to resume in.`)
    const finalStatus = deps.agentStatus()
    if (finalStatus !== 'idle') throw new Error(`Resume requires an idle agent (status: ${finalStatus}).`)
    return { id: record.header.id, cwd }
  }

  const handoffResume = async (candidate: ResumeCandidate, overlay: TuiOverlaySession): Promise<void> => {
    if (resumeInFlight) return
    resumeInFlight = true
    let terminalReleased = false
    try {
      const checked = await preflightResume(candidate.record.header.id)
      const hostHandoff = runtime.handoffResume
      if (hostHandoff === undefined) {
        await overlay.close()
        resumeOverlay = undefined
        deps.appendNotice('Session is resumable, but this host cannot hand it off in place.', 'warning')
        return
      }
      /* v8 ignore next -- shutdown during preflight invalidates an awaited service read or reaches this guard */
      if (deps.isDisposed()) return
      await ctx.sessions.flush(agent.session)
      // Disposal can run while the flush promise is pending.
      if (deps.isDisposed()) return
      if (agent.status !== 'idle') throw new Error(`Resume requires an idle agent (status: ${agent.status}).`)
      await overlay.close()
      resumeOverlay = undefined
      await runtime.terminal.drainInput(100, 20)
      // Disposal can run while terminal draining is pending.
      if (deps.isDisposed()) return
      // Release the terminal for the host re-exec without dumping the transcript
      // into the normal buffer (preserveScreen); the host takes over the screen.
      ui.stop({ preserveScreen: true })
      terminalReleased = true
      // The host re-execs into the session's own workspace: process cwd, not the
      // restored session header, is what the filesystem and shell tools resolve
      // against.
      await hostHandoff(checked.id, checked.cwd)
      throw new Error('resume host returned without replacing the process')
    } catch (error: unknown) {
      if (!deps.isDisposed()) {
        if (terminalReleased) {
          ui.start()
          ui.setFocus(editor)
          deps.appendNotice(`Resume handoff failed: ${errorChain(error)}`, 'error')
        } else {
          await overlay.close()
          resumeOverlay = undefined
          deps.appendNotice(`Resume failed: ${errorChain(error)}`, 'error')
        }
      }
    } finally {
      resumeInFlight = false
    }
  }

  return {
    showResume(): void {
      if (agent.status !== 'idle') {
        deps.appendNotice('Resume requires the current turn to finish or be cancelled first.', 'warning')
        return
      }
      const listQuery = sessionQuery()
      if (listQuery === undefined) {
        deps.appendNotice('Resume is not available: session query is not mounted.', 'warning')
        return
      }
      const scan = ++resumeScan
      void resumeOverlay?.close()
      // The picker opens before the scan settles so the terminal stops feeding
      // the editor immediately; a queued activation (the closing predecessor
      // still holds the slot) receives an already-scanned set through
      // `scanned` instead of a loading placeholder.
      let picker: ResumePicker | undefined
      let scanned: ResumeCandidate[] | undefined
      const session = overlayManager.open({
        create: (host) => {
          picker = new ResumePicker(
            scanned,
            resolved.maxResumeOptions,
            workspaceLabel(agent.session.header.cwd),
            () => host.viewport.rows,
            palette,
            (candidate) => { void handoffResume(candidate, session) },
            () => { void session.close() },
          )
          return picker
        },
        options: {
          width: '100%',
          maxHeight: '100%',
          anchor: 'top-left',
          margin: 0,
        },
      })
      resumeOverlay = session
      // Closing the picker — Escape, supersession, disposal — aborts the scan:
      // the borrowed-log pass over a large store must not outlive its overlay.
      const scanAbort = new AbortController()
      void session.closed.then(() => {
        scanAbort.abort()
        /* v8 ignore next -- overlay FIFO closes this session before a replacement can become the tracked resume overlay */
        if (resumeOverlay === session) resumeOverlay = undefined
      })
      deps.requestRender()
      /** Whether this scan's overlay, session generation, or TUI is gone. */
      const scanStale = (): boolean =>
        deps.isDisposed() || scan !== resumeScan || scanAbort.signal.aborted
      const scanCandidates = async (): Promise<void> => {
        // Every workspace in the store is listed; the picker owns the
        // current-workspace/all-workspaces scope split over the whole set.
        const records = await listQuery.listSessions(scanAbort.signal)
        if (scanStale()) return
        // Each row's title and last-activity time come from one bounded handle
        // read per not-live session (rc.2 has no metadata mtime and the cold
        // title fold needs the full log). A corrupt neighbor degrades to one
        // disabled row.
        const rows = await resolveRows(scanDeps(listQuery), records, scanAbort.signal)
        // A scan aborted during the per-row reads must not overwrite newer picker state.
        if (scanStale()) return
        const candidates = records.map((record, index) => {
          const row = rows[index] as ResumeRowMeta
          return 'failure' in row
            ? unreadableCandidate(record, row.lastActivityAt, row.failure)
            : summarize(record, row.title, row.lastActivityAt)
        })
        candidates.sort((a, b) => b.lastActivityAt - a.lastActivityAt
          || a.record.header.id.localeCompare(b.record.header.id))
        if (scanStale()) return
        scanned = candidates
        picker?.setCandidates(candidates)
        deps.requestRender()
      }
      // One catch covers listing, titles, and mtimes, so a scan failure
      // cannot strand the overlay on its loading placeholder; an aborted
      // scan's rejection stays silent because the user already dismissed the
      // picker.
      void scanCandidates().catch((error: unknown) => {
        if (scanStale()) return
        void session.close()
        deps.appendNotice(`Resume session scan failed: ${errorChain(error)}`, 'error')
      })
    },
  }
}
