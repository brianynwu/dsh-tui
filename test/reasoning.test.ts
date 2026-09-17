import { describe, expect, it } from 'vitest'
import { StepTimingTracker } from '../src/chat/timing.ts'
import { applyDetailsArguments, handleReasoningShortcut } from '../src/chat/details.ts'
import { DetailsDialog, type DetailsSelection } from '../src/components/dialogs.ts'
import { StreamingAssistantComponent } from '../src/components/transcript.ts'
import { createPalette, markdownTheme } from '../src/components/theme.ts'
import type { ReasoningFold } from '../src/config.ts'

const palette = createPalette(false)
const theme = markdownTheme(palette)
const longReasoning = Array.from({ length: 28 }, (_, index) => `word${index}`).join(' ')

function assistant(fold: ReasoningFold): StreamingAssistantComponent {
  return new StreamingAssistantComponent(
    { turn: 0, step: 0 }, () => [], new StepTimingTracker(), () => 0, fold, palette, theme,
  )
}

function rows(component: StreamingAssistantComponent, width = 20): string[] {
  return component.render(width).map(line => line.trimEnd())
}

describe('reasoning fold render', () => {
  it('hides both the reasoning header and body at off, retaining the response', () => {
    const component = assistant('off')
    component.settle([{ type: 'reasoning', text: longReasoning }, { type: 'text', text: 'Answer.' }])
    expect(rows(component)).toEqual(['', 'Assistant', 'Answer.'])
  })

  it('previews three rendered rows after narrow-width wrapping, plus one omission cue', () => {
    const content = [{ type: 'reasoning', text: longReasoning }, { type: 'text', text: 'Answer.' }] as const
    const full = assistant('full')
    full.settle(content)
    const preview = assistant('preview')
    preview.settle(content)
    const fullBody = rows(full).slice(3, -1)
    const previewBody = rows(preview).slice(3, -1)
    expect(fullBody.length).toBeGreaterThan(3)
    expect(previewBody).toHaveLength(4)
    expect(previewBody.slice(0, 2)).toEqual(fullBody.slice(0, 2))
    expect(previewBody[2]).toContain(`+${fullBody.length - 3} lines`)
    expect(previewBody[3]).toBe(fullBody.at(-1))
  })

  it('uses the same fold in streaming and settled paths, including folded continuations', () => {
    const component = assistant('preview')
    component.update({ type: 'reasoning-delta', index: 0, text: longReasoning })
    component.update({ type: 'text-delta', index: 1, text: 'Answer.' })
    const livePreview = rows(component)
    expect(livePreview.some(line => line.startsWith('… +'))).toBe(true)
    component.settle([{ type: 'reasoning', text: longReasoning }, { type: 'text', text: 'Answer.' }])
    expect(rows(component)).toEqual(livePreview)
    component.setReasoningFold('off')
    expect(rows(component)).toEqual(['', 'Assistant', 'Answer.'])
    component.setReasoningFold('full')
    expect(rows(component).some(line => line.includes('word27'))).toBe(true)

    const continuation = assistant('off')
    continuation.settle([{ type: 'reasoning', text: 'Only reasoning.' }])
    continuation.setFoldedContinuation(true)
    expect(continuation.hasVisibleBody()).toBe(false)
    expect(rows(continuation)).toEqual([])
    continuation.setReasoningFold('preview')
    expect(continuation.hasVisibleBody()).toBe(true)
    expect(rows(continuation)).toContain('Reasoning')
  })
})

describe('reasoning controls', () => {
  it('the Ctrl+R handler cycles full → off → preview → full and ignores other input', () => {
    let fold: ReasoningFold = 'full'
    const set = (next: ReasoningFold): void => { fold = next }
    expect(handleReasoningShortcut('x', fold, set)).toBe(false)
    for (const expected of ['off', 'preview', 'full'] as const) {
      expect(handleReasoningShortcut('\x12', fold, set)).toBe(true)
      expect(fold).toBe(expected)
    }
  })

  it('the Details dialog cycles all three reasoning states and emits each selection', () => {
    const applied: DetailsSelection[] = []
    const dialog = new DetailsDialog('collapsed', 'full', palette, selection => { applied.push(selection) }, () => {})
    dialog.handleInput('\x1b[B')
    for (const expected of ['off', 'preview', 'full'] as const) {
      dialog.handleInput('\t')
      expect(applied.at(-1)).toEqual({ tools: 'collapsed', reasoning: expected })
    }
    dialog.handleInput('\x1b[A')
    dialog.handleInput('\t')
    expect(applied.at(-1)).toEqual({ tools: 'expanded', reasoning: 'full' })
  })

  it('/details applies valid pairs and legacy on/off aliases, with no partial apply on errors', () => {
    const calls: string[] = []
    const tools = (value: string): void => { calls.push(`tools:${value}`) }
    const reasoning = (value: ReasoningFold): void => { calls.push(`reasoning:${value}`) }
    expect(applyDetailsArguments('hidden reasoning preview', tools, reasoning)).toEqual({ kind: 'success' })
    expect(calls).toEqual(['reasoning:preview', 'tools:hidden'])
    expect(applyDetailsArguments('reasoning on', tools, reasoning)).toEqual({ kind: 'success' })
    expect(applyDetailsArguments('reasoning off', tools, reasoning)).toEqual({ kind: 'success' })
    expect(calls.slice(2)).toEqual(['reasoning:full', 'reasoning:off'])

    for (const invalid of ['hidden nonsense', 'hidden reasoning bogus', 'hidden reasoning']) {
      const before = calls.length
      expect(applyDetailsArguments(invalid, tools, reasoning).kind).toBe('error')
      expect(calls).toHaveLength(before)
    }
  })
})
