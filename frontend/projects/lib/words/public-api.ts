/*
 * @anotoki/lib/words - the anotoki library's own words, every module's: LIBRARY_WORDS, for a site's specs and the
 * showcase. No module of the library's imports it: the kit's words are ui/config's, each other module's are
 * @anotoki/lib/words/<namespace>, which the module imports and registers with the translations module.
 *
 * GENERATED from backend/resources/library-words.json by frontend/scripts/library-words.mjs - never
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
import { TABS_LIBRARY_WORDS } from '@anotoki/lib/words/tabs';
import { DATE_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/date-field';
import { COLOR_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/color-field';
import { FILE_PICKER_LIBRARY_WORDS } from '@anotoki/lib/words/file-picker';
import { COMBOBOX_LIBRARY_WORDS } from '@anotoki/lib/words/combobox';
import { RICH_TEXT_LIBRARY_WORDS } from '@anotoki/lib/words/rich-text';
import { FOOTER_LIBRARY_WORDS } from '@anotoki/lib/words/footer';
import { ABOUT_LIBRARY_WORDS } from '@anotoki/lib/words/about';
import { SUPPORT_LIBRARY_WORDS } from '@anotoki/lib/words/support';
import { DATES_LIBRARY_WORDS } from '@anotoki/lib/words/dates';
import { NUMBER_FIELD_LIBRARY_WORDS } from '@anotoki/lib/words/number-field';
import { MULTISELECT_LIBRARY_WORDS } from '@anotoki/lib/words/multiselect';
import { AUDIO_PLAYER_LIBRARY_WORDS } from '@anotoki/lib/words/audio-player';
import { HTML_EDITOR_LIBRARY_WORDS } from '@anotoki/lib/words/html-editor';

export type { KitLibraryKey, LibraryKey } from '@anotoki/lib/ui/config';
export type { SiteStatusLibraryKey } from '@anotoki/lib/words/site-status';
export type { SignInLibraryKey } from '@anotoki/lib/words/sign-in';
export type { FeedbackLibraryKey } from '@anotoki/lib/words/feedback';
export type { LegalLinksLibraryKey } from '@anotoki/lib/words/legal-links';
export type { LegalLibraryKey } from '@anotoki/lib/words/legal';
export type { ChipsLibraryKey } from '@anotoki/lib/words/chips';
export type { ProgressLibraryKey } from '@anotoki/lib/words/progress';
export type { StepperLibraryKey } from '@anotoki/lib/words/stepper';
export type { TabsLibraryKey } from '@anotoki/lib/words/tabs';
export type { DateFieldLibraryKey } from '@anotoki/lib/words/date-field';
export type { ColorFieldLibraryKey } from '@anotoki/lib/words/color-field';
export type { FilePickerLibraryKey } from '@anotoki/lib/words/file-picker';
export type { ComboboxLibraryKey } from '@anotoki/lib/words/combobox';
export type { RichTextLibraryKey } from '@anotoki/lib/words/rich-text';
export type { FooterLibraryKey } from '@anotoki/lib/words/footer';
export type { AboutLibraryKey } from '@anotoki/lib/words/about';
export type { SupportLibraryKey } from '@anotoki/lib/words/support';
export type { DatesLibraryKey } from '@anotoki/lib/words/dates';
export type { NumberFieldLibraryKey } from '@anotoki/lib/words/number-field';
export type { MultiselectLibraryKey } from '@anotoki/lib/words/multiselect';
export type { AudioPlayerLibraryKey } from '@anotoki/lib/words/audio-player';
export type { HtmlEditorLibraryKey } from '@anotoki/lib/words/html-editor';

function gather(language: 'en' | 'sk'): Readonly<Record<LibraryKey, string>> {
  return { ...KIT_LIBRARY_WORDS[language], ...SITE_STATUS_LIBRARY_WORDS[language], ...SIGN_IN_LIBRARY_WORDS[language], ...FEEDBACK_LIBRARY_WORDS[language], ...LEGAL_LINKS_LIBRARY_WORDS[language], ...LEGAL_LIBRARY_WORDS[language], ...CHIPS_LIBRARY_WORDS[language], ...PROGRESS_LIBRARY_WORDS[language], ...STEPPER_LIBRARY_WORDS[language], ...TABS_LIBRARY_WORDS[language], ...DATE_FIELD_LIBRARY_WORDS[language], ...COLOR_FIELD_LIBRARY_WORDS[language], ...FILE_PICKER_LIBRARY_WORDS[language], ...COMBOBOX_LIBRARY_WORDS[language], ...RICH_TEXT_LIBRARY_WORDS[language], ...FOOTER_LIBRARY_WORDS[language], ...ABOUT_LIBRARY_WORDS[language], ...SUPPORT_LIBRARY_WORDS[language], ...DATES_LIBRARY_WORDS[language], ...NUMBER_FIELD_LIBRARY_WORDS[language], ...MULTISELECT_LIBRARY_WORDS[language], ...AUDIO_PLAYER_LIBRARY_WORDS[language], ...HTML_EDITOR_LIBRARY_WORDS[language] };
}

/**
 * The library's words, per language: English and Slovak, each with every key - the kit's, then each module's.
 * The calls are marked pure: a site's build keeps a top-level call it is not told is pure.
 */
export const LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<LibraryKey, string>>>> = {
  en: /* @__PURE__ */ gather('en'),
  sk: /* @__PURE__ */ gather('sk'),
};
