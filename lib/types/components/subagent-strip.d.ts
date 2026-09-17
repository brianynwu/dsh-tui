/** Pinned, keyboard-owned row for choosing a read-only child transcript. */
import { type Component, type Focusable } from '@earendil-works/pi-tui';
import type { TuiKeymap } from '../chat/keymap.ts';
import type { SubagentRow } from '../chat/subagents.ts';
import type { Palette } from './theme.ts';
export declare class SubagentStrip implements Component, Focusable {
    private readonly keymap;
    private readonly palette;
    private readonly prev;
    private readonly next;
    private readonly back;
    focused: boolean;
    private rows;
    private selectedId;
    constructor(keymap: TuiKeymap, palette: Palette, prev: () => void, next: () => void, back: () => void);
    setRows(rows: readonly SubagentRow[], selectedId: string | undefined): void;
    hasChildren(): boolean;
    handleInput(data: string): void;
    invalidate(): void;
    render(width: number): string[];
}
//# sourceMappingURL=subagent-strip.d.ts.map