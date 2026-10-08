/*
 * The wire format of a site's words - one for every anotoki site, the IAM's
 * (snake_case; anotoki-iam's docs/api.md is the contract) - as the PHP half
 * answers it (Anotoki\Lib\Translations\Http\TranslationsRoutes).
 */

/** A language on offer, as the bundle names it. */
export interface SiteLanguage {
  code: string;
  /** In English: "Slovak". */
  name: string;
  /** As its speakers write it: "Slovenčina". */
  native_name: string;
}

/**
 * GET {bundleUrl}/{code}: the pages' words in one language - its own strings
 * over English, the languages on offer, and English itself beside them (left
 * out when the language is English) for the areas that are English whatever
 * the reader chose. `language` is the one that answered: the code asked for,
 * its base for a regional one (`sk-sk` -> `sk`), English for one not offered.
 */
export interface TranslationBundle {
  language: string;
  languages: SiteLanguage[];
  values: Record<string, string>;
  english?: Record<string, string>;
}

/**
 * A language as the admin pages see it: GET {apiBase}/languages, every one,
 * the hidden ones too. `seeded`: released with the site (its migrations write
 * strings for it) - never deleted. `strings`: how many strings of its own it
 * has. And whatever fields the site adds (the IAM's `accounts`).
 */
export interface AdminLanguage {
  code: string;
  name: string;
  native_name: string;
  enabled: boolean;
  sort_order: number;
  seeded: boolean;
  strings: number;
  readonly [field: string]: unknown;
}

/** One key of the grid: its description, and its own string in each language that has one. */
export interface TranslationKeyRow {
  name: string;
  description: string | null;
  values: Record<string, string>;
}

/** GET {apiBase}/translations: every key with its strings, and the languages. */
export interface TranslationGrid {
  languages: AdminLanguage[];
  keys: TranslationKeyRow[];
}

/** What a save sends - PUT {apiBase}/translations {values} -, key -> language -> text: only what changed. */
export type TranslationChanges = Record<string, Record<string, string>>;

/** POST {apiBase}/languages */
export interface NewLanguage {
  code: string;
  name: string;
  native_name: string;
  enabled: boolean;
}

/** PUT {apiBase}/languages/{code}: only what changes. */
export interface LanguageChanges {
  name?: string;
  native_name?: string;
  enabled?: boolean;
  sort_order?: number;
}

/** DELETE {apiBase}/languages/{code}: the strings that went with it, and the site's own fields (the IAM's `accounts`). */
export interface LanguageDeleted {
  strings: number;
  readonly [field: string]: unknown;
}
