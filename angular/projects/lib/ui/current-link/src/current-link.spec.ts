import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RoutedLink, currentLink } from './current-link';

@Component({ selector: 'anotoki-test-empty', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class EmptyComponent {}

/** A character's page with a navigation of its parts, each path relative to the page (genshin's detail tabs). */
@Component({
  selector: 'anotoki-test-character',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p id="page">{{ page()?.id ?? 'none' }}</p>
    <router-outlet />`,
})
class CharacterComponent {
  readonly links = signal<readonly RoutedLink[]>([
    { id: 'overview', path: '.', exact: true },
    { id: 'talents', path: 'talents' },
    { id: 'voices', path: ['voices', 'en'] },
    { id: 'elsewhere', path: null },
  ]);
  readonly named = signal<string | null>(null);
  readonly page = currentLink(this.links, this.named);
}

describe('currentLink(): which of a navigation’s links is the page’s (0.6.0)', () => {
  async function start(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          {
            path: 'character/:id',
            component: CharacterComponent,
            children: [
              { path: '', component: EmptyComponent },
              { path: 'talents', component: EmptyComponent },
              { path: 'voices/:language', component: EmptyComponent },
            ],
          },
          { path: '**', component: EmptyComponent },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(url, CharacterComponent);
    harness.detectChanges();
    const go = async (to: string) => {
      await harness.navigateByUrl(to);
      harness.detectChanges();
    };
    return { harness, page, said: () => page.page()?.id ?? null, go };
  }

  it('reads each path as routerLink does - relative to the page that draws the navigation - again after every navigation', async () => {
    const { said, go } = await start('/character/7');
    expect(said()).toBe('overview');
    // `exact` is the address's: a query the link does not name changes nothing.
    await go('/character/7?from=list');
    expect(said()).toBe('overview');
    await go('/character/7/talents');
    expect(said()).toBe('talents');
    // Another character: the relative paths are that character's now.
    await go('/character/8/voices/en');
    expect(said()).toBe('voices');
    await go('/character/8/voices/ja');
    expect(said()).toBe(null);
  });

  it('`named` marks its link whatever the address says; an id no link has marks none; null gives it back to the router', async () => {
    const { page, said, go } = await start('/character/7/talents');
    page.named.set('voices');
    expect(said()).toBe('voices');
    page.named.set('nobody');
    expect(said()).toBe(null);
    page.named.set(null);
    await go('/character/7');
    expect(said()).toBe('overview');
  });
});
