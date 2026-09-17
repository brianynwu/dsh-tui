/** Plan-review presentation over the existing question response protocol. */
import { type Component, type Focusable } from '@earendil-works/pi-tui';
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions';
import { type QuestionSelection } from './dialogs.ts';
import { type Palette } from './theme.ts';
/** Only an advertised plan intent with a real approve option gets the specialized panel. */
export declare function isPlanReviewQuestion(question: AskUserQuestionItem): boolean;
export declare class PlanReviewPanel implements Component, Focusable {
    private readonly maxHeight;
    private readonly palette;
    focused: boolean;
    private readonly answers;
    private readonly markdown;
    private offset;
    private pageSize;
    private settled;
    constructor(question: AskUserQuestionItem, position: number, total: number, unanswered: number, maxVisible: number, maxHeight: () => number, palette: Palette, done: (selection: QuestionSelection) => void, cancel: () => void);
    invalidate(): void;
    handleInput(data: string): void;
    render(width: number): string[];
}
//# sourceMappingURL=plan-panel.d.ts.map