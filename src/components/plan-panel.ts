/** Plan-review presentation over the existing question response protocol. */
import {
  Key, Markdown, matchesKey, truncateToWidth, visibleWidth,
  type Component, type Focusable,
} from '@earendil-works/pi-tui'
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import { QuestionDialog, type QuestionSelection } from './dialogs.ts'
import { displayText } from './text.ts'
import { markdownTheme, type Palette } from './theme.ts'

/** Only an advertised plan intent with a real approve option gets the specialized panel. */
export function isPlanReviewQuestion(question: AskUserQuestionItem): boolean {
  return question.intent?.kind === 'plan-review'
    && typeof question.detail === 'string'
    && question.detail.trim() !== ''
    && question.multiSelect !== true
    && question.options?.some(option => option.label === question.intent?.approve) === true
}

export class PlanReviewPanel implements Component, Focusable {
  focused = false
  private readonly answers: QuestionDialog
  private readonly markdown: Markdown
  private offset = 0
  private pageSize = 1
  private settled = false

  constructor(
    question: AskUserQuestionItem,
    position: number,
    total: number,
    unanswered: number,
    maxVisible: number,
    private readonly maxHeight: () => number,
    private readonly palette: Palette,
    done: (selection: QuestionSelection) => void,
    cancel: () => void,
  ) {
    if (!isPlanReviewQuestion(question)) throw new Error('Plan panel requires an advertised plan review')
    this.markdown = new Markdown(displayText(question.detail ?? ''), 0, 0, markdownTheme(palette), {
      color: value => palette.text(value),
    })
    this.answers = new QuestionDialog(
      { ...question, detail: undefined }, position, total, unanswered, maxVisible,
      () => Math.max(1, Math.min(10, Math.floor(this.maxHeight() / 2))), palette,
      selection => {
        if (this.settled) return
        this.settled = true
        done(selection)
      },
      () => {
        if (this.settled) return
        this.settled = true
        cancel()
      },
    )
  }

  invalidate(): void {
    this.answers.invalidate()
    this.markdown.invalidate()
  }

  handleInput(data: string): void {
    if (this.settled) return
    if (matchesKey(data, Key.pageUp)) {
      this.offset = Math.max(0, this.offset - this.pageSize)
      return
    }
    if (matchesKey(data, Key.pageDown)) {
      this.offset += this.pageSize
      return
    }
    this.answers.focused = this.focused
    this.answers.handleInput(data)
  }

  render(width: number): string[] {
    const height = Math.max(1, this.maxHeight())
    const innerWidth = Math.max(1, width - 4)
    this.answers.focused = this.focused
    const answerRows = this.answers.render(width)
    if (height <= answerRows.length + 2) return answerRows.slice(-height)
    const detailRows = this.markdown.render(innerWidth)
    const detailBudget = Math.max(1, height - answerRows.length - 2)
    this.pageSize = detailBudget
    this.offset = Math.min(this.offset, Math.max(0, detailRows.length - detailBudget))
    const shown = detailRows.slice(this.offset, this.offset + detailBudget)
    const title = this.palette.bold(this.palette.accent('Plan review'))
    const pager = this.palette.dim(
      `Plan ${detailRows.length === 0 ? 0 : this.offset + 1}–${Math.min(detailRows.length, this.offset + shown.length)}/${detailRows.length} · PgUp/PgDn scroll`,
    )
    const pad = (line: string): string => {
      const bounded = truncateToWidth(line, innerWidth, '…')
      return `  ${bounded}${' '.repeat(Math.max(0, innerWidth - visibleWidth(bounded)))}  `
    }
    return [pad(title), ...shown.map(pad), pad(pager), ...answerRows].slice(0, height)
  }
}
