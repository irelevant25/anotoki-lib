import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../src/testing';
import { StatTileComponent } from './stat-tile/stat-tile.component';
import { StatTilesComponent } from './stat-tiles/stat-tiles.component';

@Component({
  selector: 'anotoki-test-stat-tiles',
  imports: [StatTileComponent, StatTilesComponent],
  template: `
    <anotoki-stat-tiles min="8rem">
      <anotoki-stat-tile label="Known notes" value="12/40" />
      <anotoki-stat-tile label="Minutes practised" [value]="minutes()" note="since 6 Oct" />
      <anotoki-stat-tile label="Accuracy" value="—" />
    </anotoki-stat-tiles>
    <anotoki-stat-tile id="alone" label="Streak" [value]="4" />
  `,
})
class StatTilesPageComponent {
  readonly minutes = signal(1234);
}

describe('<anotoki-stat-tiles>, <anotoki-stat-tile>: figures in tiles', () => {
  async function setUp(language: string) {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => language })) });
    const fixture = await draw(StatTilesPageComponent);
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('a list of tiles, each a number with what it counts - read number first - and a note on request', async () => {
    const { host } = await setUp('en');
    const grid = host.querySelector<HTMLElement>('anotoki-stat-tiles')!;
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>('anotoki-stat-tile'));

    expect(grid.getAttribute('role')).toBe('list');
    expect(grid.style.getPropertyValue('--_stat-tiles-min')).toBe('8rem');
    expect(tiles.map((tile) => tile.getAttribute('role'))).toEqual(['listitem', 'listitem', 'listitem']);
    expect(tiles.map((tile) => words(tile))).toEqual(['12/40 Known notes', '1,234 Minutes practised since 6 Oct', '— Accuracy']);
    expect(tiles[0].querySelector('.anotoki-stat-tile__note')).toBeNull();
    expect(words(tiles[1].querySelector('.anotoki-stat-tile__value'))).toBe('1,234');
    // A tile on its own is no list's item.
    expect(host.querySelector('#alone')?.hasAttribute('role')).toBe(false);
    host.remove();
  });

  it('a number is written the page’s way, and follows it', async () => {
    const { fixture, host } = await setUp('sk');
    const value = () => words(host.querySelectorAll('.anotoki-stat-tile__value')[1]);
    expect(value()).toBe('1 234');
    fixture.componentInstance.minutes.set(5);
    await settle(fixture);
    expect(value()).toBe('5');
    host.remove();
  });
});
