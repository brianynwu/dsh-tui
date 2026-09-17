/** Swap a read-only child transcript into the main scroll region and restore the main position on return. */
import { type Component, Container, ScrollView } from '@earendil-works/pi-tui';
export declare class ChildViewSlot {
    private readonly slot;
    private readonly main;
    private readonly scroll;
    private readonly focusMain;
    private readonly render;
    private showingChild;
    private mainScroll;
    constructor(slot: Container, main: Component, scroll: ScrollView, focusMain: () => void, render: (full?: boolean) => void);
    set(view: Component | undefined): void;
}
//# sourceMappingURL=child-view.d.ts.map