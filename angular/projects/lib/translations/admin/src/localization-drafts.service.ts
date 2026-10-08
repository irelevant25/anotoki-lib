import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ANOTOKI_TRANSLATIONS_CONFIG, TranslationChanges, translationSettings, ɵreadTab as readTab, ɵwriteTab as writeTab } from '@anotoki/lib/translations';

/** A language's row as it stands in its fields - all text, the order too, until it is saved. */
export interface LanguageDraft {
  name: string;
  native_name: string;
  sort_order: string;
}

/** The drafts as the tab keeps them. */
interface StoredDrafts {
  owner: string;
  strings: TranslationChanges;
  languages: Record<string, LanguageDraft>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One language's row out of what was stored - or null when it is not one. */
function languageDraft(value: unknown): LanguageDraft | null {
  if (!isRecord(value)) {
    return null;
  }
  const { name, native_name, sort_order } = value;
  return typeof name === 'string' && typeof native_name === 'string' && typeof sort_order === 'string' ? { name, native_name, sort_order } : null;
}

/**
 * What the tab kept, read as nothing is trusted to be: only a value of exactly
 * the shape written here is drafts - anything else (not JSON, another shape, a
 * site's drafts from before the library, with other field names) is none.
 */
function storedDrafts(text: string | null): StoredDrafts | null {
  if (text === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed['owner'] !== 'string' || parsed['owner'] === '' || !isRecord(parsed['strings']) || !isRecord(parsed['languages'])) {
    return null;
  }
  const strings: [string, Record<string, string>][] = [];
  for (const [key, cells] of Object.entries(parsed['strings'])) {
    if (!isRecord(cells) || !Object.values(cells).every((value) => typeof value === 'string')) {
      return null;
    }
    // fromEntries, so a name like "__proto__" is a key and nothing else.
    strings.push([key, Object.fromEntries(Object.entries(cells as Record<string, string>))]);
  }
  const languages: [string, LanguageDraft][] = [];
  for (const [code, value] of Object.entries(parsed['languages'])) {
    const draft = languageDraft(value);
    if (draft === null) {
      return null;
    }
    languages.push([code, draft]);
  }
  return { owner: parsed['owner'], strings: Object.fromEntries(strings), languages: Object.fromEntries(languages) };
}

/**
 * What is typed on the admin Translations and Languages pages and not saved
 * yet: the strings' changed cells and the languages' changed rows.
 *
 * Kept here, not in the pages, because a page can go with no question asked:
 * a sign-in that ends sends the page to the sign-in, and so does signing out.
 * The pages come and go; what was typed stays, and is in its boxes again when
 * the page is back. A reload in between is a page load, so the drafts are
 * mirrored to sessionStorage (`<prefix>:localization-drafts`): for this tab
 * only, gone with it - the words of pages everybody reads, nothing secret.
 *
 * Whose they are (`account.userKey()`): only ANOTHER person signing in lets go
 * of them. Signing out keeps them, and the same person signing in again finds
 * them. With no way to tell who is signed in, they are kept for the tab.
 *
 * The one `beforeunload` question for both pages is asked here: closing the
 * tab loses the drafts, whichever page is showing - or none.
 */
@Injectable({ providedIn: 'root' })
export class LocalizationDrafts {
  private readonly config = inject(ANOTOKI_TRANSLATIONS_CONFIG, { optional: true });
  private readonly key = translationSettings(this.config).keys.drafts;

  /** The boxes of the Translations page that do not say what the site has: key -> language -> text. */
  readonly strings = signal<TranslationChanges>({});
  /** The rows of the Languages page whose fields do not say what is saved, by code. */
  readonly languages = signal<Record<string, LanguageDraft>>({});
  /** How many cells and rows are changed and not saved. */
  readonly count = computed(() => Object.values(this.strings()).reduce((cells, row) => cells + Object.keys(row).length, 0) + Object.keys(this.languages()).length);

  /** Who is signed in, as the drafts name their owner - null for nobody; '*' (the tab's) where the site cannot tell. */
  private readonly person = computed(() => {
    const userKey = this.config?.account?.userKey;
    return userKey ? userKey() : '*';
  });
  /** Whose drafts these are: the person who typed them, signed in or not just now. */
  private readonly owner = signal<string | null>(null);

  constructor() {
    const person = untracked(this.person);
    const stored = storedDrafts(readTab(this.key));
    // Kept for the person signed in - or for whoever signs in next, while nobody is: the effect below lets
    // go of them when somebody else comes.
    if (stored && (person === null || person === stored.owner)) {
      this.owner.set(stored.owner);
      this.strings.set(stored.strings);
      this.languages.set(stored.languages);
    } else {
      this.owner.set(person);
      // Broken, or somebody else's: no drafts, and not read again.
      writeTab(this.key, null);
    }

    effect(() => {
      this.person();
      untracked(() => this.settle());
    });
    // Kept for the tab as the page next draws, whoever changed them.
    effect(() => this.mirror());

    // And as they are the moment the page goes - a reload may come before the page has drawn again.
    const leaving = (): void => this.mirror();
    const warn = (event: BeforeUnloadEvent): void => {
      this.mirror();
      if (this.count() > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    globalThis.addEventListener?.('beforeunload', warn);
    globalThis.addEventListener?.('pagehide', leaving);
    inject(DestroyRef).onDestroy(() => {
      globalThis.removeEventListener?.('beforeunload', warn);
      globalThis.removeEventListener?.('pagehide', leaving);
    });
  }

  /** Every draft let go: given up, or somebody else's - out of the tab's storage at once, not when the page next draws. */
  clear(): void {
    this.strings.set({});
    this.languages.set({});
    this.mirror();
  }

  /**
   * Whose the drafts are, against who is signed in now: only somebody else
   * signing in lets go of what is here. It runs by itself whenever the person
   * changes - as an effect, when the page next draws - so a page made in that
   * same moment calls it before it reads any.
   */
  settle(): void {
    const signedIn = this.person();
    if (signedIn !== null && signedIn !== this.owner()) {
      const hadOwner = this.owner() !== null;
      this.owner.set(signedIn);
      if (hadOwner) {
        this.clear();
      }
    }
  }

  /** The drafts as they are now, into the tab's storage - or nothing there, when there are none or nobody to keep them for. */
  private mirror(): void {
    const owner = this.owner();
    const strings = this.strings();
    const languages = this.languages();
    writeTab(this.key, owner !== null && this.count() > 0 ? JSON.stringify({ owner, strings, languages } satisfies StoredDrafts) : null);
  }
}
