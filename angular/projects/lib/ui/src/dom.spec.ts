import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutofocusDirective } from './autofocus.directive';
import { keepOnScreen, mediaQuery, tabbable, uniqueId } from './dom';
import { draw, kitProviders, settle, windowOf } from './testing';

describe('the kit’s DOM helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uniqueId: a new id each time', () => {
    const ids = new Set(Array.from({ length: 50 }, () => uniqueId('field')));
    expect(ids.size).toBe(50);
    expect([...ids][0]).toMatch(/^field-\d+$/);
  });

  it('keepOnScreen: a box sticking out on the right moves left by what it takes, never past the left edge', () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
    const at = (left: number, width: number) =>
      vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left, right: left + width, width, top: 0, bottom: 10, height: 10, x: left, y: 0, toJSON: () => ({}) });

    at(300, 160);
    keepOnScreen(box);
    expect(box.style.translate).toBe('-78px 0');

    at(-20, 100);
    keepOnScreen(box);
    expect(box.style.translate).toBe('28px 0');

    at(20, 100);
    keepOnScreen(box);
    expect(box.style.translate).toBe('');
    box.remove();
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
  });

  it('tabbable: what a keyboard can Tab to - never what is taken out of the tab order, disabled or hidden', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <a href="/x" id="a">A</a>
      <a id="no-href">No href</a>
      <button id="b">B</button>
      <button id="disabled" disabled>D</button>
      <button id="minus" tabindex="-1">M</button>
      <input id="i" />
      <input type="hidden" />
      <div hidden><button id="hidden">H</button></div>
      <div tabindex="0" id="t">T</div>`;
    document.body.appendChild(root);
    expect(tabbable(root).map((element) => element.id)).toEqual(['a', 'b', 'i', 't']);
    root.remove();
  });

  it('mediaQuery: answers at once, follows the window, and asks again when the query changes', async () => {
    const window = windowOf(1280);
    const max = signal(760);

    @Component({ selector: 'anotoki-test-media', template: '' })
    class MediaComponent {
      readonly phone = mediaQuery(() => `(max-width: ${max()}px)`);
      readonly wide = mediaQuery('(min-width: 1200px)');
    }

    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = TestBed.createComponent(MediaComponent);
    const media = fixture.componentInstance;
    expect(media.phone()).toBe(false);
    expect(media.wide()).toBe(true);

    await settle(fixture);
    window.resize(700);
    expect(media.phone()).toBe(true);
    expect(media.wide()).toBe(false);

    max.set(600);
    await settle(fixture);
    expect(media.phone()).toBe(false);
  });

  it('[anotokiAutofocus]: the element has the focus once it is drawn, unless switched off', async () => {
    @Component({
      selector: 'anotoki-test-autofocus',
      imports: [AutofocusDirective],
      template: '<input id="off" [anotokiAutofocus]="false" /><h1 id="on" tabindex="-1" anotokiAutofocus>Step two</h1>',
    })
    class AutofocusPageComponent {}

    TestBed.configureTestingModule({ providers: kitProviders() });
    const fixture = await draw(AutofocusPageComponent);
    expect(document.activeElement?.id).toBe('on');
    fixture.nativeElement.remove();
  });
});
