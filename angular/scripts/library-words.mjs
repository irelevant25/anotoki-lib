// Writes the Angular half's built-in library words from the one source, php/resources/library-words.json - a file
// per namespace (`anotoki.<namespace>.<word>`), each imported only where its words are said:
//
//   projects/lib/ui/config/src/library-words.ts   the kit's namespaces (language, ui, topbar, theme), which the kit
//                                                  reads (AnotokiWords): in every first load that holds the kit, and
//                                                  nothing else is. With them the type LibraryKey, every key's name
//                                                  (a type: nothing of it reaches a bundle).
//   projects/lib/words/<namespace>/                @anotoki/lib/words/<namespace>: one module's words (siteStatus:
//                                                  the migrations module's status page; signIn: the auth module's
//                                                  sign-in page), imported by that module alone, which registers
//                                                  them with the translations module (provideLibraryWords).
//   projects/lib/words/                            @anotoki/lib/words: LIBRARY_WORDS, every namespace's, for a
//                                                  site's specs and the showcase - no module of the library's.
//
// So a module that brings words brings a namespace and an entry point of its own: they reach a site with the module
// alone - neither the kit's first loads (a button, the bar, the gate) nor the translations module's carry them, and
// scripts/check-package.mjs holds every first load to the namespaces it may carry. A page has the library's words
// while the database cannot be reached, and never shows a key of the kit's or of a module it uses as a key.
//
//   bun run words            # writes the files (and removes a namespace's the JSON no longer has)
//   bun run words --check    # exits 1 when a file is not what the JSON makes, or one is left over (a spec checks too)
//
// The JSON is read as the PHP half reads it (LibraryWords::read): every key `anotoki.segment[.segment]`, each with a
// description, its English and its Slovak - and no other language: the library speaks the two the family is
// released in; a site words any other on its own Translations page. Here a key also names its namespace and its
// word: `anotoki.<namespace>.<word>`.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, "..", "projects", "lib");
const source = join(here, "..", "..", "php", "resources", "library-words.json");

const KEY = /^anotoki(?:\.[A-Za-z0-9][A-Za-z0-9_-]*){2,}$/;
const LANGUAGES = ["en", "sk"];

/** The kit's namespaces: its own words (ui/config's AnotokiWords reads them), kept with the kit. */
const KIT_NAMESPACES = ["language", "ui", "topbar", "theme"];

/** Every file this writes says so: how a left-over one is known - and only such a one is ever removed. */
const GENERATED = "GENERATED from php/resources/library-words.json by angular/scripts/library-words.mjs";

const KIT_FILE = "ui/config/src/library-words.ts";
const WORDS = "words";

/** The words of the JSON, checked whole: {key, namespace, en, sk} in the file's order. */
function readWords() {
    const document = JSON.parse(readFileSync(source, "utf8"));
    const keys = document?.keys;
    if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.keys(keys).length === 0) {
        throw new Error(`${source} does not hold {"keys": {name: {description, en, sk}}}.`);
    }
    return Object.entries(keys).map(([key, entry]) => {
        if (!KEY.test(key)) {
            throw new Error(`${source}: "${key}" is not a library key of a namespace (anotoki.<namespace>.<word>).`);
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
        return { key, namespace: key.split(".")[1], en: entry.en, sk: entry.sk };
    });
}

/** A namespace's parts: siteStatus -> site, status; my-module -> my, module. */
function parts(namespace) {
    return namespace
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.toLowerCase());
}

const kebab = (namespace) => parts(namespace).join("-");
const constant = (namespace) => parts(namespace).join("_").toUpperCase();
const pascal = (namespace) => parts(namespace).map((part) => part[0].toUpperCase() + part.slice(1)).join("");

/** A TypeScript string literal in the house style: single quotes, only what must be escaped escaped. */
function literal(text) {
    return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r")}'`;
}

