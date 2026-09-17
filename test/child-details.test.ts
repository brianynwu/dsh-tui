import { describe, expect, it } from 'vitest'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { ChildTranscript } from '../src/chat/subagents.ts'
import type { TranscriptView } from '../src/chat/details.ts'
import { createPalette } from '../src/components/theme.ts'
import { resolveTuiConfig } from '../src/config.ts'

const sessionId = SessionId('child-details')
const event = (seq: number, type: string, data: unknown): SessionEvent => ({
  seq, time: 1_000 + seq, type, data,
} as SessionEvent)
const context = event(0, 'user/message', {
  source: { kind: 'plugin', plugin: 'agent-instructions' },
  content: [{ type: 'text', text: 'instruction one\ninstruction two\ninstruction three' }],
})
const step = (seq: number, stepIndex: number): SessionEvent => event(seq, 'assistant/message', {
  turn: 0, step: stepIndex,
  message: { content: [{ type: 'reasoning', text: `Reasoning ${stepIndex}` }, { type: 'text', text: `Answer ${stepIndex}` }] },
})
const tool = event(2, 'tool/call', { turn: 0, step: 0, callId: 'call-1', name: 'read_file', arguments: '{}' })
const rows = (view: ChildTranscript): string => view.render(80).join('\n')

describe('child transcript detail modes', () => {
  it('inherits the browser snapshot for replay and live events, then changes only its own view', () => {
    const main: TranscriptView = { tools: 'hidden', reasoning: 'off', context: 'hidden' }
    const view = new ChildTranscript(sessionId, 'Read instructions', createPalette(false), resolveTuiConfig(undefined), main)
    view.replay([context, step(1, 0), tool])
    expect(rows(view)).not.toContain('Context ·')
    expect(rows(view)).not.toContain('Reasoning 0')
    expect(rows(view)).not.toContain('Tool /')
    expect(rows(view)).toContain('Answer 0')
    expect(view.addEvent(step(3, 1))).toBe('added')
    expect(rows(view).match(/Assistant/g)).toHaveLength(1)

    view.setDetails({ tools: 'expanded', reasoning: 'full', context: 'expanded' })
    expect(rows(view)).toContain('instruction three')
    expect(rows(view)).toContain('Reasoning 0')
    expect(rows(view)).toContain('Tool /')
    expect(rows(view).match(/Assistant/g)).toHaveLength(2)
    expect(main).toEqual({ tools: 'hidden', reasoning: 'off', context: 'hidden' })

    view.setDetails({ tools: 'collapsed', reasoning: 'preview', context: 'collapsed' })
    expect(rows(view)).toContain('Context · agent-instructions')
    expect(rows(view)).toContain('Reasoning')
  })
})
