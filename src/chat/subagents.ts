/** Read-only child catalog and transcript view for the main agent's durable direct children. */
import { Container, Spacer, Text, type Component } from '@earendil-works/pi-tui'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentStatus, AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import { isReplacementSurfaceEvent, type SessionEvent, type SessionHeader, type SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentListEntry } from '@deepseek-ai/dsh-subagent'
import { contentText, parseArguments } from '../components/content.ts'
import { LiveStreamController } from './stream.ts'
import { StepTimingTracker } from './timing.ts'
import { isCompactCheckpoint } from './helpers.ts'
import { displayText } from '../components/text.ts'
import { markdownTheme, type Palette } from '../components/theme.ts'
import {
  ContextCardComponent, StreamingAssistantComponent, ToolCardComponent, UserMessageComponent,
} from '../components/transcript.ts'
import type { ResolvedTuiConfig } from '../config.ts'
import type { TranscriptView } from './details.ts'

export type SubagentOriginType = 'standard' | 'fork' | 'unknown'
export type SubagentRow = SubagentListEntry & {
  readonly execution?: AgentStatus
  readonly originType?: SubagentOriginType
}

/** Durable listing is authoritative for lineage; runtime ownership only qualifies active status. */
export function projectSubagents(entries: readonly SubagentListEntry[], ctx: Context, main: Agent): SubagentRow[] {
  return entries.map(entry => {
    if (entry.kind !== 'child') return entry
    const live = ctx.agents.get(entry.id)
    return live !== undefined && ctx.agents.isOwnedBy(entry.id, main)
      ? { ...entry, execution: live.status }
      : entry
  })
}

/** A separate component tree; its events never pass through the main transcript reducer. */
export class ChildTranscript extends Container {
  private readonly events: SessionEvent[] = []
  private readonly tools = new Map<string, ToolCardComponent>()
  private readonly allTools = new Set<ToolCardComponent>()
  private readonly contexts = new Set<ContextCardComponent>()
  private readonly steps = new Map<string, StreamingAssistantComponent>()
  private readonly turnSteps = new Map<number, StreamingAssistantComponent[]>()
  private readonly stream = new LiveStreamController()
  private readonly timing = new StepTimingTracker()
  private readonly mdTheme
  private cursor = -1
  private activePosition: { turn: number; step: number } | undefined
  private detailsState: TranscriptView

  constructor(
    readonly childId: SessionId,
    label: string | undefined,
    private readonly palette: Palette,
    private readonly resolved: ResolvedTuiConfig,
    details: TranscriptView,
  ) {
    super()
    this.detailsState = { ...details }
    this.mdTheme = markdownTheme(palette)
    this.addChild(new Text(palette.bold(palette.accent(`Viewing child ${displayText(label ?? childId)}`)), 0, 0))
    this.addChild(new Text(palette.dim('Read only · Ctrl+O/R and Alt+C adjust this view · Esc agents'), 0, 0))
  }

  get lastSequence(): number { return this.cursor }

  setDetails(details: TranscriptView): void {
    this.detailsState = { ...details }
    for (const card of this.allTools) card.setVisibility(details.tools)
    for (const card of this.contexts) card.setVisibility(details.context)
    for (const steps of this.turnSteps.values()) {
      for (const step of steps) step.setReasoningFold(details.reasoning)
    }
    for (const turn of this.turnSteps.keys()) this.applyTurnFolding(turn)
    this.invalidate()
  }

  private applyTurnFolding(turn: number): void {
    const steps = this.turnSteps.get(turn)
    if (steps === undefined) return
    let headerSeen = false
    for (const step of steps) {
      if (this.detailsState.tools !== 'hidden') step.setFoldedContinuation(false)
      else if (!headerSeen && step.hasVisibleBody()) {
        headerSeen = true
        step.setFoldedContinuation(false)
      } else step.setFoldedContinuation(true)
    }
  }

