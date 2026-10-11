// Checks the built package (dist/lib) after `ng build lib`, and prints what each entry point weighs and what a site's
// first load takes of it.
//
// - Sizes: every entry point's FESM, raw and gzipped. A site's build places whole files in its chunks, and an entry
//   point is one file, so the eager ones (the ui core, ui/menu, shell, migrations, translations, auth: every page of a
//   site) have limits; the rest are printed. The ui core is a file per piece (@anotoki/lib/ui/button, /spinner, ...):
//   its limit holds the pieces together.
// - Boundaries: what each entry point may import. The library imports the core's pieces from their own entry points,
//   never through @anotoki/lib/ui, which holds re-exports and nothing else: a build that reaches it from a first page
//   places every piece any page uses in the first load. The shell imports only the core and ui/menu; nothing imports
//   the shell; the Migrations page is never pulled back into the gate's entry point, nor the admin Translations and
//   Languages pages into the translations module's. The auth module imports the core's pieces and the migrations
//   module (whether the site is blocked), and nothing imports it but its testing helper.
// - The library's words, a namespace at a time (scripts/library-words.mjs): ui/config holds the kit's namespaces
//   alone; each @anotoki/lib/words/<namespace> holds one namespace, imports nothing, and is imported by its module
//   alone, which registers it (provideLibraryWords) - the only way a module's words reach the translations module,
//   which imports none and holds the kit's alone; @anotoki/lib/words, every namespace's, is for a site's specs and
//   the showcase. Every first load carries the words of the namespaces its page says, and no others: a module that
//   brings words weighs neither on the kit's first loads nor on the translations module's.
// - Valid CSS: the tokens as the styles module writes them, and every component's styles, hold no one-item list as
//   Sass reads it back - `(0 1px 2px …,)`, which no property takes.
// - Floors: an entry point nothing is used of leaves nothing in a site's bundle. A site's build keeps a top-level call
//   or `new` it is not told is pure - the Angular CLI marks them so in @angular/* alone - and everything it reads: the
//   call is marked /* @__PURE__ */.
// - First loads: what a site's first page takes of the package in a site's own production build - every file through
//   Angular's linker and the CLI's optimizations (its JavaScriptTransformer), then the CLI's esbuild, splitting
//   chunks - beside lazy pages that use every other entry point whole. The first load holds no file of the package
//   that the first page alone does not, gains no more than SHARED_SLACK from what shares a file with it, and stays
//   under its limit.
//
// Run by `bun run build` (and so by CI and the release); exits 1 when a limit, a boundary, a floor or a first load is
// broken.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "lib");
const manifest = JSON.parse(readFileSync(join(dist, "package.json"), "utf8"));

/** The ui core: @anotoki/lib/ui re-exports these, each an entry point - a file - of its own. */
const CORE = "@anotoki/lib/ui";
const PIECES = ["config", "dom", "icon", "spinner", "button", "badge", "alert", "card", "empty-state", "error-state", "page-header", "avatar", "segmented", "autofocus"].map((piece) => `${CORE}/${piece}`);

/**
 * Gzipped kB each eager entry point may weigh - its code, without the comments, which never reach a site's bundle -
 * the core with all its pieces, and the shell with the core together (the spec's "about 25 kB"; 26.3 at 0.2.0, 27.8
 * at 0.3.0 with the kit's own class names and every library word in ui/config; 27.4 at 0.4.0, ui/config holding the
 * kit's words alone - each other module's are an entry point of their own, @anotoki/lib/words/<namespace>). Room to
 * grow a little; a limit crossed is a reason to move something into an entry point of its own, not to raise the limit.
 *
 * auth: the IAM's browser client (the SDK, ported), the session, the interceptor, the guards, the preferences and the
 * callback page - 14.9 at 0.4.0. Every site that signs in loads it on its first page, as it loads the SDK and its
 * wrappers today.
 */
