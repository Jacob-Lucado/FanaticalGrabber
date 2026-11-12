// Copies the files that ship into dist/chrome and dist/firefox (no tests, docs or dev tools).
//   node scripts/build.mjs
// Zip the contents of dist/chrome for the Chrome Web Store, and dist/firefox for addons.mozilla.org.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { SHIPPED, firefoxManifest } = createRequire(import.meta.url)("./pack.cjs");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

for (const target of ["chrome", "firefox"]) {
    const out = join(root, "dist", target);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    for (const f of SHIPPED) cpSync(join(root, f), join(out, f));
    if (target === "firefox") writeFileSync(join(out, "manifest.json"), JSON.stringify(firefoxManifest(manifest), null, 2) + "\n");
    console.log(`dist/${target}: ${SHIPPED.length} files, version ${manifest.version}`);
}