  /** Append exactly the next durable event; duplicates are harmless, gaps request a fresh observation. */
  addEvent(event: SessionEvent): 'added' | 'duplicate' | 'gap' {
    if (event.seq <= this.cursor) return 'duplicate'
    if (event.seq !== this.cursor + 1) return 'gap'
    this.cursor = event.seq
    this.events.push(event)
    if (isReplacementSurfaceEvent(event)) {
      if (isCompactCheckpoint(event)) this.addChild(new Text(this.palette.dim('Context compacted'), 0, 0))
      return 'added'
    }
    switch (event.type) {
      case 'user/message': {
        const text = contentText(event.data.content).trim()
        if (text === '') break
        if (event.data.source.kind === 'user') {
          this.addChild(new Spacer(1))
          this.addChild(new UserMessageComponent(displayText(text), this.palette, this.mdTheme))
        } else {
          const source = event.data.source as { kind?: string; plugin?: string }
          const label = source.plugin ?? source.kind ?? 'context'
          const card = new ContextCardComponent(label, text, this.resolved.maxToolOutputLines, this.palette)
          card.setVisibility(this.detailsState.context)
          this.contexts.add(card)
          this.addChild(card)
        }
        break
      }
      case 'step/start':
        this.ensureStep(event.data.turn, event.data.step)
        break
      case 'assistant/message': {
        const step = this.ensureStep(event.data.turn, event.data.step)
        step.settle(event.data.message.content)
        this.applyTurnFolding(event.data.turn)
        break
      }
      case 'tool/call': {
        const card = new ToolCardComponent(
          event.data.name, parseArguments(event.data.arguments), undefined,
          this.resolved.maxToolOutputLines, this.resolved.maxDiffEditLength,
          this.palette, this.mdTheme,
        )
        card.setVisibility(this.detailsState.tools)
        this.tools.set(event.data.callId, card)
        this.allTools.add(card)
        this.addChild(card)
        break
      }
      case 'tool/result': {
        const callId = event.data.message.source.callId
        const card = this.tools.get(callId)
        if (card !== undefined) { card.updateResult(event.data); this.tools.delete(callId) }
        break
      }
      case 'step/end':
        this.steps.get(`${event.data.turn}:${event.data.step}`)?.complete(event.time)
        this.stream.reset()
        this.activePosition = undefined
        break
      case 'turn/end':
        if (event.data.reason.kind !== 'completed') {
          this.addChild(new Text(this.palette.warning(`Turn ended: ${displayText(event.data.reason.kind)}`), 0, 0))
        }
        break
    }
    return 'added'
  }

  replay(events: readonly SessionEvent[]): void {
    for (const event of events) {
      if (this.addEvent(event) === 'gap') throw new Error('Child session observation is not contiguous')
    }
  }

  /** Ephemeral live chunks enrich the view; durable assistant/message settles the final content. */
  frame(frame: AssistantStreamFrame): void {
    const action = this.stream.frame(frame)
    if (action.kind === 'begin') {
      this.activePosition = action.position
      this.ensureStep(action.position.turn, action.position.step)
    }
    if (action.kind === 'chunk') {
      this.ensureStep(action.position.turn, action.position.step).update(action.chunk)
      this.applyTurnFolding(action.position.turn)
    }
    if (action.kind === 'end' && action.retract && this.activePosition !== undefined) {
      const key = `${this.activePosition.turn}:${this.activePosition.step}`
      const step = this.steps.get(key)
      if (step !== undefined && !step.isSettled()) {
        this.removeChild(step)
        this.removeChild(step.timing)
        this.steps.delete(key)
        const steps = this.turnSteps.get(this.activePosition.turn)
        if (steps !== undefined) {
          const index = steps.indexOf(step)
          if (index >= 0) steps.splice(index, 1)
          this.applyTurnFolding(this.activePosition.turn)
        }
      }
    }
    if (action.kind === 'end') this.activePosition = undefined
  }

