import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
// Whom the message is for, from the auth module's own small entry point - never the auth module itself.
import { issuedAs } from '@anotoki/lib/auth/marker';
import { ANOTOKI_FEEDBACK_CONFIG, DEFAULT_FEEDBACK_ENDPOINT, DEFAULT_HONEYPOT, FeedbackField, FeedbackKind, FeedbackWords, feedbackWords } from '@anotoki/lib/feedback';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { CheckboxComponent, RadioGroupComponent, RadioOption, SelectComponent, SelectOption, TextFieldComponent, TextareaComponent } from '@anotoki/lib/ui/forms';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { firstValueFrom } from 'rxjs';
import { FeedbackDraft } from '../feedback-draft';

/** What the server takes (Anotoki\Lib\Feedback\Feedback): checked here first, so nothing is sent that it would refuse. */
const MESSAGE_MAX = 10_000;
const SUBJECT_MAX = 200;
const EMAIL_MAX = 254;
/**
 * An address as a person types it: something, an @, something with a dot - and none of ? & = % # or a
 * control character, which a mail link would read as more than an address (the server refuses them too).
 * The server's check is the stricter one.
 */
const EMAIL = /^[^\s@?&=%#\u0000-\u001f\u007f]+@[^\s@?&=%#\u0000-\u001f\u007f]+\.[^\s@?&=%#\u0000-\u001f\u007f]+$/;
const LANGUAGE = /^[a-z]{2}(-[a-z]{2})?$/;

/** The length the server measures: characters, not UTF-16 units. */
function length(text: string): number {
  return [...text].length;
}

/** A refusal as the form reads it: its status, its code, and what else it said (`field`, `max`, `retry_after`). */
interface Refused {
  status: number;
  code: string;
  details: Record<string, unknown>;
}

function refusedOf(error: unknown): Refused {
  if (error instanceof HttpErrorResponse) {
    let body: unknown = error.error;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    const fields = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    return { status: error.status, code: typeof fields['code'] === 'string' ? fields['code'] : '', details: fields };
  }
  return { status: -1, code: '', details: {} };
}

let nextId = 0;

/**
 * The feedback form a site places on its pages - for its visitors, in their
 * language (`anotoki.feedback.*`: built in for English and informal Slovak,
 * reworded in the site's database), sent to the PHP half's public route.
 *
 * What it is about (the site's kinds; bug, idea, other by default), where (the
 * site's sections, when it has any), a subject, the message, the site's extra
 * fields for the kind, and an address for an answer - written in for somebody
 * signed in, who may also send it without their name. Each field is checked
 * here as the server checks it, the refusal beside the field, the focus on the
 * first; what the server refuses is said kindly, in the visitor's words, never
 * in its English: too many messages ("try again in an hour", "tomorrow"), the
 * site not taking any now, signing in first (a site that takes signed-in
 * people's alone), a dropped connection - and what was written stays.
 *
 * The message is anybody's (ISSUED_AS 'anybody', @anotoki/lib/auth/marker):
 * with the auth module's interceptor, the person's token while somebody is
 * signed in, the visitor's key while the page is shown to a visitor, neither
 * otherwise - never refused before it is sent for want of a token, and never
 * a page sent to sign in: the server's answer is the form's to say.
 *
 * A field no person sees or reaches waits for robots (the PHP half's
 * honeypot): filled in, the server answers as for anybody and keeps nothing.
 *
 * Nothing typed is lost until the message is sent or the page is loaded
 * afresh: the fields are the page's draft (FeedbackDraft, in memory alone), so
 * a form taken away - its dialog closed, its page left - and drawn again shows
 * them as they were. Clear, at the left of the buttons (the kit's quiet red,
 * outlined in red), empties them; a message sent empties them too.
 *
 * Once a message came: the thanks, in place, and `sent`. In a site's dialog
 * (`closable`) it has a Cancel before and a Close after, both `closed`; a
 * dialog that holds its buttons in its own footer (`actionsOutside`, as
 * <anotoki-feedback-dialog> does) draws the form's `actions` there.
 */
@Component({
  selector: 'anotoki-feedback-form',
  imports: [AlertComponent, ButtonComponent, CheckboxComponent, IconComponent, NgTemplateOutlet, RadioGroupComponent, SelectComponent, TextFieldComponent, TextareaComponent],
  templateUrl: './feedback-form.component.html',
  styleUrl: './feedback-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-feedback-form', '[attr.lang]': 'said().lang' },
})
export class FeedbackFormComponent {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly config = inject(ANOTOKI_FEEDBACK_CONFIG, { optional: true });
  private readonly draft = inject(FeedbackDraft);
  protected readonly kit = inject(AnotokiWords);

