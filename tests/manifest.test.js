const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { read, ROOT } = require("./helpers.cjs");
const { firefoxManifest, SHIPPED } = require("../scripts/pack.cjs");

const manifest = JSON.parse(read("manifest.json"));
const files = [...manifest.content_scripts.flatMap(c => c.js), manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page, ...Object.values(manifest.icons)];

test("manifest: every file it names exists and is in the list of files that ship", () => {
    for (const f of new Set(files)) {
        assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is missing`);
        assert.ok(SHIPPED.includes(f), `${f} is not in the packing list`);
    }
    for (const f of SHIPPED) assert.ok(fs.existsSync(path.join(ROOT, f)), `the packing list names ${f}, which is missing`);
});

test("manifest: permissions and sites stay exactly what the privacy page explains", () => {
    assert.deepEqual(manifest.permissions.sort(), ["alarms", "clipboardWrite", "cookies", "storage"]);
    assert.deepEqual(manifest.host_permissions.sort(), ["https://steamvaluechecker.com/*", "https://steamvaluechecker.fly.dev/*", "https://store.steampowered.com/*"]);
    const hosts = [...new Set(manifest.content_scripts.flatMap(c => c.matches).map(m => new URL(m.replace(/\*/g, "x")).hostname))].sort();
    assert.deepEqual(hosts, ["fanatical.com", "steamvaluechecker.com", "steamvaluechecker.fly.dev", "store.epicgames.com", "store.steampowered.com", "www.fanatical.com", "www.gog.com", "www.greenmangaming.com", "www.humblebundle.com"]);
    const privacy = read("docs/privacy.html");
    for (const p of manifest.permissions) assert.ok(privacy.includes(`<code>${p}</code>`), `the privacy page doesn't explain the ${p} permission`);
});

test("manifest: the shared helpers load before the scripts that use them, and no big library ships", () => {
    for (const c of manifest.content_scripts) for (const user of ["content.js", "humble.js"]) if (c.js.includes(user)) assert.ok(c.js.indexOf("lib.js") < c.js.indexOf(user), `lib.js must come before ${user}`);
    assert.ok(!files.some(f => /xlsx/i.test(f)));
    for (const f of SHIPPED) assert.ok(fs.statSync(path.join(ROOT, f)).size < 200_000, `${f} is over 200 KB`);
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.ok(read("README.md").includes(`version-${manifest.version}-`), "the README badge shows another version");
});

test("firefox build: same extension with a background script, an add-on id and a minimum version", () => {
    const fx = firefoxManifest(manifest);
    assert.deepEqual(fx.background, { scripts: ["background.js"] });
    assert.match(fx.browser_specific_settings.gecko.id, /@/);
    assert.ok(Number(fx.browser_specific_settings.gecko.strict_min_version.split(".")[0]) >= 121);
    assert.deepEqual(fx.content_scripts, manifest.content_scripts);
    assert.equal(manifest.background.service_worker, "background.js", "the Chrome manifest itself is untouched");
});

test("every script parses", () => {
    for (const f of SHIPPED.filter(f => f.endsWith(".js"))) assert.doesNotThrow(() => new Function(read(f)), `${f} has a syntax error`);
});