  private ensureStep(turn: number, step: number): StreamingAssistantComponent {
    const key = `${turn}:${step}`
    const existing = this.steps.get(key)
    if (existing !== undefined && !existing.isSettled()) return existing
    const component = new StreamingAssistantComponent(
      { turn, step }, () => this.events, this.timing, () => Date.now(),
      this.detailsState.reasoning, this.palette, this.mdTheme,
    )
    this.steps.set(key, component)
    const stepsForTurn = this.turnSteps.get(turn) ?? []
    stepsForTurn.push(component)
    this.turnSteps.set(turn, stepsForTurn)
    this.applyTurnFolding(turn)
    this.addChild(component)
    this.addChild(component.timing)
    return component
  }
}

export interface SubagentSwitcher {
  readonly rows: readonly SubagentRow[]
  readonly selectedId: SessionId | undefined
  readonly details: TranscriptView
  setDetails(details: TranscriptView): void
  refresh(): Promise<void>
  select(id: SessionId): boolean
  back(): void
  dispose(): void
}

export interface SubagentSwitcherDeps {
  ctx: Context
  main: Agent
  palette: Palette
  resolved: ResolvedTuiConfig
  onRows(rows: readonly SubagentRow[], selectedId: SessionId | undefined): void
  onView(view: Component | undefined): void
  onRender(): void
  onError(message: string): void
}

