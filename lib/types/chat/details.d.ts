import type { CommandResult } from '@deepseek-ai/dsh-commands';
import type { ReasoningFold } from '../config.ts';
import type { ToolCardVisibility } from '../components/transcript.ts';
/** First press from the stock full view hides reasoning. */
export declare function nextReasoningFold(current: ReasoningFold): ReasoningFold;
/** Handle the actual Ctrl+R chord; return whether it consumed this input. */
export declare function handleReasoningShortcut(data: string, current: ReasoningFold, setReasoningFold: (fold: ReasoningFold) => void): boolean;
/** Parse the whole command before applying either dimension. */
export declare function applyDetailsArguments(rawInput: string, setToolsVisibility: (visibility: ToolCardVisibility) => void, setReasoningFold: (fold: ReasoningFold) => void): CommandResult;
/** The two session-local transcript-detail dimensions. */
export interface TranscriptView {
    readonly tools: ToolCardVisibility;
    readonly reasoning: ReasoningFold;
}
/** Build `/quiet` with one remembered non-quiet view for this TUI session. */
export declare function createQuietCommand(startup: TranscriptView, current: () => TranscriptView, setToolsVisibility: (visibility: ToolCardVisibility) => void, setReasoningFold: (fold: ReasoningFold) => void): (rawInput: string) => CommandResult;
//# sourceMappingURL=details.d.ts.map