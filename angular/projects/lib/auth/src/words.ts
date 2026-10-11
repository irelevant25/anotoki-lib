import { SIGN_IN_LIBRARY_WORDS } from '@anotoki/lib/words/sign-in';

/**
 * The visitors' words of signing in - the callback's "Signing you in…" and what
 * a sign-in that came back without one says: from its code alone, never from
 * the IAM's or the client's English sentence. Each is the library's word
 * `anotoki.signIn.<name>`: built in for English and Slovak (informal, "ty"),
 * and in every site's database (anotoki_translations/003), where its owner may
 * reword them. A site words them its own way per language (`words`), or from
 * its database (`translate`: the translations module's libraryWord()).
 */
export interface SignInWords {
  signingIn: string;
  /** access_denied: the IAM turned the account away, or the person went back from its page. */
  notCompleted: string;
  /** state_mismatch: the sign-in did not start on this page, or took too long. */
  expired: string;
  /** storage_unavailable: the browser refuses the site's storage, so the sign-in never started. */
  storageUnavailable: string;
  /** The site cannot offer signing in now (no IAM answer, a site the IAM does not know). */
  unavailable: string;
  /** Anything else: {code} is the code. */
  failed: string;
  retry: string;
  back: string;
}

/** The words' names, each the library's word `anotoki.signIn.<name>`. */
export const SIGN_IN_WORD_NAMES = ['signingIn', 'notCompleted', 'expired', 'storageUnavailable', 'unavailable', 'failed', 'retry', 'back'] as const satisfies readonly (keyof SignInWords)[];

function builtIn(language: 'en' | 'sk'): SignInWords {
  return Object.fromEntries(SIGN_IN_WORD_NAMES.map((name) => [name, SIGN_IN_LIBRARY_WORDS[language][`anotoki.signIn.${name}`]])) as unknown as SignInWords;
}

/**
 * The built-in words: the library's words `anotoki.signIn.*`
 * (@anotoki/lib/words/sign-in, generated from php/resources/library-words.json)
 * - never a copy by hand, and in no first load of the kit.
 *
 * The calls are marked pure: a site's build keeps a top-level call it is not
 * told is pure, and with it the library's every word, signing in or not.
 */
export const BUILT_IN_WORDS: Readonly<Record<'en' | 'sk', SignInWords>> = {
  en: /* @__PURE__ */ builtIn('en'),
  sk: /* @__PURE__ */ builtIn('sk'),
};

/** The library's key of a word, as a site's database holds it. */
export function signInKey(name: keyof SignInWords): string {
  return `anotoki.signIn.${name}`;
}

/**
 * The words for a language - English, under the built-in words of that
 * language, under the site's own, under its bundle's - and the language they
 * are in ('en' when nothing has that language).
 */
export function signInWords(
  language: string | null | undefined,
  overrides?: Record<string, Partial<SignInWords>>,
  translate?: (key: string) => string | null | undefined,
): { lang: string; words: SignInWords } {
  const code = (language || 'en').trim().toLowerCase();
  const primary = code.split('-')[0];
  const builtIn = BUILT_IN_WORDS[code as 'en'] ?? BUILT_IN_WORDS[primary as 'en'];
  const own = overrides?.[language ?? ''] ?? overrides?.[code] ?? overrides?.[primary];

  const words: SignInWords = { ...BUILT_IN_WORDS.en, ...builtIn };
  for (const [key, value] of Object.entries(own ?? {})) {
    if (typeof value === 'string' && value !== '') {
      words[key as keyof SignInWords] = value;
    }
  }
  let translated = false;
  if (translate) {
    for (const name of Object.keys(words) as (keyof SignInWords)[]) {
      const value = translate(signInKey(name));
      // A bundle without the key answers the key itself, or nothing.
      if (typeof value === 'string' && value !== '' && value !== signInKey(name)) {
        words[name] = value;
        translated = true;
      }
    }
  }

  return { lang: builtIn || own || translated ? code : 'en', words };
}

/** An OAuth error code, or one of the client's: a short word, nothing a sentence could hide in. */
const FAILURE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

/** What to say of a sign-in that came back without one, or could not start - from its code alone. */
export function failureText(code: string, words: SignInWords): string {
  switch (code) {
    case 'access_denied':
      return words.notCompleted;
    case 'state_mismatch':
      return words.expired;
    case 'storage_unavailable':
      return words.storageUnavailable;
    case 'unavailable':
      return words.unavailable;
    default:
      return words.failed.replace('{code}', FAILURE_CODE.test(code) ? code : 'unknown');
  }
}