/** The two tables of some words and the type of their keys - the shape LibraryWordsTest reads. */
function tables(words, keyType) {
    const rows = (code) => words.map((word) => `  ${literal(word.key)}: ${literal(word[code])},`).join("\n");
    return `const EN = {
${rows("en")}
} as const;

/** A key of these words. */
export type ${keyType} = keyof typeof EN;

const SK: Readonly<Record<${keyType}, string>> = {
${rows("sk")}
};`;
}

/** The kit's words, and every key's name. */
function kitFile(kit, others) {
    return `/*
 * The anotoki library's own words of the UI kit - \`anotoki.${KIT_NAMESPACES.join("|")}.*\` - in English and
 * in Slovak (informal, "ty"); and LibraryKey, the name of every library key.
 *
 * ${GENERATED} - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then \`bun run words\`. A spec holds the generated files to the JSON (library-words.spec.ts), and
 * the PHP half's LibraryWordsTest does too.
 *
 * The same keys are in every site's database (anotoki_translations/002 and the library migrations after it), where
 * an owner may reword them; these are what a page reads while it has no string from there. The kit reads its own
 * from here (words.ts: AnotokiWords), and so does the translations module, so they are in every first load that
 * holds either - and no other module's words are: each is in @anotoki/lib/words/<namespace>, which its module alone
 * imports and registers with the translations module (provideLibraryWords).
 */

${tables(kit, "KitLibraryKey")}

/** The kit's words, per language: English and Slovak, each with every key. */
export const KIT_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<KitLibraryKey, string>>>> = { en: EN, sk: SK };

/** A key of the library's own words, every module's: \`anotoki.<namespace>.<word>\` (a type: nothing of it is in a bundle). */
export type LibraryKey =
  | KitLibraryKey
${others.map((word) => `  | ${literal(word.key)}`).join("\n")};
`;
}

/** One module's words: @anotoki/lib/words/<namespace>. */
function namespaceFile(namespace, words) {
    const keyType = `${pascal(namespace)}LibraryKey`;
    return `/*
 * @anotoki/lib/words/${kebab(namespace)} - the anotoki library's own words of \`anotoki.${namespace}.*\`, in English and in
 * Slovak (informal, "ty"). Imported by the module that says them, which registers them with the translations module
 * (provideLibraryWords) - never by the kit nor by the translations module, so they reach a site with the module alone.
 *
 * ${GENERATED} - never
 * edited by hand: a change is made in the JSON (with the library migration that writes it to the sites'
 * databases), then \`bun run words\`.
 */

${tables(words, keyType)}

/** These words, per language: English and Slovak, each with every key. */
export const ${constant(namespace)}_LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<${keyType}, string>>>> = { en: EN, sk: SK };
`;
}

/** Every namespace's words in one table: @anotoki/lib/words. */
function aggregateFile(namespaces) {
    const imports = namespaces.map((namespace) => `import { ${constant(namespace)}_LIBRARY_WORDS } from '@anotoki/lib/words/${kebab(namespace)}';`);
    const types = namespaces.map((namespace) => `export type { ${pascal(namespace)}LibraryKey } from '@anotoki/lib/words/${kebab(namespace)}';`);
    const spread = ["KIT_LIBRARY_WORDS", ...namespaces.map((namespace) => `${constant(namespace)}_LIBRARY_WORDS`)].map((table) => `...${table}[language]`).join(", ");
    return `/*
 * @anotoki/lib/words - the anotoki library's own words, every module's: LIBRARY_WORDS, for a site's specs and the
 * showcase. No module of the library's imports it: the kit's words are ui/config's, each other module's are
 * @anotoki/lib/words/<namespace>, which the module imports and registers with the translations module.
 *
 * ${GENERATED} - never
 * edited by hand.
 */

import type { LibraryKey } from '@anotoki/lib/ui/config';
import { KIT_LIBRARY_WORDS } from '@anotoki/lib/ui/config';
${imports.join("\n")}

export type { KitLibraryKey, LibraryKey } from '@anotoki/lib/ui/config';
${types.join("\n")}

function gather(language: 'en' | 'sk'): Readonly<Record<LibraryKey, string>> {
  return { ${spread} };
}

/**
 * The library's words, per language: English and Slovak, each with every key - the kit's, then each module's.
 * The calls are marked pure: a site's build keeps a top-level call it is not told is pure.
 */
export const LIBRARY_WORDS: Readonly<Record<'en' | 'sk', Readonly<Record<LibraryKey, string>>>> = {
  en: /* @__PURE__ */ gather('en'),
  sk: /* @__PURE__ */ gather('sk'),
};
`;
}

