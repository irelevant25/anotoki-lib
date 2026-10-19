import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnotokiFeedbackConfig, provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { press, settle, words } from '../../../../ui/src/testing';
import { FeedbackDialogComponent } from './feedback-dialog.component';

/** A page that opens the dialog, as the footer and the Contact page do: it is there while it is open. */
@Component({
  selector: 'anotoki-test-feedback-dialog-page',
  imports: [FeedbackDialogComponent],
  template: `
    @if (open()) {
      <anotoki-feedback-dialog heading="Feedback" (closed)="open.set(false); closed = closed + 1" />
    }
  `,
})
class DialogPageComponent {
  readonly open = signal(true);
  closed = 0;
}

function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  element!.value = value;
  element!.dispatchEvent(new Event('input', { bubbles: true }));
}

describe("<anotoki-feedback-dialog>: the feedback form in the kit's dialog, its buttons in the dialog's footer", () => {
  let fixture: ComponentFixture<DialogPageComponent>;
  let host: HTMLElement;
  let page: DialogPageComponent;
  let http: HttpTestingController;
  let language: WritableSignal<string>;
  let email: WritableSignal<string | null>;

  async function open(config: Partial<AnotokiFeedbackConfig> = {}): Promise<void> {
    language = signal('en');
    email = signal<string | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnotokiFeedback(() => ({
          language: () => language(),
          signedIn: () => email() !== null,
          email: () => email(),
          page: () => '/characters',
          sections: () => [{ value: 'Characters', label: 'Characters' }],
          ...config,
        })),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DialogPageComponent);
    page = fixture.componentInstance;
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
  }

  /** Closes the dialog the way given, then opens a new one, as a page does with its button. */
  async function reopen(): Promise<void> {
    page.open.set(true);
    await settle(fixture);
  }

  const dialog = () => host.querySelector('[data-feedback-dialog]');
  const body = () => dialog()?.querySelector('.anotoki-dialog__body') ?? null;
  const footer = () => dialog()?.querySelector('.anotoki-dialog__footer') ?? null;
  const field = (name: string) => body()?.querySelector<HTMLInputElement & HTMLTextAreaElement>(`[data-${name}] input, [data-${name}] textarea`) ?? null;
  const footerButton = (name: string) => footer()?.querySelector<HTMLButtonElement>(`[data-${name}]`) ?? null;
  const request = (): TestRequest => http.expectOne((each) => each.method === 'POST' && each.url === '/api/feedback');

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it("draws the form in the dialog's body and its buttons in the dialog's own footer: Clear apart, at the left; Cancel and Send", async () => {
    await open();
    expect(words(dialog()?.querySelector('.anotoki-dialog__title'))).toBe('Feedback');
    expect(dialog()?.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    // The body scrolls, the footer stays: two parts of the panel, neither inside the other.
    expect(body()?.querySelector('anotoki-feedback-form form')).not.toBeNull();
    expect(body()?.querySelector('anotoki-feedback-form h2, anotoki-feedback-form h3')).toBeNull();
    expect(body()?.querySelector('[data-actions], [data-clear], [data-cancel], [data-send]')).toBeNull();
    expect(body()?.contains(footer())).toBe(false);
    expect(footer()?.contains(body())).toBe(false);
    expect(footer()?.parentElement).toBe(body()?.parentElement);

    const row = footer()!.querySelector('[data-actions]')!;
    expect(row.classList).toContain('anotoki-feedback-form__actions--outside');
    expect(Array.from(row.querySelectorAll('button')).map((button) => words(button))).toEqual(['Clear', 'Cancel', 'Send']);
    // Clear: the kit's quiet red, outlined in red by the form, apart from the others; named to a screen reader as what
    // it empties.
    const clear = footerButton('clear')!;
    expect(clear.classList).toContain('anotoki-button--danger-ghost');
    expect(clear.classList).toContain('anotoki-feedback-form__clear');
    expect(clear.getAttribute('aria-label')).toBe('Clear the form');
    expect(clear.getAttribute('type')).toBe('button');
    // Send is the form's own from there: it names the form, so it submits it - and Enter in a field does too.
    const send = footerButton('send')!;
    expect(send.getAttribute('type')).toBe('submit');
    expect(send.form).toBe(body()?.querySelector('form'));
  });

  it('sends the form from its footer, then says the thanks with Send another and Close there', async () => {
    await open();
    type(field('message'), 'The map is dark.');
    await settle(fixture);
    footerButton('send')!.click();
    await settle(fixture);

    const sending = request();
    expect(sending.request.body).toEqual(expect.objectContaining({ kind: 'bug', message: 'The map is dark.', page: '/characters' }));
    expect(footerButton('send')?.getAttribute('aria-busy')).toBe('true');
    expect(footerButton('clear')?.disabled).toBe(true);
    expect(footerButton('cancel')?.disabled).toBe(true);
    sending.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await settle(fixture);

    expect(body()?.querySelector('[data-thanks]')).not.toBeNull();
    expect(body()?.querySelector('[data-thanks] button')).toBeNull();
    expect(Array.from(footer()!.querySelectorAll('button')).map((button) => words(button))).toEqual(['Send another', 'Close']);
    footerButton('close')!.click();
    await settle(fixture);
    expect(page.closed).toBe(1);
    expect(dialog()).toBeNull();
  });

  it('keeps what was typed when it is closed - Escape, Cancel, its close button, the backdrop - and shows it again; in memory alone', async () => {
    await open();
    localStorage.clear();
    sessionStorage.clear();
    body()!.querySelector<HTMLInputElement>('[data-kind] input[value="idea"]')!.click();
    const select = body()!.querySelector<HTMLSelectElement>('[data-section] select')!;
    select.value = 'Characters';
    select.dispatchEvent(new Event('change'));
    type(field('subject'), 'A dark map');
    type(field('message'), 'A dark map, please.');
    type(field('email'), 'reader@example.test');
    await settle(fixture);

    const typed = () => [
      body()?.querySelector<HTMLInputElement>('[data-kind] input:checked')?.value,
      body()?.querySelector<HTMLSelectElement>('[data-section] select')?.value,
      field('subject')?.value,
      field('message')?.value,
      field('email')?.value,
    ];
    const closings: [string, () => void][] = [
      ['Escape', () => press(dialog()!.querySelector('dialog')!, 'Escape')],
      ['Cancel', () => footerButton('cancel')!.click()],
      ['its close button', () => dialog()!.querySelector<HTMLButtonElement>('.anotoki-dialog__close')!.click()],
      [
        'the backdrop',
        () => {
          const element = dialog()!.querySelector('dialog')!;
          element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
          element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        },
      ],
    ];
    for (const [how, close] of closings) {
      close();
      await settle(fixture);
      expect(dialog(), how).toBeNull();
      await reopen();
      expect(typed(), how).toEqual(['idea', 'Characters', 'A dark map', 'A dark map, please.', 'reader@example.test']);
    }
    expect(page.closed).toBe(4);
    // Never in the browser's storage: a page loaded afresh starts empty.
    expect([localStorage.length, sessionStorage.length]).toEqual([0, 0]);
  });

  it("Clear empties every field and the kept draft - a signed-in person's address written in again - and puts the focus on the message", async () => {
    await open();
    email.set('mira@example.test');
    await settle(fixture);
    expect(field('email')?.value).toBe('mira@example.test');
    body()!.querySelector<HTMLInputElement>('[data-kind] input[value="other"]')!.click();
    type(field('subject'), 'Hello');
    type(field('message'), 'Something else.');
    type(field('email'), 'other@example.test');
    await settle(fixture);

    footerButton('clear')!.click();
    await settle(fixture);
    expect(body()?.querySelector<HTMLInputElement>('[data-kind] input:checked')?.value).toBe('bug');
    expect([field('subject')?.value, field('message')?.value, field('email')?.value]).toEqual(['', '', 'mira@example.test']);
    expect(document.activeElement).toBe(field('message'));
    http.expectNone('/api/feedback');

    // The kept draft is empty too: a dialog opened again starts as a new one.
    footerButton('cancel')!.click();
    await settle(fixture);
    await reopen();
    expect([field('subject')?.value, field('message')?.value, field('email')?.value]).toEqual(['', '', 'mira@example.test']);
  });

  it("a message sent empties the draft: the next dialog starts empty - and its words are the form's language, in the footer too", async () => {
    await open();
    language.set('sk');
    type(field('subject'), 'Mapa');
    type(field('message'), 'Tmavá mapa, prosím.');
    await settle(fixture);
    expect(footer()?.querySelector('[data-actions]')?.getAttribute('lang')).toBe('sk');
    expect(words(footerButton('clear'))).toBe('Vymazať');
    expect(footerButton('clear')?.getAttribute('aria-label')).toBe('Vymazať formulár');
    expect(words(footerButton('send'))).toBe('Poslať');

    footerButton('send')!.click();
    await settle(fixture);
    request().flush({ ok: true }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    footerButton('close')!.click();
    await settle(fixture);
    await reopen();
    expect([field('subject')?.value, field('message')?.value]).toEqual(['', '']);
  });

  it('keeps what was typed when the message could not be sent and the dialog was closed meanwhile', async () => {
    await open();
    type(field('message'), 'Still here.');
    await settle(fixture);
    footerButton('send')!.click();
    await settle(fixture);
    const sending = request();
    // Escape closes it while the message is on its way; the message goes on, and is refused.
    press(dialog()!.querySelector('dialog')!, 'Escape');
    await settle(fixture);
    expect(dialog()).toBeNull();
    sending.flush({ code: 'server_error' }, { status: 500, statusText: 'Refused' });
    await settle(fixture);

    await reopen();
    expect(field('message')?.value).toBe('Still here.');
  });
});
