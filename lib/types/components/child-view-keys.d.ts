/** Zero-height focus target: child transcripts are read-only, and Esc returns to the picker. */
import { type Component, type Focusable } from '@earendil-works/pi-tui';
import type { TuiKeymap } from '../chat/keymap.ts';
export declare class ChildViewKeys implements Component, Focusable {
    private readonly keymap;
    private readonly back;
    private readonly changeDetail;
    focused: boolean;
    constructor(keymap: TuiKeymap, back: () => void, changeDetail: (action: 'tools' | 'reasoning' | 'context') => void);
    render(_width: number): string[];
    invalidate(): void;
    handleInput(data: string): void;
}
//# sourceMappingURL=child-view-keys.d.ts.map