import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnotokiUiConfig } from '@anotoki/lib/ui/config';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { ChipItem, ChipListComponent } from './chip-list.component';

@Component({
  selector: 'anotoki-test-chip-list',
  imports: [ChipListComponent],
  template: '<anotoki-chip-list label="Your answers" [items]="items()" [disabled]="saving()" (remove)="asked($event)" />',
})
class ChipListPageComponent {
  readonly items = signal<readonly ChipItem[]>([
    { value: 'huge', label: 'huge' },
    { value: 'big', label: 'big', removable: false },
    { value: 'ookii', label: '大きい', lang: 'ja' },
    { value: 'vast', label: 'vast' },
  ]);
  readonly saving = signal(false);
  /** Whether the page takes a chip away when asked. */
  accept = true;
  readonly removed: string[] = [];

  asked(value: string): void {
    this.removed.push(value);
    if (this.accept) {
      this.items.update((items) => items.filter((item) => item.value !== value));
    }
  }
}

describe('<anotoki-chip-list>: the chosen things, each with a button that takes it away', () => {
  let host: HTMLElement;
  let page: ChipListPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<ChipListPageComponent>>>;

  async function setUp(config?: () => AnotokiUiConfig): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(config) });
    fixture = await draw(ChipListPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  }

  afterEach(() => host.remove());

  const list = () => host.querySelector<HTMLElement>('anotoki-chip-list')!;
  const buttons = () => Array.from(list().querySelectorAll<HTMLButtonElement>('button'));

  it('a named list of chips, each remove button named with its chip’s words - a tooltip too', async () => {
    await setUp();
    expect(list().getAttribute('role')).toBe('list');
    expect(list().getAttribute('aria-label')).toBe('Your answers');
    expect(Array.from(list().children).map((chip) => chip.getAttribute('role'))).toEqual(['listitem', 'listitem', 'listitem', 'listitem']);
    expect(buttons().map((button) => button.getAttribute('aria-label'))).toEqual(['Remove: huge', 'Remove: 大きい', 'Remove: vast']);
    expect(buttons().map((button) => button.getAttribute('title'))).toEqual(['Remove: huge', 'Remove: 大きい', 'Remove: vast']);
    expect(buttons().every((button) => button.getAttribute('type') === 'button' && !button.hasAttribute('lang'))).toBe(true);
    expect(list().querySelectorAll('.anotoki-chip-list__label')[2].getAttribute('lang')).toBe('ja');
    expect(words(list().children[1])).toBe('big');
    expect(list().children[1].querySelector('button')).toBeNull();
  });

  it('in the page’s language - the site’s own words first (its database), the library’s otherwise', async () => {
    await setUp(() => ({ language: () => 'sk' }));
    expect(buttons()[0].getAttribute('aria-label')).toBe('Odstrániť: huge');
    host.remove();
    TestBed.resetTestingModule();

    await setUp(() => ({ language: () => 'sk', lookup: (key) => ((key as string) === 'chips.remove' ? 'Vymazať {name}' : null) }));
    expect(buttons()[0].getAttribute('aria-label')).toBe('Vymazať huge');
    host.remove();
    TestBed.resetTestingModule();

    // A language nobody wrote words for: English, and marked as English.
    await setUp(() => ({ language: () => 'de' }));
    expect(buttons()[0].getAttribute('aria-label')).toBe('Remove: huge');
    expect(buttons()[0].getAttribute('lang')).toBe('en');
  });

  it('once the page takes a chip away the focus goes to the next one’s button, the one before at the end, the list last', async () => {
    await setUp();
    buttons()[0].focus();
    buttons()[0].click();
    await settle(fixture);
    expect(page.removed).toEqual(['huge']);
    expect(document.activeElement).toBe(buttons()[0]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove: 大きい');

    buttons()[1].click();
    await settle(fixture);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove: 大きい');

    buttons()[0].click();
    await settle(fixture);
    expect(page.removed).toEqual(['huge', 'vast', 'ookii']);
    expect(document.activeElement).toBe(list());
    expect(list().getAttribute('tabindex')).toBe('-1');
  });

  it('a chip the page keeps keeps the focus; while disabled nothing can be taken away', async () => {
    await setUp();
    page.accept = false;
    buttons()[1].focus();
    buttons()[1].click();
    await settle(fixture);
    expect(page.removed).toEqual(['ookii']);
    expect(buttons().length).toBe(3);
    expect(document.activeElement).toBe(buttons()[1]);

    page.saving.set(true);
    await settle(fixture);
    expect(buttons().every((button) => button.disabled)).toBe(true);
  });
});