const LIMITS = { [CORE]: 15, "@anotoki/lib/ui/menu": 6, "@anotoki/lib/shell": 14, "@anotoki/lib/migrations": 7, "@anotoki/lib/translations": 8, "@anotoki/lib/auth": 16 };
const UI_AND_SHELL = 28;

/** What each entry point may import of the package's own (the rest: @angular/*, rxjs, tslib). */
const MAY_IMPORT = {
    "@anotoki/lib": [],
    [CORE]: PIECES,
    "@anotoki/lib/ui/config": [],
    "@anotoki/lib/ui/dom": [],
    "@anotoki/lib/ui/icon": ["@anotoki/lib/ui/config"],
    "@anotoki/lib/ui/spinner": ["@anotoki/lib/ui/config"],
    "@anotoki/lib/ui/button": ["@anotoki/lib/ui/spinner"],
    "@anotoki/lib/ui/badge": [],
    "@anotoki/lib/ui/alert": ["@anotoki/lib/ui/icon"],
    "@anotoki/lib/ui/card": [],
    "@anotoki/lib/ui/empty-state": ["@anotoki/lib/ui/icon"],
    "@anotoki/lib/ui/error-state": ["@anotoki/lib/ui/alert", "@anotoki/lib/ui/button", "@anotoki/lib/ui/config", "@anotoki/lib/ui/icon"],
    "@anotoki/lib/ui/page-header": [],
    "@anotoki/lib/ui/avatar": [],
    "@anotoki/lib/ui/segmented": ["@anotoki/lib/ui/icon"],
    "@anotoki/lib/ui/autofocus": [],
    "@anotoki/lib/ui/icons": [],
    "@anotoki/lib/ui/menu": PIECES,
    "@anotoki/lib/ui/dialog": PIECES,
    "@anotoki/lib/ui/toast": PIECES,
    "@anotoki/lib/ui/forms": PIECES,
    "@anotoki/lib/ui/tabs": PIECES,
    "@anotoki/lib/ui/pagination": PIECES,
    "@anotoki/lib/ui/drawer": PIECES,
    "@anotoki/lib/ui/tooltip": PIECES,
    "@anotoki/lib/ui/copy": [...PIECES, "@anotoki/lib/ui/toast"],
    "@anotoki/lib/ui/qr": PIECES,
    "@anotoki/lib/shell": [...PIECES, "@anotoki/lib/ui/menu"],
    "@anotoki/lib/migrations": [...PIECES, "@anotoki/lib/words/site-status"],
    "@anotoki/lib/migrations/page": ["@anotoki/lib/migrations", ...PIECES, "@anotoki/lib/ui/dialog"],
    "@anotoki/lib/translations": PIECES,
    "@anotoki/lib/translations/admin": ["@anotoki/lib/translations", ...PIECES, "@anotoki/lib/ui/dialog", "@anotoki/lib/ui/forms", "@anotoki/lib/ui/icons"],
    "@anotoki/lib/translations/testing": ["@anotoki/lib/translations"],
    "@anotoki/lib/auth": [...PIECES, "@anotoki/lib/migrations", "@anotoki/lib/words/sign-in"],
    "@anotoki/lib/auth/testing": ["@anotoki/lib/auth"],
    // @anotoki/lib/words and every @anotoki/lib/words/<namespace>: below, from the entry points the package has.
};
const OTHERS = /^(@angular\/|rxjs(\/|$)|tslib$)/;

/** The library's words: the kit's namespaces (ui/config's), and where every other module's are. */
const WORDS = "@anotoki/lib/words";
const KIT_WORDS = ["language", "ui", "topbar", "theme"];

/** The namespaces of the library keys a piece of code holds: `anotoki.<namespace>.<word>`, whole or a template's start. */
const namespacesIn = (code) => new Set([...code.matchAll(/anotoki\.([A-Za-z0-9][A-Za-z0-9_-]*)\./g)].map((match) => match[1]));

