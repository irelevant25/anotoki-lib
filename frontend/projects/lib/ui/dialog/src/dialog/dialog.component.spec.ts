import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TextFieldComponent } from '@anotoki/lib/ui/forms';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { DialogComponent, DialogSize } from './dialog.component';

@Component({
  selector: 'anotoki-test-dialog-page',
  imports: [DialogComponent],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Edit</button>
    @if (open()) {
      <anotoki-dialog heading="Edit the name" description="Everybody sees it." [size]="size()" [dismissible]="dismissible()" [busy]="busy()" (dismiss)="dismissed = dismissed + 1; open.set(false)">
        <input id="hidden-user" type="text" tabindex="-1" autocomplete="username" />
        <input id="name" type="text" />
        <button type="button" id="minus" tabindex="-1">Not a stop</button>
        <a href="#help" id="help">Help</a>
        <div dialogFooter>
          <button type="button" id="cancel">Cancel</button>
          <button type="button" id="save">Save</button>
        </div>
      </anotoki-dialog>
    }
  `,
})
class DialogPageComponent {
  readonly open = signal(false);
  readonly size = signal<DialogSize>('md');
  readonly dismissible = signal(true);
  readonly busy = signal(false);
  dismissed = 0;
}

describe('<anotoki-dialog>: a modal dialog on <dialog>', () => {
  let host: HTMLElement;
  let page: DialogPageComponent;
  let fixture: Awaited<ReturnType<typeof draw<DialogPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(DialogPageComponent);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
  });

  afterEach(() => host.remove());

  const dialog = () => host.querySelector<HTMLDialogElement>('dialog');
  const el = (id: string) => host.querySelector<HTMLElement>('#' + id)!;

  async function open(): Promise<void> {
    el('opener').focus();
    el('opener').click();
    await settle(fixture);
  }

  it('opens as it appears, named by its heading and described by its description', async () => {
    await open();
    const shown = dialog()!;
    expect(shown.open).toBe(true);
    expect(document.getElementById(shown.getAttribute('aria-labelledby')!)?.textContent).toBe('Edit the name');
    expect(document.getElementById(shown.getAttribute('aria-describedby')!)?.textContent).toBe('Everybody sees it.');
    expect(Array.from(shown.querySelectorAll('.anotoki-dialog__footer button')).map(words)).toEqual(['Cancel', 'Save']);
    expect(shown.getAttribute('data-size')).toBe('md');
  });

  it('an extra-large size for a whole editor or a preview (0.6.0)', async () => {
    page.size.set('xl');
    await open();
    expect(dialog()!.getAttribute('data-size')).toBe('xl');
  });

  it('the focus starts on the first field - not on the close button, nor on what is out of the tab order', async () => {
    await open();
    expect(document.activeElement).toBe(el('name'));
  });

  it('Tab cycles inside, never stopping on tabindex="-1"; Shift+Tab the other way', async () => {
    await open();
    const close = host.querySelector<HTMLElement>('.anotoki-dialog__close')!;
    el('save').focus();
    const tab = press(el('save'), 'Tab');
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    close.focus();
    const back = press(close, 'Tab', { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el('save'));

    // In the middle the browser moves on by itself.
    el('name').focus();
    expect(press(el('name'), 'Tab').defaultPrevented).toBe(false);
  });

  it('Escape asks to be closed - and the focus goes back where it was', async () => {
    await open();
    const escape = press(el('name'), 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    await settle(fixture);
    expect(page.dismissed).toBe(1);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(el('opener'));
  });

  it('the close button is named in the page language and asks to be closed', async () => {
    await open();
    const close = host.querySelector<HTMLButtonElement>('.anotoki-dialog__close')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    close.click();
    await settle(fixture);
    expect(page.dismissed).toBe(1);
  });

  it('a click on the backdrop counts only when it started there', async () => {
    await open();
    const shown = dialog()!;
    el('name').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    shown.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(page.dismissed).toBe(0);

    shown.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    shown.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(page.dismissed).toBe(1);
  });

  it('not dismissible: Escape, the browser’s cancel and the backdrop do nothing, and there is no close button', async () => {
    page.dismissible.set(false);
    await open();
    expect(host.querySelector('.anotoki-dialog__close')).toBeNull();
    press(el('name'), 'Escape');
    const cancel = new Event('cancel', { cancelable: true });
    dialog()!.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    dialog()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    dialog()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(page.dismissed).toBe(0);
  });

  it('busy: held open, the close button disabled, aria-busy', async () => {
    page.busy.set(true);
    await open();
    expect(dialog()!.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector<HTMLButtonElement>('.anotoki-dialog__close')!.disabled).toBe(true);
    press(el('name'), 'Escape');
    expect(page.dismissed).toBe(0);
  });
});

/** A form of its own inside the dialog, as a site's is: its fields in a view of their own, the second one `autofocus`. */
@Component({
  selector: 'anotoki-test-dialog-form',
  imports: [TextFieldComponent],
  template: '<anotoki-text-field label="Nickname" /><anotoki-text-field label="Name" autofocus />',
})
class DialogFormComponent {}

@Component({
  selector: 'anotoki-test-dialog-autofocus',
  imports: [DialogComponent, DialogFormComponent, TextFieldComponent],
  template: `
    @if (open() === 'form') {
      <anotoki-dialog heading="Rename"><anotoki-test-dialog-form /></anotoki-dialog>
    }
    @if (open() === 'inline') {
      <anotoki-dialog heading="Rename">
        @if (ready()) {
          <anotoki-text-field label="Nickname" /><anotoki-text-field label="Name" [autofocus]="true" />
        }
      </anotoki-dialog>
    }
  `,
})
class AutofocusPageComponent {
  readonly open = signal<'form' | 'inline' | null>(null);
  readonly ready = signal(true);
}

/**
 * 0.11.1: a kit field's `autofocus` inside the dialog - on the field's element, which takes no focus itself, or bound
 * - took the focus to the Close button. A browser gives no focus to what a closed <dialog> holds, and showModal() puts
 * it on the first thing it can; a field drawn in a view of its own asked for the focus before the dialog was open.
 */
describe('<anotoki-dialog> and a kit field’s autofocus', () => {
  let fixture: Awaited<ReturnType<typeof draw<AutofocusPageComponent>>>;
  const field = (label: string) =>
    Array.from(fixture.nativeElement.querySelectorAll('anotoki-text-field') as NodeListOf<HTMLElement>)
      .find((element) => words(element.querySelector('label')) === label)!
      .querySelector('input');

  beforeEach(async () => {
    // As a browser does: nothing a closed <dialog> holds takes the focus, and showModal() focuses the first thing it can.
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      if (!this.closest('dialog:not([open])')) {
        focus.call(this, options);
      }
    });
    const showModal = HTMLDialogElement.prototype.showModal;
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      showModal.call(this);
      this.querySelector<HTMLElement>('button, input, [href]')?.focus();
    });
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(AutofocusPageComponent);
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    vi.restoreAllMocks();
  });

  it('on a field of a form inside the dialog: the focus in the field, not on Close', async () => {
    fixture.componentInstance.open.set('form');
    await settle(fixture);
    expect(document.activeElement).toBe(field('Name'));
  });

  it('bound on a field the dialog draws in a block of its own: the focus in that field, not the first one', async () => {
    fixture.componentInstance.open.set('inline');
    await settle(fixture);
    expect(document.activeElement).toBe(field('Name'));
  });
});

describe('<anotoki-dialog> in Slovak', () => {
  it('names its close button in the page language', async () => {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'sk' })) });
    const fixture = await draw(DialogPageComponent);
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.anotoki-dialog__close').getAttribute('aria-label')).toBe('Zavrieť');
    fixture.nativeElement.remove();
  });
});
