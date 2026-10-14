/*
 * @anotoki/lib/words - the anotoki library's own words, every module's: LIBRARY_WORDS, for a site's specs and the
 * showcase. No module of the library's imports it: the kit's words are ui/config's, each other module's are
 * @anotoki/lib/words/<namespace>, which the module imports and registers with the translations module.
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never
 * edited by hand.
 */

import type { LibraryKey } from '@anotoki/lib/ui/config';
import { KIT_LIBRARY_WORDS } from '@anotoki/lib/ui/config';
import { SITE_STATUS_LIBRARY_WORDS } from '@anotoki/lib/words/site-status';
import { SIGN_IN_LIBRARY_WORDS } from '@anotoki/lib/words/sign-in';
import { FEEDBACK_LIBRARY_WORDS } from '@anotoki/lib/words/feedback';
import { LEGAL_LINKS_LIBRARY_WORDS } from '@anotoki/lib/words/legal-links';
import { LEGAL_LIBRARY_WORDS } from '@anotoki/lib/words/legal';
import { CHIPS_LIBRARY_WORDS } from '@anotoki/lib/words/chips';
import { PROGRESS_LIBRARY_WORDS } from '@anotoki/lib/words/progress';
import { STEPPER_LIBRARY_WORDS } from '@anotoki/lib/words/stepper';

export type { KitLibraryKey, LibraryKey } from '@anotoki/lib/ui/config';
export type { SiteStatusLibraryKey } from '@anotoki/lib/words/site-status';
export type { SignInLibraryKey } from '@anotoki/lib/words/sign-in';
export type { FeedbackLibraryKey } from '@anotoki/lib/words/feedback';
export type { LegalLinksLibraryKey } from '@anotoki/lib/words/legal-links';
export type { LegalLibraryKey } from '@anotoki/lib/words/legal';
export type { ChipsLibraryKey } from '@anotoki/lib/words/chips';
export type { ProgressLibraryKey } from '@anotoki/lib/words/progress';
export type { StepperLibraryKey } from '@anotoki/lib/words/stepper';

function gather(language: 'en' | 'sk'): Readonly<Record<LibraryKey, string>> {
  return { ...KIT_LIBRARY_WORDS[language], ...SITE_STATUS_LIBRARY_WORDS[language], ...SIGN_IN_LIBRARY_WORDS[language], ...FEEDBACK_LIBRARY_WORDS[language], ...LEGAL_LINKS_LIBRARY_WORDS[language], ...LEGAL_LIBRARY_WORDS[language], ...CHIPS_LIBRARY_WORDS[language], ...PROGRESS_LIBRARY_WORDS[language], ...STEPPER_LIBRARY_WORDS[language] };
}

/**
 * The library's words, per language: English and Slovak, each with every key - the kit's, then each module's.
 * The calls are marked pure: a site's build keeps a top-level call it is not told is pure.
 */
export const LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<LibraryKey, string>>>> = {
  en: /* @__PURE__ */ gather('en'),
  sk: /* @__PURE__ */ gather('sk'),
};
