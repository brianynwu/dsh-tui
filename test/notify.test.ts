import { describe, expect, it } from 'vitest'
import { QUESTION_OSC9, QuestionNotifier } from '../src/chat/notify.ts'
import { Config, resolveTuiConfig } from '../src/config.ts'

describe('actionable question notification', () => {
  it('emits exactly one fixed OSC 9 sequence for each live request identity', () => {
    const writes: string[] = []
    const notifier = new QuestionNotifier(bytes => { writes.push(bytes) }, true)
    const first = { id: 'plan-review', detail: 'private plan body' }
    const second = { id: 'plan-review', detail: 'another private body' }
    notifier.actionable(first)
    notifier.actionable(first) // streaming and overlay movement cannot repeat it
    notifier.actionable(second) // a reused caller item id is a distinct request
    expect(writes).toEqual([QUESTION_OSC9, QUESTION_OSC9])
    expect(QUESTION_OSC9).toBe('\x1b]9;Input needed\x07')
    expect(writes.join('')).not.toContain('private')
  })

  it('silences the initial mount, disabled preference, teardown, and writer errors', () => {
    const writes: string[] = []
    const initial = {}
    const notifier = new QuestionNotifier(bytes => { writes.push(bytes) }, true)
    notifier.baseline([initial])
    notifier.actionable(initial)
    notifier.actionable({})
    notifier.dispose()
    notifier.actionable({})
    expect(writes).toEqual([QUESTION_OSC9])
    new QuestionNotifier(() => { throw new Error('closed') }, true).actionable({})
    new QuestionNotifier(bytes => { writes.push(bytes) }, false).actionable({})
    expect(writes).toEqual([QUESTION_OSC9])
  })

  it('treats a request after remount as new work and defaults to enabled', () => {
    const request = {}
    const writes: string[] = []
    new QuestionNotifier(bytes => { writes.push(bytes) }, true).actionable(request)
    new QuestionNotifier(bytes => { writes.push(bytes) }, true).actionable(request)
    expect(writes).toEqual([QUESTION_OSC9, QUESTION_OSC9])
    expect(resolveTuiConfig(undefined).notifications).toBe(true)
    expect(resolveTuiConfig(Config({ notifications: false })).notifications).toBe(false)
  })
})
