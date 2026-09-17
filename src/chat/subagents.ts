/** Read-only child catalog and transcript view for the main agent's durable direct children. */
import { Container, Spacer, Text, type Component } from '@earendil-works/pi-tui'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentStatus, AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import { isReplacementSurfaceEvent, type SessionEvent, type SessionId } from '@deepseek-ai/dsh-session'
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

export type SubagentRow = SubagentListEntry & { readonly execution?: AgentStatus }

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
  private readonly steps = new Map<string, StreamingAssistantComponent>()
  private readonly stream = new LiveStreamController()
  private readonly timing = new StepTimingTracker()
  private readonly mdTheme
  private cursor = -1
  private activePosition: { turn: number; step: number } | undefined

  constructor(
    readonly childId: SessionId,
    label: string | undefined,
    private readonly palette: Palette,
    private readonly resolved: ResolvedTuiConfig,
  ) {
    super()
    this.mdTheme = markdownTheme(palette)
    this.addChild(new Text(palette.bold(palette.accent(`Viewing child ${displayText(label ?? childId)}`)), 0, 0))
    this.addChild(new Text(palette.dim('Read only · submissions and controls remain on main'), 0, 0))
  }

  get lastSequence(): number { return this.cursor }

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
          this.addChild(new ContextCardComponent(label, text, this.resolved.maxToolOutputLines, this.palette))
        }
        break
      }
      case 'step/start':
        this.ensureStep(event.data.turn, event.data.step)
        break
      case 'assistant/message': {
        const step = this.ensureStep(event.data.turn, event.data.step)
        step.settle(event.data.message.content)
        break
      }
      case 'tool/call': {
        const card = new ToolCardComponent(
          event.data.name, parseArguments(event.data.arguments), undefined,
          this.resolved.maxToolOutputLines, this.resolved.maxDiffEditLength,
          this.palette, this.mdTheme,
        )
        card.setVisibility(this.resolved.toolCardVisibility)
        this.tools.set(event.data.callId, card)
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
    if (action.kind === 'chunk') this.ensureStep(action.position.turn, action.position.step).update(action.chunk)
    if (action.kind === 'end' && action.retract && this.activePosition !== undefined) {
      const key = `${this.activePosition.turn}:${this.activePosition.step}`
      const step = this.steps.get(key)
      if (step !== undefined && !step.isSettled()) {
        this.removeChild(step)
        this.removeChild(step.timing)
        this.steps.delete(key)
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
      this.resolved.reasoningFold, this.palette, this.mdTheme,
    )
    this.steps.set(key, component)
    this.addChild(component)
    this.addChild(component.timing)
    return component
  }
}

export interface SubagentSwitcher {
  readonly rows: readonly SubagentRow[]
  readonly selectedId: SessionId | undefined
  refresh(): Promise<void>
  open(): Promise<boolean>
  next(): void
  prev(): void
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
  let rows: SubagentRow[] = []
  let selectedId: SessionId | undefined
  let generation = 0
  let refreshAbort: AbortController | undefined
  let viewAbort: AbortController | undefined
  let detachEvent: (() => unknown) | undefined
  let detachFrame: (() => unknown) | undefined
  let disposed = false

  const detachView = (): void => {
    viewAbort?.abort()
    viewAbort = undefined
    detachEvent?.()
    detachEvent = undefined
    detachFrame?.()
    detachFrame = undefined
  }
  const publishRows = (): void => deps.onRows(rows, selectedId)
  const back = (): void => {
    generation += 1
    detachView()
    selectedId = undefined
    deps.onView(undefined)
    publishRows()
  }
  const select = (id: SessionId): void => {
    const row = rows.find(candidate => candidate.kind === 'child' && candidate.id === id)
    if (row?.kind !== 'child') return
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
    const query = ctx.get('sessionQuery', false)
    if (query === undefined) {
      deps.onError('Child transcript service is unavailable.')
      back()
      return
    }
    void query.observeSession(id, { signal: abort.signal, projectionMode: 'none' }).then(observation => {
      try {
        if (disposed || abort.signal.aborted || ownGeneration !== generation) return
        const view = new ChildTranscript(id, row.label, deps.palette, deps.resolved)
        view.replay(observation.events)
        for (const event of buffered.sort((a, b) => a.seq - b.seq)) {
          if (view.addEvent(event) === 'gap') { select(id); return }
        }
        buffered.length = 0
        transcript = view
        deps.onView(view)
      } finally {
        observation[Symbol.dispose]()
      }
    }).catch(() => {
      if (disposed || abort.signal.aborted || ownGeneration !== generation) return
      deps.onError('Child transcript could not be loaded.')
      back()
    })
  }
  const selectRelative = (direction: number): void => {
    const children = rows.filter((row): row is Extract<SubagentRow, { kind: 'child' }> => row.kind === 'child')
    if (children.length === 0) return
    const current = children.findIndex(row => row.id === selectedId)
    const index = current < 0 ? (direction > 0 ? 0 : children.length - 1)
      : (current + direction + children.length) % children.length
    const next = children[index]
    if (next !== undefined) select(next.id)
  }
  const refresh = async (): Promise<void> => {
    refreshAbort?.abort()
    const abort = new AbortController()
    refreshAbort = abort
    try {
      const entries = await ctx.subagents.listChildren(main.session.id, abort.signal)
      if (disposed || abort.signal.aborted) return
      rows = projectSubagents(entries, ctx, main)
      if (selectedId !== undefined && !rows.some(row => row.kind === 'child' && row.id === selectedId)) back()
      else publishRows()
    } catch {
      if (!disposed && !abort.signal.aborted) deps.onError('Child agent list is unavailable.')
    }
  }
  const timer = setInterval(() => { void refresh() }, 2000)
  void refresh()
  return {
    get rows() { return rows },
    get selectedId() { return selectedId },
    refresh,
    open: async () => {
      await refresh()
      if (disposed) return false
      const first = rows.find(row => row.kind === 'child')
      if (first?.kind !== 'child') return false
      if (selectedId === undefined) select(first.id)
      return selectedId !== undefined
    },
    next: () => selectRelative(1),
    prev: () => selectRelative(-1),
    back,
    dispose: () => {
      disposed = true
      clearInterval(timer)
      refreshAbort?.abort()
      detachView()
    },
  }
}