/** Subscribe before observing, then merge the snapshot with buffered live events by sequence. */
export function createSubagentSwitcher(deps: SubagentSwitcherDeps): SubagentSwitcher {
  const { ctx, main } = deps
  let entries: readonly SubagentListEntry[] = []
  let rows: SubagentRow[] = []
  let selectedId: SessionId | undefined
  let childDetails: TranscriptView = {
    tools: deps.resolved.toolCardVisibility,
    reasoning: deps.resolved.reasoningFold,
    context: deps.resolved.contextVisibility,
  }
  let selectedTranscript: ChildTranscript | undefined
  const originTypes = new Map<SessionId, SubagentOriginType | 'invalid'>()
  const pendingTypes = new Map<SessionId, AbortController>()
  let generation = 0
  let refreshAbort: AbortController | undefined
  let viewAbort: AbortController | undefined
  let detachEvent: (() => unknown) | undefined
  let detachFrame: (() => unknown) | undefined
  let disposed = false

  const detachView = (): void => {
    selectedTranscript = undefined
    viewAbort?.abort()
    viewAbort = undefined
    detachEvent?.()
    detachEvent = undefined
    detachFrame?.()
    detachFrame = undefined
  }
  const publishRows = (): void => {
    const next: SubagentRow[] = []
    for (const row of projectSubagents(entries, ctx, main)) {
      if (row.kind !== 'child') { next.push(row); continue }
      const originType = originTypes.get(row.id)
      if (originType !== 'invalid') next.push({ ...row, originType: originType ?? 'unknown' })
    }
    rows = next
    if (selectedId !== undefined && !rows.some(row => row.kind === 'child' && row.id === selectedId)) {
      back()
      return
    }
    deps.onRows(rows, selectedId)
  }
  const back = (): void => {
    generation += 1
    detachView()
    selectedId = undefined
    deps.onView(undefined)
    publishRows()
  }
  const select = (id: SessionId): boolean => {
    const row = rows.find(candidate => candidate.kind === 'child' && candidate.id === id)
    if (row?.kind !== 'child') return false
    const query = ctx.get('sessionQuery', false)
    if (query === undefined) {
      deps.onError('Child transcript service is unavailable.')
      return false
    }
    generation += 1
    const ownGeneration = generation
    detachView()
    selectedId = id
    publishRows()
    deps.onView(new Text(deps.palette.dim(`Loading child ${displayText(row.label ?? id)}…`), 0, 0))
    const abort = new AbortController()
    viewAbort = abort
    const buffered: SessionEvent[] = []
    let transcript: ChildTranscript | undefined
    detachEvent = ctx.on('session/event', (session, event) => {
      if (session.id !== id || disposed || ownGeneration !== generation) return
      if (transcript === undefined) { buffered.push(event); return }
      const result = transcript.addEvent(event)
      if (result === 'gap') { select(id); return }
      if (result === 'added') deps.onRender()
    })
    detachFrame = ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (agent.id !== id || transcript === undefined || disposed || ownGeneration !== generation) return
      transcript.frame(frame)
      deps.onRender()
    })
    void query.observeSession(id, { signal: abort.signal, projectionMode: 'none' }).then(observation => {
      try {
        if (disposed || abort.signal.aborted || ownGeneration !== generation) return
        const header = observation.header as Partial<SessionHeader> | undefined
        if (header === undefined) {
          deps.onError('Child session metadata is unavailable.')
          back()
          return
        }
        if (header.parentSession !== main.session.id || header.origin !== 'subagent') {
          deps.onError('Child no longer belongs to this session.')
          back()
          return
        }
        const view = new ChildTranscript(id, row.label, deps.palette, deps.resolved, childDetails)
        view.replay(observation.events)
        for (const event of buffered.sort((a, b) => a.seq - b.seq)) {
          if (view.addEvent(event) === 'gap') { select(id); return }
        }
        buffered.length = 0
        transcript = view
        selectedTranscript = view
        deps.onView(view)
      } finally {
        observation[Symbol.dispose]()
      }
    }).catch(() => {
      if (disposed || abort.signal.aborted || ownGeneration !== generation) return
      deps.onError('Child transcript could not be loaded.')
      back()
    })
    return true
  }
  const refresh = async (): Promise<void> => {
    refreshAbort?.abort()
    const abort = new AbortController()
    refreshAbort = abort
    try {
      const listed = await ctx.subagents.listChildren(main.session.id, abort.signal)
      if (disposed || abort.signal.aborted) return
      entries = listed
      const ids = new Set(listed.filter(row => row.kind === 'child').map(row => row.id))
      for (const id of originTypes.keys()) if (!ids.has(id)) originTypes.delete(id)
      for (const [id, pending] of pendingTypes) {
        if (!ids.has(id)) { pending.abort(); pendingTypes.delete(id) }
      }
      publishRows()
      const query = ctx.get('sessionQuery', false)
      for (const id of ids) {
        if (originTypes.has(id) || pendingTypes.has(id)) continue
        if (query === undefined) { originTypes.set(id, 'unknown'); continue }
        const pending = new AbortController()
        pendingTypes.set(id, pending)
        void query.observeSession(id, { signal: pending.signal, projectionMode: 'none' }).then(observation => {
          try {
            if (disposed || pending.signal.aborted || pendingTypes.get(id) !== pending) return
            const header = observation.header as Partial<SessionHeader> | undefined
            originTypes.set(id, header === undefined ? 'unknown'
              : header.parentSession !== main.session.id || header.origin !== 'subagent' ? 'invalid'
                : typeof header.isSeeded !== 'boolean' ? 'unknown'
                  : header.isSeeded ? 'fork' : 'standard')
          } finally {
            observation[Symbol.dispose]()
          }
        }).catch(() => {
          if (!disposed && !pending.signal.aborted && pendingTypes.get(id) === pending) {
            originTypes.set(id, 'unknown')
          }
        }).finally(() => {
          if (pendingTypes.get(id) !== pending) return
          pendingTypes.delete(id)
          if (!disposed) publishRows()
        })
      }
    } catch {
      if (!disposed && !abort.signal.aborted) deps.onError('Child agent list is unavailable.')
    }
  }
  const timer = setInterval(() => { void refresh() }, 2000)
  void refresh()
  return {
    get rows() { return rows },
    get selectedId() { return selectedId },
    get details() { return { ...childDetails } },
    setDetails: details => {
      childDetails = { ...details }
      selectedTranscript?.setDetails(childDetails)
      if (selectedTranscript !== undefined) deps.onRender()
    },
    refresh,
    select,
    back,
    dispose: () => {
      disposed = true
      clearInterval(timer)
      refreshAbort?.abort()
      for (const pending of pendingTypes.values()) pending.abort()
      pendingTypes.clear()
      detachView()
    },
  }
}
