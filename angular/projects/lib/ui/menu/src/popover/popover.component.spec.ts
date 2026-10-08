import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle } from '../../../src/testing';
import { PopoverTriggerDirective } from '../popover-trigger.directive';
import { PopoverComponent } from './popover.component';

@Component({
  selector: 'anotoki-test-popover',
  imports: [PopoverComponent, PopoverTriggerDirective],
  template: `
    <button type="button" id="piano" [anotokiPopoverTrigger]="box">Piano</button>
    <anotoki-popover #box label="The piano" [autoFocus]="autoFocus()">
      <label
        >Device
        <select id="device">
          <option>None</option>
        </select></label
      >
      <button type="button" id="connect">Connect</button>
    </anotoki-popover>
    <button type="button" id="elsewhere">Elsewhere</button>
  `,
})
class PopoverPageComponent {
  readonly autoFocus = signal(false);
}

describe('<anotoki-popover>: a box of controls under its button', () => {
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<PopoverPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(PopoverPageComponent);
    host = fixture.nativeElement;
  });

  afterEach(() => host.remove());

  const trigger = () => host.querySelector<HTMLButtonElement>('#piano')!;
  const box = () => host.querySelector<HTMLElement>('[role=group]');

  async function open(): Promise<void> {
    trigger().focus();
    trigger().click();
    await settle(fixture);
  }

  it('a disclosure: the button says aria-expanded and aria-controls; the box is a named group; the focus stays on the button', async () => {
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-haspopup')).toBeNull();
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(box()?.getAttribute('aria-label')).toBe('The piano');
    expect(trigger().getAttribute('aria-controls')).toBe(box()!.id);
    expect(document.activeElement).toBe(trigger());
  });

  it('autoFocus moves the focus to its first control', async () => {
    fixture.componentInstance.autoFocus.set(true);
    await settle(fixture);
    await open();
    expect(document.activeElement?.id).toBe('device');
  });

  it('Escape closes it, the focus back on the button', async () => {
    await open();
    host.querySelector<HTMLElement>('#connect')!.focus();
    const escape = press(host.querySelector('#connect')!, 'Escape');
    await settle(fixture);
    expect(escape.defaultPrevented).toBe(true);
    expect(box()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('the focus moving into it keeps it open; leaving both it and the button closes it', async () => {
    await open();
    const connect = host.querySelector<HTMLElement>('#connect')!;
    trigger().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: connect }));
    connect.focus();
    await settle(fixture);
    expect(box()).not.toBeNull();

    const elsewhere = host.querySelector<HTMLElement>('#elsewhere')!;
    connect.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }));
    await settle(fixture);
    expect(box()).toBeNull();
  });

  it('a click outside closes it; the button toggles it', async () => {
    await open();
    host.querySelector<HTMLElement>('#elsewhere')!.click();
    await settle(fixture);
    expect(box()).toBeNull();
    await open();
    trigger().click();
    await settle(fixture);
    expect(box()).toBeNull();
  });
});
