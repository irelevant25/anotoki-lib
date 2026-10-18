import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnotokiFeedbackConfig, provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { ANOTOKI_LIBRARY_WORDS } from '@anotoki/lib/ui/config';
import { FEEDBACK_LIBRARY_WORDS } from '@anotoki/lib/words/feedback';
import { FeedbackFormComponent } from './feedback-form.component';

/** Lets pending promises, timers of 0 and change detection run out. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }
}

/** An element's words as a person reads them, each piece of text apart. */
function words(element: Element | null | undefined): string | null {
  if (!element) {
    return null;
  }
  const parts: string[] = [];
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    parts.push(node.textContent ?? '');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  element!.value = value;
  element!.dispatchEvent(new Event('input', { bubbles: true }));
}

describe("<anotoki-feedback-form>: a visitor's message, in their language, checked and sent", () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<FeedbackFormComponent>;
  let host: HTMLElement;
  let language: WritableSignal<string>;
  let signedIn: WritableSignal<boolean>;
  let email: WritableSignal<string | null>;
  let sent: number;
  let closed: number;

  async function open(config: Partial<AnotokiFeedbackConfig> = {}, inputs: Record<string, unknown> = {}): Promise<void> {
    language = signal('en');
    signedIn = signal(false);
    email = signal<string | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnotokiFeedback(() => ({
          language: () => language(),
          signedIn: () => signedIn(),
          email: () => email(),
          page: () => '/characters/amber?tab=talents',
          ...config,
        })),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FeedbackFormComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    sent = 0;
    closed = 0;
    fixture.componentInstance.sent.subscribe(() => sent++);
    fixture.componentInstance.closed.subscribe(() => closed++);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle(fixture);
  }

  async function send(): Promise<void> {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  }

  function request(): TestRequest {
    return http.expectOne((each) => each.method === 'POST' && each.url === '/api/feedback');
  }

  const field = (name: string) => host.querySelector<HTMLInputElement & HTMLTextAreaElement>(`[data-${name}] input, [data-${name}] textarea`);
  const errorOf = (name: string) => words(host.querySelector(`[data-${name}] .anotoki-field__error`));

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.body.innerHTML = '';
  });

  it("registers its words with the translations module, and speaks the page's language", async () => {
    await open();
    expect(TestBed.inject(ANOTOKI_LIBRARY_WORDS)).toContain(FEEDBACK_LIBRARY_WORDS);
    expect(words(host.querySelector('h2'))).toBe('Send feedback');
    expect(Array.from(host.querySelectorAll('[data-kind] .anotoki-radio-group__option-label')).map((label) => words(label))).toEqual(['Something does not work', 'An idea', 'Something else']);

    language.set('sk');
    await settle(fixture);
    expect(host.getAttribute('lang')).toBe('sk');
    expect(words(host.querySelector('h2'))).toBe('Pošli nám spätnú väzbu');
    expect(words(host.querySelector('[data-message] .anotoki-field__label'))).toBe('Tvoja správa');
  });

  it("takes an owner's rewording from the site's database, and the site's own kinds, sections and fields", async () => {
    await open({
      translate: (key) => (key === 'anotoki.feedback.title' ? 'Contact us' : null),
      kinds: () => [
        { value: 'bug', label: 'A bug' },
        { value: 'question', label: 'A question' },
      ],
      sections: () => [{ value: 'Characters', label: 'Characters' }],
      fields: () => [{ name: 'steps', label: 'Steps to reproduce', kinds: ['bug'], max: 100 }],
      subjectRequiredFor: ['bug'],
    });

    expect(words(host.querySelector('h2'))).toBe('Contact us');
    expect(host.querySelectorAll('[data-kind] input[type="radio"]')).toHaveLength(2);
    expect(host.querySelector('[data-field="steps"]')).not.toBeNull();
    expect(host.querySelector('[data-subject] input')?.hasAttribute('required')).toBe(true);

    (host.querySelector('[data-kind] input[value="question"]') as HTMLInputElement).click();
    await settle(fixture);
    expect(host.querySelector('[data-field="steps"]')).toBeNull();
    expect(host.querySelector('[data-subject] input')?.hasAttribute('required')).toBe(false);
  });

  it('checks what the server would refuse - each refusal beside its field, the focus on the first - and sends nothing', async () => {
    await open({ subjectRequiredFor: ['bug'], fields: () => [{ name: 'steps', label: 'Steps', max: 5, rows: 1 }] });

    type(field('subject'), 'x'.repeat(201));
    type(field('email'), 'not an address');
    type(host.querySelector('[data-field="steps"] input'), 'one two three');
    await send();
    http.expectNone('/api/feedback');

    expect(errorOf('subject')).toBe('This is longer than 200 characters.');
    expect(errorOf('message')).toBe('Write a message first.');
    expect(words(host.querySelector('[data-field="steps"] .anotoki-field__error'))).toBe('This is longer than 5 characters.');
    expect(errorOf('email')).toBe('That does not look like an e-mail address.');
    expect(document.activeElement).toBe(field('subject'));

    type(field('subject'), '');
    await settle(fixture);
    expect(errorOf('subject')).toBeNull();
    await send();
    expect(errorOf('subject')).toBe('Give it a subject.');
    http.expectNone('/api/feedback');
  });

  it('refuses an address a mail link would read as more than an address, as the server does', async () => {
    await open();
    type(field('message'), 'Hello');

    for (const address of ['jan.novak%40gmail.com?bcc=attacker%40evil.example&x=@example.com', 'a?b@example.com', 'a&b@example.com', 'a=b@example.com', 'a#b@example.com']) {
      type(field('email'), address);
      await send();
      http.expectNone('/api/feedback');
      expect(errorOf('email')).toBe('That does not look like an e-mail address.');
    }

    type(field('email'), 'jan.novak+feedback@example.com');
    await send();
    const sent = request();
    expect(sent.request.body['email']).toBe('jan.novak+feedback@example.com');
    sent.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(host.querySelector('[data-thanks]')).not.toBeNull();
  });

  it("sends what was filled in - the page as a path, the language, the empty robots' field - and thanks", async () => {
    await open({ sections: () => [{ value: 'Characters', label: 'Postavy' }], fields: () => [{ name: 'steps', label: 'Steps', kinds: ['bug'], max: 100 }] });

    (host.querySelector('[data-section] select') as HTMLSelectElement).value = 'Characters';
    host.querySelector('[data-section] select')!.dispatchEvent(new Event('change'));
    type(field('subject'), '  The talents are empty ');
    type(field('message'), ' Opening Amber shows no talents. ');
    type(host.querySelector('[data-field="steps"] textarea'), 'Open Amber.');
    type(field('email'), 'reader@example.test');
    await send();

    const sending = request();
    expect(sending.request.body).toEqual({
      kind: 'bug',
      message: 'Opening Amber shows no talents.',
      subject: 'The talents are empty',
      section: 'Characters',
      email: 'reader@example.test',
      details: { steps: 'Open Amber.' },
      page: '/characters/amber',
      language: 'en',
      website: '',
    });
    expect(words(host.querySelector('[data-send]'))).toBe('Sending…');
    sending.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await settle(fixture);

    expect(sent).toBe(1);
    expect(words(host.querySelector('[data-thanks]'))).toBe('Thank you! Your message is on its way to us. Send another');
    expect(document.activeElement).toBe(host.querySelector('[data-thanks]'));

    (host.querySelector('[data-another]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(field('message')!.value).toBe('');
    expect(field('email')!.value).toBe('reader@example.test');
    expect(document.activeElement).toBe(field('message'));
  });

  it("writes the account's address in for somebody signed in, and sends without their name when asked", async () => {
    await open();
    signedIn.set(true);
    email.set('mira@example.test');
    await settle(fixture);
    expect(field('email')!.value).toBe('mira@example.test');

    (host.querySelector('[data-anonymous] input') as HTMLInputElement).click();
    await settle(fixture);
    expect(field('email')).toBeNull();
    type(field('message'), 'A dark map, please.');
    (host.querySelector('[data-kind] input[value="idea"]') as HTMLInputElement).click();
    await send();
    const sending = request();
    expect(sending.request.body).toEqual({ kind: 'idea', message: 'A dark map, please.', anonymous: true, page: '/characters/amber', language: 'en', website: '' });
    sending.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(sent).toBe(1);
  });

  it("keeps an address the person typed over the account's", async () => {
    await open();
    email.set('mira@example.test');
    await settle(fixture);
    type(field('email'), 'other@example.test');
    email.set('mira.new@example.test');
    await settle(fixture);
    expect(field('email')!.value).toBe('other@example.test');
  });

  it("says the server's refusals kindly, in the visitor's words - and keeps what was written", async () => {
    await open({ fields: () => [{ name: 'steps', label: 'Steps', kinds: ['bug'], max: 100 }] });
    language.set('sk');
    type(field('message'), 'Niečo nefunguje.');
    await settle(fixture);

    const refusals: [number, Record<string, unknown>, string][] = [
      [429, { code: 'too_many', message: 'That is a lot of messages in one hour.', retry_after: 1200 }, 'Ďakujeme - no to je veľa správ za krátky čas. Skús to znova o hodinu.'],
      [429, { code: 'too_many', message: 'The site has had a lot of messages today.', retry_after: 50_000 }, 'Ďakujeme - no dnes prišlo veľa správ. Skús to znova zajtra.'],
      [503, { code: 'feature_unavailable', message: 'Feedback is not open yet.' }, 'Správy teraz nemôžeš poslať. Skús to znova o pár minút.'],
      [401, { code: 'sign_in_required', message: 'Sign in to send feedback.' }, 'Na poslanie správy sa prihlás.'],
      [500, { code: 'server_error', message: 'Something went wrong on our side' }, 'Správu sa nepodarilo poslať. Skús to znova - tvoj text tu stále je.'],
    ];
    for (const [status, body, said] of refusals) {
      await send();
      request().flush(body, { status, statusText: 'Refused' });
      await settle(fixture);
      expect(words(host.querySelector('[data-failure]'))).toBe(said);
      expect(field('message')!.value).toBe('Niečo nefunguje.');
    }

    await send();
    request().error(new ProgressEvent('error'), { status: 0, statusText: '' });
    await settle(fixture);
    expect(words(host.querySelector('[data-failure]'))).toBe('Stránka nie je dostupná. Skontroluj pripojenie a skús to znova.');

    await send();
    request().flush({ code: 'too_long', message: 'The field steps is longer than 100 characters.', field: 'steps', max: 100 }, { status: 422, statusText: 'Refused' });
    await settle(fixture);
    expect(words(host.querySelector('[data-field="steps"] .anotoki-field__error'))).toBe('Toto je dlhšie ako 100 znakov.');
    expect(document.activeElement).toBe(host.querySelector('[data-field="steps"] textarea'));
  });

  it("hides its robots' field from people, and sends what a robot wrote in it as it is", async () => {
    await open();
    const trap = host.querySelector<HTMLInputElement>('[data-trap]')!;
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap.tabIndex).toBe(-1);
    expect(trap.name).toBe('website');

    type(field('message'), 'Buy cheap things');
    type(trap, 'https://spam.example');
    await send();
    const sending = request();
    expect(sending.request.body['website']).toBe('https://spam.example');
    // The server answers a filled trap as it answers a message it kept, word for word.
    sending.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(host.querySelector('[data-thanks]')).not.toBeNull();
  });

  it("in a site's dialog: no heading of its own, Cancel before sending, Close after", async () => {
    await open({ honeypot: null }, { heading: null, closable: true });
    expect(host.querySelector('h2, h3')).toBeNull();
    expect(host.querySelector('[data-trap]')).toBeNull();

    (host.querySelector('[data-cancel]') as HTMLButtonElement).click();
    expect(closed).toBe(1);

    type(field('message'), 'Hello');
    await send();
    const sending = request();
    expect('website' in sending.request.body).toBe(false);
    sending.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    (host.querySelector('[data-close]') as HTMLButtonElement).click();
    expect(closed).toBe(2);
  });
});