  /** The form's heading: the words' title by default; null for none (a dialog's heading says it). */
  readonly heading = input<string | null | undefined>(undefined);
  readonly headingLevel = input<2 | 3>(2);
  /** In a site's dialog: a Cancel before sending and a Close after, both telling `closed`. */
  readonly closable = input(false, { transform: booleanAttribute });
  /**
   * Its buttons drawn outside it - in the footer of the dialog around it, always in view while the form scrolls - so
   * none in the form itself: the dialog draws `actions` (<anotoki-feedback-dialog>).
   */
  readonly actionsOutside = input(false, { transform: booleanAttribute });

  /** A message came to the site. */
  readonly sent = output<void>();
  /** The person is done with the form: Cancel, or Close after the thanks. */
  readonly closed = output<void>();

  /**
   * The form's buttons as one row: Clear, (Cancel,) Send - after the thanks, Send another (and Close). Drawn under the
   * fields, or by a dialog in its footer (`actionsOutside`); Send is the form's own there too (its `form` attribute).
   */
  readonly actions = viewChild.required<TemplateRef<unknown>>('buttons');

  protected readonly id = `anotoki-feedback-${++nextId}`;
  /** The <form>'s id: Send names it, wherever it is drawn. */
  protected readonly formId = `${this.id}-form`;
  protected readonly honeypot = this.config?.honeypot === null ? null : this.config?.honeypot || DEFAULT_HONEYPOT;
  protected readonly messageMax = MESSAGE_MAX;
  protected readonly subjectMax = SUBJECT_MAX;
  protected readonly emailMax = EMAIL_MAX;

  /** The words, in the page's language. */
  protected readonly said = computed(() => feedbackWords(this.language(), this.config?.words, this.config?.translate));
  protected readonly w = computed<FeedbackWords>(() => this.said().words);
  protected readonly title = computed(() => {
    const heading = this.heading();
    return heading === null ? null : heading || this.w().title;
  });

  protected readonly kinds = computed<readonly FeedbackKind[]>(() => {
    const own = this.config?.kinds?.();
    if (own && own.length > 0) {
      return own;
    }
    const words = this.w();
    return [
      { value: 'bug', label: words.kindBug },
      { value: 'idea', label: words.kindIdea },
      { value: 'other', label: words.kindOther },
    ];
  });
  protected readonly kindOptions = computed<RadioOption[]>(() => this.kinds().map((kind) => ({ value: kind.value, label: kind.label })));
  protected readonly sectionOptions = computed<SelectOption[]>(() => (this.config?.sections?.() ?? []).map((section) => ({ value: section.value, label: section.label })));
  protected readonly signedIn = computed(() => this.config?.signedIn?.() ?? false);

  // What the person typed and chose: the page's draft, kept when the form goes.
  protected readonly kind = this.draft.kind;
  protected readonly section = this.draft.section;
  protected readonly subject = this.draft.subject;
  protected readonly message = this.draft.message;
  protected readonly email = this.draft.email;
  protected readonly anonymous = this.draft.anonymous;
  protected readonly details = this.draft.details;
  /** The robots' field: the form's own, never kept. */
  protected readonly trap = signal('');

  /** The kind chosen, or the first. */
  protected readonly chosenKind = computed(() => {
    const kind = this.kind();
    return this.kinds().some((each) => each.value === kind) ? kind : (this.kinds()[0]?.value ?? '');
  });
  protected readonly subjectRequired = computed(() => (this.config?.subjectRequiredFor ?? []).includes(this.chosenKind()));
  /** The site's fields asked for the kind chosen. */
  protected readonly fields = computed<readonly FeedbackField[]>(() => (this.config?.fields?.() ?? []).filter((field) => !field.kinds || field.kinds.includes(this.chosenKind())));

