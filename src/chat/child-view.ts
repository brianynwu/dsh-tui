/** Swap a read-only child transcript into the main scroll region and restore the main position on return. */
import { type Component, Container, ScrollView } from '@earendil-works/pi-tui'

export class ChildViewSlot {
  private showingChild = false
  private mainScroll = { top: 0, following: true }

  constructor(
    private readonly slot: Container,
    private readonly main: Component,
    private readonly scroll: ScrollView,
    private readonly focusMain: () => void,
    private readonly render: (full?: boolean) => void,
  ) {}

  set(view: Component | undefined): void {
    if (view !== undefined && !this.showingChild) {
      this.mainScroll = { top: this.scroll.scrollTop, following: this.scroll.isFollowingEnd }
    }
    this.showingChild = view !== undefined
    this.slot.clear()
    this.slot.addChild(view ?? this.main)
    if (view === undefined) {
      this.focusMain()
      this.render()
      queueMicrotask(() => {
        if (this.mainScroll.following) this.scroll.scrollToEnd()
        else this.scroll.scrollTo(this.mainScroll.top, { disableFollow: true })
        this.render(true)
      })
    } else {
      this.scroll.scrollToStart()
      this.render()
    }
  }
}
