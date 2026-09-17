import type { CommandResult } from '@deepseek-ai/dsh-commands';
import type { ContextVisibility, ReasoningFold } from '../config.ts';
import type { ToolCardVisibility } from '../components/transcript.ts';
/** First press from the stock full view hides reasoning. */
export declare function nextReasoningFold(current: ReasoningFold): ReasoningFold;
export declare function nextContextVisibility(current: ContextVisibility): ContextVisibility;
export declare function nextToolCardVisibility(current: ToolCardVisibility): ToolCardVisibility;
/** Handle the actual Alt+R chord; return whether it consumed this input. */
export declare function handleReasoningShortcut(data: string, current: ReasoningFold, setReasoningFold: (fold: ReasoningFold) => void): boolean;
/** Parse the whole command before applying any dimension. */
export declare function applyDetailsArguments(rawInput: string, setToolsVisibility: (visibility: ToolCardVisibility) => void, setReasoningFold: (fold: ReasoningFold) => void, setContextVisibility: (visibility: ContextVisibility) => void): CommandResult;
/** The three session-local transcript-detail dimensions. */
export interface TranscriptView {
    readonly tools: ToolCardVisibility;
    readonly reasoning: ReasoningFold;
    readonly context: ContextVisibility;
}
/** Build `/quiet` with one remembered non-quiet view for this TUI session. */
export declare function createQuietCommand(startup: TranscriptView, current: () => TranscriptView, setToolsVisibility: (visibility: ToolCardVisibility) => void, setReasoningFold: (fold: ReasoningFold) => void, setContextVisibility: (visibility: ContextVisibility) => void): (rawInput: string) => CommandResult;
//# sourceMappingURL=details.d.ts.map