/**
 * A site's first page, what it imports of the package, the gzipped kB its first load may take of the package beside
 * lazy pages that use every other entry point, and the namespaces of the library's words it may carry (null: every
 * one). "the gate": genshin's and the build analyzer's whole use (the status page, its buttons, the kit's and the
 * status page's words); "the bar": the family's top bar and its theme; "the words": the translations module, with the
 * kit's words alone - a module's arrive with the module, by its registration; "a button": one piece alone; "the
 * sign-in": the gate and the auth module's every eager part, the callback page routed with the first page (it is in
 * the gate's company on every site that signs in).
 */
const FIRST_LOADS = [
    { title: "the gate", imports: { "@anotoki/lib/migrations": ["SiteGateComponent", "SitePagesDirective", "SiteStatus", "siteStatusInterceptor", "provideAnotokiMigrations"] }, limit: 9, words: [...KIT_WORDS, "siteStatus"] },
    { title: "the bar", imports: { "@anotoki/lib/shell": ["TopBarComponent", "ThemeService", "provideAnotokiShell"], "@anotoki/lib/ui/config": ["provideAnotokiUi"] }, limit: 21.5, words: KIT_WORDS },
    { title: "the words", imports: { "@anotoki/lib/translations": ["TranslationService", "TranslatePipe", "provideAnotokiTranslations"] }, limit: 7.5, words: KIT_WORDS },
    { title: "a button", imports: { "@anotoki/lib/ui/button": ["ButtonComponent"] }, limit: 5.5, words: KIT_WORDS },
    {
        title: "the sign-in",
        imports: {
            "@anotoki/lib/migrations": ["SiteGateComponent", "SitePagesDirective", "SiteStatus", "siteStatusInterceptor", "provideAnotokiMigrations"],
            "@anotoki/lib/auth": ["AnotokiAuth", "anotokiAuthInterceptor", "provideAnotokiAuth", "personOrVisitorGuard", "staffGuard", "AccountPreferences", "AuthCallbackComponent"],
        },
        limit: 19.5,
        words: [...KIT_WORDS, "siteStatus", "signIn"],
    },
];

/**
 * Gzipped kB a first load may gain beside those lazy pages: what they use of a file the first page uses too (a token,
 * a provider function, the menu's popover beside the menu) and the exports the shared chunk gains for them. A
 * component of the kit is more; a first load that gains one has an import that reaches a piece it does not use.
 */
const SHARED_SLACK = 1;

/** Each entry point's name and its FESM, from the package's exports. */
const entries = Object.entries(manifest.exports)
    .filter(([key, value]) => key.startsWith(".") && typeof value === "object" && value?.default?.endsWith(".mjs"))
    .map(([key, value]) => ({ name: "@anotoki/lib" + key.slice(1), file: join(dist, value.default) }));
const fileOf = new Map(entries.map((entry) => [entry.name, entry.file]));

// A module's own words import nothing; @anotoki/lib/words gathers the kit's (ui/config) and every module's. Known from
// the package itself, so a namespace the words script adds needs nothing here - only its module's MAY_IMPORT names it.
const WORD_ENTRIES = entries.map(({ name }) => name).filter((name) => name.startsWith(`${WORDS}/`));
for (const name of WORD_ENTRIES) {
    MAY_IMPORT[name] ??= [];
}
MAY_IMPORT[WORDS] = ["@anotoki/lib/ui/config", ...WORD_ENTRIES];

const problems = [];
const rows = [];
const codeOf = {};
const weights = {};

const kb = (bytes) => (bytes / 1024).toFixed(1);
const gz = (code) => gzipSync(code, { level: 9 }).length;