/** An entry point's ng-package.json, `depth` folders under projects/lib. */
function ngPackage(depth) {
    return `{
  "$schema": "${"../".repeat(depth + 2)}node_modules/ng-packagr/ng-package.schema.json",
  "lib": {
    "entryFile": "public-api.ts"
  }
}
`;
}

/** Every file the JSON makes: its path under projects/lib, and its text. */
function plan(words) {
    const files = new Map();
    const kit = words.filter((word) => KIT_NAMESPACES.includes(word.namespace));
    const others = words.filter((word) => !KIT_NAMESPACES.includes(word.namespace));
    const namespaces = [...new Set(others.map((word) => word.namespace))];

    const folders = new Map();
    for (const namespace of namespaces) {
        const folder = kebab(namespace);
        if (folders.has(folder)) {
            throw new Error(`${source}: the namespaces "${folders.get(folder)}" and "${namespace}" would share @anotoki/lib/words/${folder}.`);
        }
        folders.set(folder, namespace);
    }

    files.set(KIT_FILE, kitFile(kit, others));
    for (const namespace of namespaces) {
        const folder = `${WORDS}/${kebab(namespace)}`;
        files.set(`${folder}/ng-package.json`, ngPackage(2));
        files.set(
            `${folder}/public-api.ts`,
            namespaceFile(
                namespace,
                others.filter((word) => word.namespace === namespace),
            ),
        );
    }
    files.set(`${WORDS}/ng-package.json`, ngPackage(1));
    files.set(`${WORDS}/public-api.ts`, aggregateFile(namespaces));
    return { files, namespaces };
}

/** The generated namespace folders the JSON no longer has: known by their public-api.ts saying it was generated. */
function leftOver(files) {
    const root = join(lib, WORDS);
    if (!existsSync(root)) {
        return [];
    }
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !files.has(`${WORDS}/${entry.name}/public-api.ts`))
        .map((entry) => `${WORDS}/${entry.name}`)
        .filter((folder) => {
            const api = join(lib, folder, "public-api.ts");
            return existsSync(api) && readFileSync(api, "utf8").includes(GENERATED);
        });
}

const words = readWords();
const { files, namespaces } = plan(words);
const summary = `${words.length} keys: the kit's in ${KIT_FILE}, ${namespaces.map((namespace) => `${namespace}'s in ${WORDS}/${kebab(namespace)}`).join(", ")}`;

if (process.argv.includes("--check")) {
    const stale = [];
    for (const [path, text] of files) {
        let current = null;
        try {
            current = readFileSync(join(lib, path), "utf8").replace(/\r\n/g, "\n");
        } catch {
            // No file at all: stale too.
        }
        if (current !== text) {
            stale.push(path);
        }
    }
    stale.push(...leftOver(files).map((folder) => `${folder} (a namespace the JSON no longer has)`));
    if (stale.length) {
        console.error(`library-words: not what php/resources/library-words.json makes - run \`bun run words\`:\n  ${stale.join("\n  ")}`);
        process.exit(1);
    }
    console.log(`library-words: the generated words are the JSON's (${summary}).`);
} else {
    for (const [path, text] of files) {
        mkdirSync(dirname(join(lib, path)), { recursive: true });
        writeFileSync(join(lib, path), text);
    }
    for (const folder of leftOver(files)) {
        rmSync(join(lib, folder, "public-api.ts"));
        rmSync(join(lib, folder, "ng-package.json"), { force: true });
        try {
            rmdirSync(join(lib, folder));
        } catch {
            // Something of somebody's own in it: the folder stays.
        }
        console.log(`library-words: removed ${folder} (a namespace the JSON no longer has).`);
    }
    console.log(`library-words: wrote ${summary}.`);
}
