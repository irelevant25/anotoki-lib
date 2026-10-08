import { ChangeDetectionStrategy, Component, ElementRef, effect, input, model, viewChildren } from '@angular/core';
import { uniqueId } from '@anotoki/lib/ui';

export interface TabItem {
  id: string;
  label: string;
  /** A number after the label - how many members, say. */
  count?: number | null;
}

/**
 * A row of tabs, the WAI-ARIA tabs pattern: only the chosen tab is a Tab
 * stop; the arrow keys, Home and End move between the tabs and choose as they
 * go. The panels are the page's own: each `role="tabpanel"`, with the id and
 * the label the tabs point at -
 *
 * ```html
 * <anotoki-tabs #tabs="anotokiTabs" label="Members" [tabs]="tabs" [(active)]="active" />
 * <div role="tabpanel" [id]="tabs.panelId(active())" [attr.aria-labelledby]="tabs.tabId(active())">...</div>
 * ```
 */
@Component({
  selector: 'anotoki-tabs',
  exportAs: 'anotokiTabs',
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-tabs' },
})
export class TabsComponent {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly active = model.required<string>();
  /** The row's name. */
  readonly label = input.required<string>();
  /** What the tabs' and panels' ids start with; one of the kit's own by default. */
  readonly idPrefix = input(uniqueId('anotoki-tabs'));

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tab');
  /** A tab chosen from the keyboard: the focus follows it once it is drawn chosen. */
  private follow: string | null = null;

  constructor() {
    effect(() => {
      const active = this.active();
      const buttons = this.buttons();
      if (this.follow === active) {
        this.follow = null;
        buttons[this.tabs().findIndex((tab) => tab.id === active)]?.nativeElement.focus();
      }
    });
  }

  /** The id of a tab's button: its panel's aria-labelledby. */
  tabId(id: string): string {
    return `${this.idPrefix()}-tab-${id}`;
  }

  /** The id of a tab's panel, which the page gives it. */
  panelId(id: string): string {
    return `${this.idPrefix()}-panel-${id}`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const index = tabs.findIndex((tab) => tab.id === this.active());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.follow = tabs[next].id;
    this.active.set(tabs[next].id);
  }
}