for (const { name, file } of entries) {
    const source = readFileSync(file, "utf8");
    // The code alone: the comments (JSDoc, the license's) stay out of a site's bundle.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    codeOf[name] = code;
    weights[name] = gz(code) / 1024;
    rows.push([name, kb(Buffer.byteLength(source)), weights[name].toFixed(1), name in LIMITS && name !== CORE ? `${LIMITS[name]}` : ""]);

    if (!(name in MAY_IMPORT)) {
        problems.push(`${name}: an entry point check-package.mjs does not know - add it to MAY_IMPORT (and LIMITS if it is eager).`);
        continue;
    }
    const imported = new Set([...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
    for (const specifier of imported) {
        if (OTHERS.test(specifier)) {
            continue;
        }
        if (!MAY_IMPORT[name].includes(specifier)) {
            problems.push(`${name} imports ${specifier}, which it may not.`);
        }
    }
    if (name !== CORE && LIMITS[name] && weights[name] > LIMITS[name]) {
        problems.push(`${name} is ${weights[name].toFixed(1)} kB gzipped, over its ${LIMITS[name]} kB.`);
    }
}

// The core's barrel holds re-exports alone: code of its own would be one more file every first page reaching it takes.
if (codeOf[CORE].replace(/export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, "").trim() !== "") {
    problems.push(`${CORE} holds code of its own: it re-exports the pieces (${CORE}/...), and a piece is an entry point of its own.`);
}

// The library's words stay with their readers: the kit's file holds the kit's namespaces alone, and each words entry
// point one namespace - which its module imports, and the kit never does (MAY_IMPORT above).
const notTheKits = [...namespacesIn(codeOf["@anotoki/lib/ui/config"] ?? "")].filter((namespace) => !KIT_WORDS.includes(namespace));
if (notTheKits.length) {
    problems.push(`@anotoki/lib/ui/config holds the words of ${notTheKits.map((namespace) => `anotoki.${namespace}.*`).join(", ")}: the kit's file holds the kit's namespaces alone - a module's words are ${WORDS}/<namespace>'s (bun run words).`);
}
for (const name of WORD_ENTRIES) {
    const held = [...namespacesIn(codeOf[name] ?? "")];
    if (held.length !== 1) {
        problems.push(`${name} holds the words of ${held.length ? held.join(", ") : "no namespace"}: a words entry point holds one namespace (bun run words).`);
    }
}

// A module's words reach the translations module only through its registration: the translations module imports no
// words entry point, nor does any module @anotoki/lib/words (every namespace's), and a module that imports its own
// namespace's registers them - provideLibraryWords(<them>) among the providers of its provide*() function.
for (const [name, code] of Object.entries(codeOf)) {
    if (name === WORDS || name.startsWith(`${WORDS}/`)) {
        continue;
    }
    for (const [, bindings, from] of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](@anotoki\/lib\/words(?:\/[^'"]+)?)['"]/g)) {
        if (name.startsWith("@anotoki/lib/translations")) {
            problems.push(`${name} imports ${from}: a module's words reach the translations module only through the module's registration (provideLibraryWords), never by an import.`);
            continue;
        }
        if (from === WORDS) {
            problems.push(`${name} imports ${WORDS}, every module's words: a module imports its own namespace's alone.`);
            continue;
        }
        for (const binding of bindings.split(",").map((part) => part.trim().split(/\s+as\s+/).pop()).filter(Boolean)) {
            if (!new RegExp(`\\bprovideLibraryWords\\(\\s*${binding}\\s*\\)`).test(code)) {
                problems.push(`${name} takes ${binding} from ${from} without registering it (provideLibraryWords(${binding})): a module's words reach the translations module only through its registration.`);
            }
        }
    }
}

// The core whole: its pieces' code in one, as a site that uses every piece takes them.
const core = gz(PIECES.map((piece) => codeOf[piece] ?? "").join("\n")) / 1024;
if (core > LIMITS[CORE]) {
    problems.push(`${CORE} with its pieces is ${core.toFixed(1)} kB gzipped, over its ${LIMITS[CORE]} kB.`);
}
rows.push([`${CORE} + pieces`, "", core.toFixed(1), `${LIMITS[CORE]}`]);

// The Migrations page stays out of the gate's entry point: it is in every site's first load.
if (codeOf["@anotoki/lib/migrations"].includes("anotoki-migrations-page")) {
    problems.push("@anotoki/lib/migrations holds the Migrations page again: it belongs to @anotoki/lib/migrations/page alone.");
}

// The same for the translations: the service and the pipes are in every site's first load, the admin pages never.
if (/anotoki-(translations|languages)-page/.test(codeOf["@anotoki/lib/translations"])) {
    problems.push("@anotoki/lib/translations holds an admin page: they belong to @anotoki/lib/translations/admin alone.");
}

const together = core + (weights["@anotoki/lib/shell"] ?? 0);
if (together > UI_AND_SHELL) {
    problems.push(`ui and shell together are ${together.toFixed(1)} kB gzipped, over ${UI_AND_SHELL} kB.`);
}

const exported = Object.keys(manifest.exports).filter((key) => key !== "./package.json" && !key.endsWith("*") && key !== "./styles");
if (exported.length !== entries.length) {
    problems.push(`package.json exports ${exported.length} entry points with code, ${entries.length} of them name an FESM.`);
}
if (manifest.exports["./styles"]?.sass !== "./styles/_index.scss") {
    problems.push("package.json does not export ./styles to Sass.");
}

rows.sort((a, b) => a[0].localeCompare(b[0], "en"));
const widths = [36, 10, 10, 8];
const line = (cells) => cells.map((cell, index) => String(cell)[index ? "padStart" : "padEnd"](widths[index])).join(" ");
console.log("\n" + line(["entry point", "raw kB", "code gz kB", "limit"]));
for (const row of rows) {
    console.log(line(row));
}
console.log(line(["ui + shell", "", together.toFixed(1), String(UI_AND_SHELL)]));

// The CLI's own tools: its Sass and its esbuild, and the transformer its esbuild plugin runs on a package's files (a
// private export of @angular/build - an Angular update that moves it fails here, and this check follows it).
const require = createRequire(import.meta.url);
const angularBuild = createRequire(require.resolve("@angular/build/package.json"));
const sass = angularBuild("sass");
const esbuild = angularBuild("esbuild");

// ---------------------------------------------------------------------------------------------------------------------
// Valid CSS: where Sass inspects a one-item list it writes `(…,)`, which no property takes - a shadow or a filter
// that reads it is dropped (0.2.0's shadow-sm in both themes, and the mark's light outline in dark). Neither the tokens
// as root() and token() write them - the family's, and a site's own one-item values - nor any component's styles hold
// one.

const TRAILING_COMMA = /,\s*\)/;
const tokens = sass.compileString(
    `@use "sass:map";
    @use "styles" as anotoki;
    @include anotoki.root;
    @include anotoki.root((light: (shadow-sm: (0 1px 2px red,)), dark: (mark-shadow: (drop-shadow(0 0 1px white),)), font-sans: ("A Site Font",)));
    @include anotoki.base;
    @include anotoki.utilities;
    @include anotoki.tables;
    @each $name, $value in map.merge(anotoki.$light, anotoki.$shared) { .token-#{$name} { value: anotoki.token($name); } }`,
    { loadPaths: [dist] },
).css;
const invalid = new Set();
for (const declaration of tokens.split(/[;{}]/).filter((part) => TRAILING_COMMA.test(part))) {
    invalid.add(`@anotoki/lib/styles writes a one-item list as Sass reads it, not as CSS: ${declaration.trim().slice(0, 140)}`);
}
for (const { name, file } of entries) {
    const source = readFileSync(file, "utf8");
    for (const styles of source.matchAll(/styles:\s*\[\s*("(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*)\s*\]/g)) {
        for (const broken of styles[1].match(/[^;{}"]*,\s*\)[^;{}"]*/g) ?? []) {
            invalid.add(`${name}: a component's styles hold a one-item list as Sass reads it, not as CSS: ${broken.trim().slice(0, 140)}`);
        }
    }
}
problems.push(...invalid);

// ---------------------------------------------------------------------------------------------------------------------
// Floors and first loads: the package as a site's production build takes it.
const { JavaScriptTransformer } = require("@angular/build/private");
if (typeof JavaScriptTransformer !== "function") {
    console.error("\ncheck-package: @angular/build/private has no JavaScriptTransformer any more - find what the CLI's esbuild plugin runs on a package's files now, and run that here.");
    process.exit(1);
}

// As the CLI's esbuild plugin does for a package's file: linked, its top-level code marked pure where Angular's own
// rules allow (in a package that is not @angular/*, a class with Angular's static fields and InjectionToken alone),
// the package's "sideEffects": false given.
const transformer = new JavaScriptTransformer({ sourcemap: false, advancedOptimizations: true, jit: false }, 2);
const transformed = new Map();
async function transform(file) {
    if (!transformed.has(file)) {
        transformed.set(file, Buffer.from(await transformer.transformFile(file, false, false)).toString("utf8"));
    }
    return transformed.get(file);
}

/** Bundles `modules` (name -> code) as the CLI does for production, Angular and rxjs left outside. */
async function bundle(modules, { forced = null } = {}) {
    return esbuild.build({
        entryPoints: Object.keys(modules).map((name) => "page:" + name),
        bundle: true,
        format: "esm",
        splitting: true,
        write: false,
        outdir: "out",
        metafile: true,
        minify: true,
        target: "es2022",
        pure: ["forwardRef"],
        conditions: ["module", "production"],
        define: { ngDevMode: "false", ngJitMode: "false", ngServerMode: "false", ngHmrMode: "false" },
        logLevel: "silent",
        plugins: [
            {
                name: "check-package",
                setup(build) {
                    build.onResolve({ filter: /^page:/ }, (args) => ({ path: args.path.slice(5), namespace: "page" }));
                    build.onLoad({ filter: /.*/, namespace: "page" }, (args) => ({ contents: modules[args.path], loader: "js", resolveDir: dist }));
                    build.onResolve({ filter: /^@anotoki\/lib(\/.*)?$/ }, (args) =>
                        fileOf.has(args.path) ? { path: fileOf.get(args.path), sideEffects: args.path === forced } : { errors: [{ text: `no entry point ${args.path}` }] },
                    );
                    build.onResolve({ filter: /^(@angular\/|rxjs|tslib)/ }, (args) => ({ path: args.path, external: true }));
                    build.onLoad({ filter: /\.mjs$/ }, async (args) => ({ contents: await transform(args.path), loader: "js" }));
                },
            },
        ],
    });
}

/** The code of an output, without its import statements (Angular's, which stay outside here, and the chunks'). */
const withoutImports = (text) => text.replace(/import\s*(?:[^;"']*?\s*from\s*)?["'][^"']+["'];?/g, "").trim();

/** What a page loads before it runs: its own output and every chunk it imports, transitively; the package's files in it. */
function firstLoad(result, page) {
    const outputs = result.metafile.outputs;
    const start = Object.keys(outputs).find((name) => outputs[name].entryPoint === "page:" + page);
    const loaded = new Set();
    const visit = (name) => {
        if (loaded.has(name)) {
            return;
        }
        loaded.add(name);
        outputs[name].imports.filter((record) => record.kind === "import-statement" && !record.external).forEach((record) => visit(record.path));
    };
    visit(start);
    const files = new Map();
    let code = "";
    for (const name of loaded) {
        code += withoutImports(result.outputFiles.find((output) => output.path.replace(/\\/g, "/").endsWith("/" + name)).text);
        for (const [input, { bytesInOutput }] of Object.entries(outputs[name].inputs)) {
            if (input.replace(/\\/g, "/").includes("/fesm2022/")) {
                files.set(basename(input), (files.get(basename(input)) ?? 0) + bytesInOutput);
            }
        }
    }
    return { files, code, gz: gz(code) / 1024 };
}

/** The namespaces of the library's words in a first load, the kit's as one: "kit, siteStatus". */
function wordsOf(code) {
    const namespaces = [...namespacesIn(code)];
    const others = namespaces.filter((namespace) => !KIT_WORDS.includes(namespace)).sort();
    return [...(namespaces.length > others.length ? ["kit"] : []), ...others].join(", ") || "-";
}

const firstLoadRows = [];
try {
    // Floors: an entry point taken for nothing - its module kept, nothing of it used - leaves no code.
    for (const { name } of entries) {
        const result = await bundle({ floor: `import "${name}";` }, { forced: name });
        const left = withoutImports(result.outputFiles.map((output) => output.text).join(""));
        if (left !== "") {
            problems.push(`${name} leaves ${Buffer.byteLength(left)} bytes in a bundle that uses nothing of it - top-level code a site's build keeps: ${left.slice(0, 160)}`);
        }
    }

    // First loads, beside lazy pages that use every other entry point whole (a testing helper is never in a page).
    for (const { title, imports, limit, words } of FIRST_LOADS) {
        const names = Object.values(imports).flat();
        const page = Object.entries(imports)
            .map(([entry, used]) => `import { ${used.join(", ")} } from "${entry}";`)
            .concat(`export default [${names.join(", ")}];`)
            .join("\n");
        const others = entries.filter(({ name }) => !(name in imports) && !name.endsWith("/testing") && name !== "@anotoki/lib");
        const lazy = others
            .map(({ name }, index) => `import * as m${index} from "${name}";`)
            .concat(`export default [${others.map((_, index) => "m" + index).join(", ")}];`)
            .join("\n");
        const alone = firstLoad(await bundle({ first: page }), "first");
        const beside = firstLoad(await bundle({ first: page, lazy }), "first");
        const extra = [...beside.files.keys()].filter((file) => !alone.files.has(file));
        if (extra.length) {
            problems.push(`${title}: the first load takes ${extra.join(", ")} when lazy pages use them, files it does not use itself - an import of the first page reaches them (through ${CORE}?).`);
        }
        if (beside.gz - alone.gz > SHARED_SLACK) {
            const grown = [...beside.files]
                .map(([file, bytes]) => [file, bytes - (alone.files.get(file) ?? 0)])
                .filter(([, more]) => more > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([file, more]) => `${file} +${kb(more)} kB`);
            problems.push(`${title}: the first load gains ${(beside.gz - alone.gz).toFixed(1)} kB gzipped when lazy pages use the rest of the package, over ${SHARED_SLACK} kB - what they use shares a file with what it uses (${grown.join(", ")}).`);
        }
        if (beside.gz > limit) {
            problems.push(`${title}: the first load takes ${beside.gz.toFixed(1)} kB gzipped of the package, over its ${limit} kB.`);
        }
        // Its words: the namespaces its page says, and no module's that it does not - beside lazy pages that say them all.
        const strange = words === null ? [] : [...namespacesIn(beside.code)].filter((namespace) => !words.includes(namespace));
        if (strange.length) {
            problems.push(`${title}: the first load carries the words of ${strange.map((namespace) => `anotoki.${namespace}.*`).join(", ")}, which its page does not say - a module's words are ${WORDS}/<namespace>'s, imported by that module alone.`);
        }
        firstLoadRows.push([title, alone.gz.toFixed(1), beside.gz.toFixed(1), String(limit), wordsOf(beside.code)]);
    }
} finally {
    await transformer.close();
}

const loadWidths = [36, 10, 10, 8, 0];
const loadLine = (cells) => cells.map((cell, index) => (index === 4 ? "  " + cell : String(cell)[index ? "padStart" : "padEnd"](loadWidths[index]))).join(" ");
console.log("\n" + loadLine(["first load (code gz kB)", "alone", "+ lazy", "limit", "words"]));
for (const row of firstLoadRows) {
    console.log(loadLine(row));
}

if (problems.length) {
    console.error("\n" + problems.map((problem) => "check-package: " + problem).join("\n"));
    process.exit(1);
}
console.log("\ncheck-package: every entry point within its limits and boundaries, its CSS valid, nothing kept that is not used, every first load within its own.");
