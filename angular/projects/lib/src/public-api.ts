/*
 * @anotoki/lib - what the anotoki sites share, the Angular half.
 *
 * Each module is a secondary entry point of its own (`@anotoki/lib/ui`,
 * `@anotoki/lib/shell`, `@anotoki/lib/migrations`, ...), so a site's bundle
 * holds only what it imports, and a page used only from lazy routes stays out
 * of the first load; the primary entry says which version is installed. The
 * styles are a Sass module, `@use "@anotoki/lib/styles"`.
 */

/** The installed version: one number for both halves (this package and the Composer package anotoki/lib). */
export const ANOTOKI_LIB_VERSION = '0.2.0';
