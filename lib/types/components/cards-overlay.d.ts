/** Read-only, session-scoped browser over the tool cards retained by the transcript. */
import { type Component } from '@earendil-works/pi-tui';
import type { Palette } from './theme.ts';
import type { ToolCardComponent } from './transcript.ts';
/** The overlay uses the same fixed width for its opening snapshot and modal. */
export declare function cardsOverlayWidth(columns: number): number;
export declare class CardsOverlay implements Component {
    private readonly rows;
    private readonly palette;
    private readonly changed;
    private readonly close;
    private readonly cards;
    private selected;
    private scrollTop;
    private pageSize;
    constructor(cards: readonly ToolCardComponent[], width: number, rows: () => number, palette: Palette, changed: () => void, close: () => void);
    invalidate(): void;
    render(width: number): string[];
    handleInput(data: string): void;
}
//# sourceMappingURL=cards-overlay.d.ts.map