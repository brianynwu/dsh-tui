/** Bounded popup for choosing a direct child without occupying the chat layout. */
import { type Component } from '@earendil-works/pi-tui';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { TuiKeymap } from '../chat/keymap.ts';
import type { SubagentRow } from '../chat/subagents.ts';
import type { Palette } from './theme.ts';
export declare class SubagentPicker implements Component {
    private readonly terminalRows;
    private readonly keymap;
    private readonly palette;
    private readonly changed;
    private readonly select;
    private readonly close;
    private rows;
    private selectedId;
    private scrollTop;
    constructor(rows: readonly SubagentRow[], preferredId: SessionId | undefined, terminalRows: () => number, keymap: TuiKeymap, palette: Palette, changed: () => void, select: (id: SessionId) => void, close: () => void);
    private children;
    setRows(rows: readonly SubagentRow[]): void;
    invalidate(): void;
    handleInput(data: string): void;
    render(width: number): string[];
}
//# sourceMappingURL=subagent-picker.d.ts.map