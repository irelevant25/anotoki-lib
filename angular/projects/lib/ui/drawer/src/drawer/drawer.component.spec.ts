import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { DrawerComponent } from './drawer.component';

@Component({
  selector: 'anotoki-test-drawer',
  imports: [DrawerComponent],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">People</button>
    @if (open()) {
      <anotoki-drawer [heading]="heading()" subheading="Who answered" [backLabel]="back()" (dismiss)="open.set(false)" (back)="backs = backs + 1">
        <div drawerActions><button type="button" id="export">Export</button></div>
        <p>Twelve people</p>
        <div drawerFooter><button type="button" id="done">Done</button></div>
      </anotoki-drawer>
    }
  `,
})
class DrawerPageComponent {
  readonly open = signal(false);
  readonly heading = signal('12 people');
  readonly back = signal<string | null>(null);
  backs = 0;
}

describe('<anotoki-drawer>: a panel from the right', () => {
  it('opens as it appears, the heading in focus; Tab stays inside; Escape asks to close, the focus back where it was', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(DrawerPageComponent);
    const host: HTMLElement = fixture.nativeElement;
    const opener = host.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    opener.click();
    await settle(fixture);

    const dialog = host.querySelector<HTMLDialogElement>('dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('12 people');
    expect(document.activeElement?.tagName).toBe('H2');
    expect(words(host.querySelector('.subtitle'))).toBe('Who answered');
    expect(host.querySelector('.actions #export')).not.toBeNull();
    expect(host.querySelector('.foot #done')).not.toBeNull();
    expect(host.querySelector('.close')?.getAttribute('aria-label')).toBe('Close');

    const done = host.querySelector<HTMLElement>('#done')!;
    done.focus();
    expect(press(done, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('.close'));

    fixture.componentInstance.back.set('All 12 people');
    fixture.componentInstance.heading.set('Mira');
    await settle(fixture);
    const back = host.querySelector<HTMLButtonElement>('.back')!;
    expect(words(back)).toBe('All 12 people');
    back.click();
    expect(fixture.componentInstance.backs).toBe(1);

    press(host.querySelector('.close')!, 'Escape');
    await settle(fixture);
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    host.remove();
  });
});
