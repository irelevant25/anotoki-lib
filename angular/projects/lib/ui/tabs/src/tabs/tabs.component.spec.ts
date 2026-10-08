import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { TabsComponent } from './tabs.component';

@Component({
  selector: 'anotoki-test-tabs',
  imports: [TabsComponent],
  template: `
    <anotoki-tabs #tabs="anotokiTabs" label="Members" [tabs]="items" [(active)]="active" />
    <div role="tabpanel" [id]="tabs.panelId(active())" [attr.aria-labelledby]="tabs.tabId(active())">{{ active() }}</div>
  `,
})
class TabsPageComponent {
  readonly items = [
    { id: 'all', label: 'All', count: 12 },
    { id: 'admins', label: 'Administrators' },
    { id: 'blocked', label: 'Blocked', count: 0 },
  ];
  readonly active = signal('all');
}

describe('<anotoki-tabs>: the WAI-ARIA tabs pattern', () => {
  it('a named tablist; only the chosen tab is a Tab stop; the panel ids line up', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(TabsPageComponent);
    const host: HTMLElement = fixture.nativeElement;
    const tabs = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'));
    expect(host.querySelector('[role=tablist]')?.getAttribute('aria-label')).toBe('Members');
    expect(tabs().map(words)).toEqual(['All 12', 'Administrators', 'Blocked 0']);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    const panel = host.querySelector('[role=tabpanel]')!;
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);

    tabs()[0].focus();
    press(tabs()[0], 'ArrowRight');
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('admins');
    expect(document.activeElement).toBe(tabs()[1]);
    press(tabs()[1], 'End');
    await settle(fixture);
    expect(document.activeElement).toBe(tabs()[2]);
    press(tabs()[2], 'ArrowRight');
    await settle(fixture);
    expect(document.activeElement).toBe(tabs()[0]);
    press(tabs()[0], 'ArrowLeft');
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('blocked');
    press(tabs()[2], 'Home');
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('all');
    tabs()[1].click();
    await settle(fixture);
    expect(fixture.componentInstance.active()).toBe('admins');
    host.remove();
  });
});
