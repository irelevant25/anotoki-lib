/*
 * @anotoki/lib - what the anotoki sites share, the Angular half.
 *
 * Each module is a secondary entry point of its own (`@anotoki/lib/migrations`),
 * so a site's bundle holds only what it imports; the primary entry says which
 * version is installed.
 */

/** The installed version: one number for both halves (this package and the Composer package anotoki/lib). */
export const ANOTOKI_LIB_VERSION = '0.1.1';