  /** Each field's refusal, by its name ('subject', 'message', 'email', 'section', `details.<name>`). */
  protected readonly errors = signal<Record<string, string>>({});
  /** What stopped the whole message, in the visitor's words. */
  protected readonly failure = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly done = signal(false);

  /** What "Send another" keeps of the message just sent - who sends it, its kind, its place - once the draft is emptied. */
  private sentWith: { kind: string; section: string; email: string; emailTyped: boolean; anonymous: boolean } | null = null;
  /** The form was taken away (its dialog closed) while its message was on its way. */
  private gone = false;

  constructor() {
    // The account's address, written in until the person types their own (the draft knows they did): never over theirs.
    effect(() => {
      const address = this.config?.email?.() ?? null;
      if (!this.draft.emailTyped) {
        untracked(() => this.email.set(address ?? ''));
      }
    });
    inject(DestroyRef).onDestroy(() => (this.gone = true));
  }

  private language(): string {
    return (this.config?.language?.() || this.document.documentElement.lang || 'en').trim();
  }

  protected setKind(kind: string): void {
    this.kind.set(kind);
    this.forget('subject');
  }

  protected setSubject(subject: string): void {
    this.subject.set(subject);
    this.forget('subject');
  }

  protected setMessage(message: string): void {
    this.message.set(message);
    this.forget('message');
  }

  protected setEmail(email: string): void {
    this.draft.emailTyped = true;
    this.email.set(email);
    this.forget('email');
  }

  protected setSection(section: string): void {
    this.section.set(section);
    this.forget('section');
  }

  protected setDetail(name: string, value: string): void {
    this.details.update((details) => ({ ...details, [name]: value }));
    this.forget(`details.${name}`);
  }

  protected setAnonymous(anonymous: boolean): void {
    this.anonymous.set(anonymous);
    this.forget('email');
  }

  protected detail(name: string): string {
    return this.details()[name] ?? '';
  }

  protected errorOf(name: string): string | null {
    return this.errors()[name] ?? null;
  }

  protected async submit(): Promise<void> {
    if (this.sending()) {
      return;
    }
    this.failure.set(null);
    const errors = this.check();
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.focusTheFirstRefused();
      return;
    }

