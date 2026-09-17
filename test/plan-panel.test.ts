import { describe, expect, it, vi } from 'vitest'
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import { PlanReviewPanel, isPlanReviewQuestion } from '../src/components/plan-panel.ts'
import { createPalette } from '../src/components/theme.ts'

const payload: AskUserQuestionItem = {
  id: 'plan-review', header: 'Plan review',
  question: 'Approve this plan and leave plan mode?',
  detail: '# Plan\n\n**Important** change\n\n' + Array.from({ length: 24 }, (_, index) => `- Step ${index}`).join('\n'),
  options: [
    { label: 'Approve', description: 'Leave plan mode; the plan is carried out from the next step.' },
    { label: 'Keep planning', description: 'Stay in plan mode; feedback goes back to the model.' },
  ],
  intent: { kind: 'plan-review', approve: 'Approve' },
}

describe('plan review panel', () => {
  it('uses the declared intent and advertised approval label, with generic fallback for other questions', () => {
    expect(isPlanReviewQuestion(payload)).toBe(true)
    expect(isPlanReviewQuestion({ ...payload, intent: undefined })).toBe(false)
    expect(isPlanReviewQuestion({ ...payload, intent: { kind: 'plan-review', approve: 'No such option' } })).toBe(false)
    expect(isPlanReviewQuestion({ ...payload, detail: undefined })).toBe(false)
    expect(isPlanReviewQuestion({ ...payload, multiSelect: true })).toBe(false)
  })

  it('renders scrollable markdown and returns exactly the selected core option once', () => {
    const done = vi.fn()
    const cancel = vi.fn()
    const panel = new PlanReviewPanel(payload, 1, 1, 1, 4, () => 18, createPalette(false), done, cancel)
    panel.focused = true
    const initial = panel.render(60).join('\n')
    expect(initial).toContain('Plan review')
    expect(initial).toContain('Important')
    expect(initial).toContain('Approve')
    panel.handleInput('\x1b[6~') // PageDown
    expect(panel.render(60).join('\n')).toContain('Step')
    panel.handleInput('\x1b[B') // Down to the second advertised option
    panel.handleInput('\r')
    panel.handleInput('\r')
    expect(done).toHaveBeenCalledOnce()
    expect(done).toHaveBeenCalledWith({ selected: ['Keep planning'] })
    expect(cancel).not.toHaveBeenCalled()
  })

  it('keeps a narrow, short viewport bounded and supports dismissal', () => {
    const done = vi.fn()
    const cancel = vi.fn()
    const panel = new PlanReviewPanel(payload, 1, 1, 1, 4, () => 9, createPalette(false), done, cancel)
    panel.focused = true
    const rows = panel.render(28)
    expect(rows.length).toBeLessThanOrEqual(9)
    expect(rows.join('\n')).toContain('Plan')
    panel.handleInput('\x1b')
    panel.handleInput('\x1b')
    expect(cancel).toHaveBeenCalledOnce()
    expect(done).not.toHaveBeenCalled()
  })
})
