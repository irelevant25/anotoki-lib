// Writes the Angular half's built-in library words from the one source, php/resources/library-words.json:
// projects/lib/ui/src/library-words.ts (committed). The kit reads its own from it (ui.*, topbar.*,
// language.*, theme.*), the migrations module its status page's (siteStatus.*), and the translations
// module every one of them - so a page has the library's words while the database cannot be reached, and
// never shows a library key as a key.
//
//   bun run words            # writes the file
//   bun run words --check    # exits 1 when the file is not what the JSON makes (a spec checks it too)
//
// The JSON is read as the PHP half reads it (LibraryWords::read): every key `anotoki.segment[.segment]`,
// each with a description, its English and its Slovak - and no other language: the library speaks the
// two the family is released in; a site words any other on its own Translations page.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "php", "resources", "library-words.json");
const target = join(here, "..", "projects", "lib", "ui", "src", "library-words.ts");

const KEY = /^anotoki(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)+$/;
const LANGUAGES = ["en", "sk"];

/** The words of the JSON, checked whole: [key, {en, sk}] in the file's order. */
function readWords() {
    const document = JSON.parse(readFileSync(source, "utf8"));
    const keys = document?.keys;
    if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.keys(keys).length === 0) {
        throw new Error(`${source} does not hold {"keys": {name: {description, en, sk}}}.`);
    }
    return Object.entries(keys).map(([key, entry]) => {
        if (!KEY.test(key)) {
            throw new Error(`${source}: "${key}" is not a library key (anotoki.segment[.segment]).`);
        }
        if (typeof entry?.description !== "string") {
            throw new Error(`${source}: "${key}" has no description.`);
        }
        for (const field of Object.keys(entry)) {
            if (field !== "description" && !LANGUAGES.includes(field)) {
                throw new Error(`${source}: "${key}" has "${field}" - the library's words are English and Slovak; another language is a site's.`);
            }
        }
        for (const code of LANGUAGES) {
            if (typeof entry[code] !== "string" || entry[code].trim() === "") {
                throw new Error(`${source}: "${key}" needs its ${code === "en" ? "English" : "Slovak"}.`);
            }
        }
        return [key, { en: entry.en, sk: entry.sk }];
    });
}

/** A TypeScript string literal in the house style: single quotes, only what must be escaped escaped. */
function literal(text) {
    return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r")}'`;
}

/** The file the JSON makes. */
function generate(words) {
    const table = (code) => words.map(([key, entry]) => `  ${literal(key)}: ${literal(entry[code])},`).join("\n");
    return `/*
 * The anotoki library's own words: every \`anotoki.*\` key, in English and in Slovak (informal, "ty").
 *
 * GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs - never edited by
 * hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then \`bun run words\`. A spec holds this file to the JSON (library-words.spec.ts), and the
 * PHP half's LibraryWordsTest does too.
 *
 * The same keys are in every site's database (anotoki_translations/002), where an owner may reword them;
 * these are what a page reads while it has no string from there. The kit reads its own words from here
 * (words.ts: ui.*, topbar.*, language.*, theme.*), the migrations module its status page's
 * (siteStatus.*), and the translations module every one of them.
 */

const EN = {
${table("en")}
} as const;

/** A key of the library's own words: \`anotoki.<module>.<word>\`. */
export type LibraryKey = keyof typeof EN;

const SK: Readonly<Record<LibraryKey, string>> = {
${table("sk")}
};

/** The library's words, per language: English and Slovak, each with every key. */
export const LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<LibraryKey, string>>>> = { en: EN, sk: SK };
`;
}

const words = readWords();
const text = generate(words);
if (process.argv.includes("--check")) {
    let current = "";
    try {
        current = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
    } catch {
        // No file at all: stale too.
    }
    if (current !== text) {
        console.error("library-words: projects/lib/ui/src/library-words.ts is not what php/resources/library-words.json makes - run `bun run words`.");
        process.exit(1);
    }
    console.log(`library-words: projects/lib/ui/src/library-words.ts is the JSON's (${words.length} keys).`);
} else {
    writeFileSync(target, text);
    console.log(`library-words: wrote projects/lib/ui/src/library-words.ts (${words.length} keys).`);
}