    this.sending.set(true);
    try {
      await firstValueFrom(this.http.post(this.config?.endpoint || DEFAULT_FEEDBACK_ENDPOINT, this.body(), { context: issuedAs('anybody') }));
    } catch (error) {
      // Not sent: what was typed stays - in the form, and in the draft a form drawn later shows.
      if (!this.gone) {
        this.refused(refusedOf(error));
      }
      return;
    } finally {
      this.sending.set(false);
    }
    // Sent: the draft is emptied, so the next form starts empty - this one keeps aside what "Send another" keeps.
    this.sentWith = { kind: this.kind(), section: this.section(), email: this.email(), emailTyped: this.draft.emailTyped, anonymous: this.anonymous() };
    this.draft.clear();
    if (this.gone) {
      return;
    }
    this.done.set(true);
    this.sent.emit();
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-thanks]')?.focus(), { injector: this.injector });
  }

  /** An empty form again, for one more message - who sends it, its kind and its place as they were. */
  protected another(): void {
    const kept = this.sentWith;
    if (kept) {
      this.kind.set(kept.kind);
      this.section.set(kept.section);
      this.anonymous.set(kept.anonymous);
      this.email.set(kept.email);
      this.draft.emailTyped = kept.emailTyped;
    }
    this.errors.set({});
    this.failure.set(null);
    this.trap.set('');
    this.done.set(false);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-message] textarea')?.focus(), { injector: this.injector });
  }

  /**
   * Clear: every field as on a form never touched - what the person typed and chose gone, from the kept draft too; a
   * signed-in person's address written in again. The focus on the message, the place to start over.
   */
  protected clear(): void {
    this.draft.clear();
    this.email.set(this.config?.email?.() ?? '');
    this.errors.set({});
    this.failure.set(null);
    this.trap.set('');
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-message] textarea')?.focus(), { injector: this.injector });
  }

  /** The server's own checks, here: each refusal beside its field. */
  private check(): Record<string, string> {
    const words = this.w();
    const errors: Record<string, string> = {};
    const tooLong = (max: number) => words.tooLong.replace('{max}', String(max));
    const subject = this.subject().trim();
    const message = this.message().trim();
    if (subject === '' && this.subjectRequired()) {
      errors['subject'] = words.subjectRequired;
    } else if (length(subject) > SUBJECT_MAX) {
      errors['subject'] = tooLong(SUBJECT_MAX);
    }
    if (message === '') {
      errors['message'] = words.messageRequired;
    } else if (length(message) > MESSAGE_MAX) {
      errors['message'] = tooLong(MESSAGE_MAX);
    }
    for (const field of this.fields()) {
      const value = (this.details()[field.name] ?? '').trim();
      if (length(value) > field.max) {
        errors[`details.${field.name}`] = tooLong(field.max);
      }
    }
    const email = this.email().trim();
    if (!this.anonymous() && email !== '' && (email.length > EMAIL_MAX || !EMAIL.test(email))) {
      errors['email'] = words.emailInvalid;
    }
    return errors;
  }

  /** What is sent: only what was filled in, the page as a path, never more. */
  private body(): Record<string, unknown> {
    const body: Record<string, unknown> = { kind: this.chosenKind(), message: this.message().trim() };
    const subject = this.subject().trim();
    if (subject) {
      body['subject'] = subject;
    }
    if (this.section() && this.sectionOptions().some((option) => option.value === this.section())) {
      body['section'] = this.section();
    }
    const email = this.email().trim();
    if (this.anonymous()) {
      body['anonymous'] = true;
    } else if (email) {
      body['email'] = email;
    }
    const details: Record<string, string> = {};
    for (const field of this.fields()) {
      const value = (this.details()[field.name] ?? '').trim();
      if (value) {
        details[field.name] = value;
      }
    }
    if (Object.keys(details).length > 0) {
      body['details'] = details;
    }
    const page = (this.config?.page?.() ?? this.document.location?.pathname ?? '').split(/[?#]/)[0];
    if (page.startsWith('/') && !page.startsWith('//')) {
      body['page'] = page;
    }
    const language = this.language().toLowerCase();
    if (LANGUAGE.test(language)) {
      body['language'] = language;
    }
    if (this.honeypot) {
      body[this.honeypot] = this.trap();
    }
    return body;
  }

  /** A refusal, in the visitor's words: beside its field where it names one, above the buttons otherwise. */
  private refused(refused: Refused): void {
    const words = this.w();
    const field = typeof refused.details['field'] === 'string' ? refused.details['field'] : null;
    const max = typeof refused.details['max'] === 'number' ? refused.details['max'] : null;
    const beside = (name: string, text: string) => {
      this.errors.set({ [name]: text });
      this.focusTheFirstRefused();
    };
    switch (refused.code) {
      case 'message_required':
        return beside('message', words.messageRequired);
      case 'subject_required':
        return beside('subject', words.subjectRequired);
      case 'email_invalid':
        return beside('email', words.emailInvalid);
      case 'subject_too_long':
      case 'too_long': {
        const name = field === null || field === 'message' || field === 'subject' ? (field ?? 'message') : `details.${field}`;
        return beside(name, words.tooLong.replace('{max}', String(max ?? (name === 'subject' ? SUBJECT_MAX : MESSAGE_MAX))));
      }
    }
    if (refused.status === 0) {
      this.failure.set(words.network);
    } else if (refused.status === 429) {
      const wait = typeof refused.details['retry_after'] === 'number' ? refused.details['retry_after'] : Infinity;
      this.failure.set(wait <= 3600 ? words.tooManyHour : words.tooManyDay);
    } else if (refused.status === 503) {
      this.failure.set(words.unavailable);
    } else if (refused.status === 401) {
      this.failure.set(words.signInRequired);
    } else {
      this.failure.set(words.failed);
    }
  }

  private forget(name: string): void {
    if (name in this.errors()) {
      this.errors.update((errors) => {
        const rest = { ...errors };
        delete rest[name];
        return rest;
      });
    }
  }

  private focusTheFirstRefused(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
  }
}
