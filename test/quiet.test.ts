import { describe, expect, it } from 'vitest'
import { createQuietCommand, type TranscriptView } from '../src/chat/details.ts'
import { StepTimingTracker } from '../src/chat/timing.ts'
import { StreamingAssistantComponent } from '../src/components/transcript.ts'
import { createPalette, markdownTheme } from '../src/components/theme.ts'
import type { ContextVisibility, ReasoningFold } from '../src/config.ts'
import type { ToolCardVisibility } from '../src/components/transcript.ts'

const STOCK: TranscriptView = { tools: 'collapsed', reasoning: 'full', context: 'collapsed' }

function harness(startup: TranscriptView = STOCK, initial: TranscriptView = startup) {
  let view = { ...initial }
  const calls: string[] = []
  const palette = createPalette(false)
  const stream = new StreamingAssistantComponent(
    { turn: 0, step: 0 }, () => [], new StepTimingTracker(), () => 0,
    view.reasoning, palette, markdownTheme(palette),
  )
  stream.update({ type: 'reasoning-delta', index: 0, text: 'Streaming reasoning.' })
  stream.setFoldedContinuation(view.tools === 'hidden')

  const setTools = (tools: ToolCardVisibility): void => {
    view = { ...view, tools }
    calls.push(`tools:${tools}`)
    // Mirrors the existing index.ts setter's applyTurnFolding path.
    stream.setFoldedContinuation(tools === 'hidden')
  }
  const setReasoning = (reasoning: ReasoningFold): void => {
    view = { ...view, reasoning }
    calls.push(`reasoning:${reasoning}`)
    stream.setReasoningFold(reasoning)
  }
  const setContext = (context: ContextVisibility): void => {
    view = { ...view, context }
    calls.push(`context:${context}`)
  }
  const run = createQuietCommand(startup, () => ({ ...view }), setTools, setReasoning, setContext)
  return { run, current: () => view, calls, stream, setTools, setReasoning, setContext }
}

describe('/quiet session toggle', () => {
  it('hides cards, context and streaming reasoning, then restores the exact prior view', () => {
    const prior: TranscriptView = { tools: 'expanded', reasoning: 'preview', context: 'expanded' }
    const h = harness(STOCK, prior)
    expect(h.run('on')).toEqual({ kind: 'success' })
    expect(h.current()).toEqual({ tools: 'hidden', reasoning: 'off', context: 'hidden' })
    expect(h.calls).toEqual(['reasoning:off', 'tools:hidden', 'context:hidden'])
    expect(h.stream.hasVisibleBody()).toBe(false)
    expect(h.stream.render(40)).toEqual([]) // hidden turn continuation has no visible body

    expect(h.run('off')).toEqual({ kind: 'success' })
    expect(h.current()).toEqual(prior)
    expect(h.calls.slice(3)).toEqual(['reasoning:preview', 'tools:expanded', 'context:expanded'])
    expect(h.stream.hasVisibleBody()).toBe(true)
    expect(h.stream.render(40).join('')).toContain('Assistant')
    expect(h.stream.render(40).join('')).toContain('Reasoning')
  })

  it('treats repeated on as a no-op without replacing the original snapshot', () => {
    const prior: TranscriptView = { tools: 'expanded', reasoning: 'preview', context: 'expanded' }
    const h = harness(STOCK, prior)
    h.run('on')
    const callsAfterFirstOn = h.calls.length
    expect(h.run('on')).toEqual({ kind: 'success' })
    expect(h.calls).toHaveLength(callsAfterFirstOn)
    h.run('off')
    expect(h.current()).toEqual(prior)
  })

  it('uses no argument to toggle on and then off', () => {
    const h = harness()
    h.run('')
    expect(h.current()).toEqual({ tools: 'hidden', reasoning: 'off', context: 'hidden' })
    h.run('')
    expect(h.current()).toEqual(STOCK)
  })

  it('restores configured startup when off has no snapshot, and clears a used snapshot', () => {
    const h = harness(STOCK, { tools: 'expanded', reasoning: 'preview', context: 'expanded' })
    h.run('off')
    expect(h.current()).toEqual(STOCK)
    h.setTools('expanded')
    h.setReasoning('preview')
    h.setContext('expanded')
    h.run('on')
    h.run('off')
    expect(h.current()).toEqual({ tools: 'expanded', reasoning: 'preview', context: 'expanded' })
    h.setTools('hidden') // non-quiet because reasoning remains preview
    h.run('off')
    expect(h.current()).toEqual(STOCK) // a stale preQuiet would restore expanded/preview
  })

  it('falls back to stock when configured startup is quiet, including on from quiet', () => {
    const quiet: TranscriptView = { tools: 'hidden', reasoning: 'off', context: 'hidden' }
    const h = harness(quiet)
    expect(h.run('on')).toEqual({ kind: 'success' })
    expect(h.calls).toEqual([])
    h.run('off')
    expect(h.current()).toEqual(STOCK)
    h.run('')
    expect(h.current()).toEqual(quiet)
    h.run('')
    expect(h.current()).toEqual(STOCK)
  })

  it('rejects unknown arguments before changing any dimension', () => {
    const h = harness()
    for (const input of ['maybe', 'on off', 'OFF']) {
      const before = h.calls.length
      expect(h.run(input).kind).toBe('error')
      expect(h.calls).toHaveLength(before)
      expect(h.current()).toEqual(STOCK)
    }
  })
})
