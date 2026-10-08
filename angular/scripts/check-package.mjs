// Checks the built package (dist/lib) after `ng build lib`, and prints what each entry point weighs.
//
// - Sizes: every entry point's FESM, raw and gzipped. An entry point lands whole in the chunk of whatever imports it,
//   so the eager ones (ui, ui/menu, shell, migrations: every page of a site) have limits; the rest are printed.
// - Boundaries: what each entry point may import. The shell imports only ui and ui/menu; nothing imports the shell;
//   ui imports no other entry point of the kit; the Migrations page is never pulled back into the gate's entry point.
//
// Run by `bun run build` (and so by CI and the release); exits 1 when a limit or a boundary is broken.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "lib");
const fesm = join(dist, "fesm2022");
const manifest = JSON.parse(readFileSync(join(dist, "package.json"), "utf8"));

/**
 * Gzipped kB each eager entry point may weigh - its code, without the comments, which never reach a site's bundle -
 * and the shell with the core together (the spec's "about 25 kB"; 26.3 at 0.2.0). Room to grow a little; a limit
 * crossed is a reason to move something into an entry point of its own, not to raise the limit.
 */
const LIMITS = { "@anotoki/lib/ui": 15, "@anotoki/lib/ui/menu": 6, "@anotoki/lib/shell": 14, "@anotoki/lib/migrations": 7 };
const UI_AND_SHELL = 28;

/** What each entry point may import of the package's own (the rest: @angular/*, rxjs, tslib). */
const MAY_IMPORT = {
    "@anotoki/lib": [],
    "@anotoki/lib/ui": [],
    "@anotoki/lib/ui/icons": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/menu": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/dialog": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/toast": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/forms": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/tabs": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/pagination": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/drawer": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/tooltip": ["@anotoki/lib/ui"],
    "@anotoki/lib/ui/copy": ["@anotoki/lib/ui", "@anotoki/lib/ui/toast"],
    "@anotoki/lib/ui/qr": ["@anotoki/lib/ui"],
    "@anotoki/lib/shell": ["@anotoki/lib/ui", "@anotoki/lib/ui/menu"],
    "@anotoki/lib/migrations": ["@anotoki/lib/ui"],
    "@anotoki/lib/migrations/page": ["@anotoki/lib/migrations", "@anotoki/lib/ui", "@anotoki/lib/ui/dialog"],
};
const OTHERS = /^(@angular\/|rxjs(\/|$)|tslib$)/;

const files = readdirSync(fesm).filter((file) => file.endsWith(".mjs"));
const problems = [];
const rows = [];
const weights = {};

for (const file of files) {
    const name =
        "@anotoki/" +
        file
            .replace(/\.mjs$/, "")
            .replace(/^anotoki-/, "")
            .replace(/-/g, "/");
    const source = readFileSync(join(fesm, file), "utf8");
    // The code alone: the comments (JSDoc, the license's) stay out of a site's bundle.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const raw = Buffer.byteLength(source) / 1024;
    const gz = gzipSync(code, { level: 9 }).length / 1024;
    weights[name] = gz;
    rows.push([name, raw.toFixed(1), gz.toFixed(1), LIMITS[name] ? `${LIMITS[name]}` : ""]);

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
    if (LIMITS[name] && gz > LIMITS[name]) {
        problems.push(`${name} is ${gz.toFixed(1)} kB gzipped, over its ${LIMITS[name]} kB.`);
    }
}

// The Migrations page stays out of the gate's entry point: it is in every site's first load.
if (readFileSync(join(fesm, "anotoki-lib-migrations.mjs"), "utf8").includes("anotoki-migrations-page")) {
    problems.push("@anotoki/lib/migrations holds the Migrations page again: it belongs to @anotoki/lib/migrations/page alone.");
}

const together = (weights["@anotoki/lib/ui"] ?? 0) + (weights["@anotoki/lib/shell"] ?? 0);
if (together > UI_AND_SHELL) {
    problems.push(`ui and shell together are ${together.toFixed(1)} kB gzipped, over ${UI_AND_SHELL} kB.`);
}

const exported = Object.keys(manifest.exports).filter((key) => key !== "./package.json" && !key.endsWith("*") && key !== "./styles");
if (exported.length !== files.length) {
    problems.push(`package.json exports ${exported.length} entry points, dist/lib/fesm2022 holds ${files.length}.`);
}
if (manifest.exports["./styles"]?.sass !== "./styles/_index.scss") {
    problems.push("package.json does not export ./styles to Sass.");
}

rows.sort((a, b) => a[0].localeCompare(b[0], "en"));
const widths = [32, 10, 10, 8];
const line = (cells) => cells.map((cell, index) => String(cell)[index ? "padStart" : "padEnd"](widths[index])).join(" ");
console.log("\n" + line(["entry point", "raw kB", "code gz kB", "limit"]));
for (const row of rows) {
    console.log(line(row));
}
console.log(line(["ui + shell", "", together.toFixed(1), String(UI_AND_SHELL)]));

if (problems.length) {
    console.error("\n" + problems.map((problem) => "check-package: " + problem).join("\n"));
    process.exit(1);
}
console.log("\ncheck-package: every entry point within its limits and boundaries.");
