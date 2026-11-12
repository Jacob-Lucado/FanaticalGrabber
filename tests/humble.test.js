const test = require("node:test");
const assert = require("node:assert/strict");
const { page, blobText } = require("./helpers.cjs");

// Humble's keys page as the extension expects it: one .keyfield per game, holding either the key or a "Reveal your … key" line.
const HTML = `<!doctype html><body><table>
<tr><td class="game-name"><h4>Hollow Knight</h4></td><td><div class="keyfield redeemed" title="HK111-HK222-HK333"><div class="keyfield-value">HK111-HK222-HK333</div></div></td></tr>
<tr><td class="game-name"><h4>Celeste</h4></td><td><div class="keyfield enabled" title="Reveal your Steam key"><div class="keyfield-value">Reveal your Steam key</div></div></td></tr>
<tr><td class="game-name"><h4>Old Gift</h4></td><td><div class="keyfield expired"><div class="keyfield-value">This key has expired</div></div></td></tr>
</table></body>`;
async function open({ confirm = true } = {}) {
    const p = page({ html: HTML, url: "https://www.humblebundle.com/home/keys", scripts: ["lib.js", "humble.js"], store: { opts: { revealDelayMs: 50 } } });
    p.window.confirm = () => confirm;
    for (const el of p.window.document.querySelectorAll(".keyfield")) Object.defineProperty(el, "offsetParent", { get: () => p.window.document.body }); // jsdom has no layout
    const celeste = p.window.document.querySelector(".keyfield.enabled");
    let reveals = 0; celeste.addEventListener("click", () => { reveals++; celeste.querySelector(".keyfield-value").textContent = "CE111-CE222-CE333"; });
    await p.tick(20);
    const root = p.window.document.getElementById("fg-humble").shadowRoot;
    const wait = async fn => { const t = Date.now(); while (Date.now() - t < 5000) { if (fn()) return true; await p.tick(25); } return false; };
    const button = text => [...root.querySelectorAll("button")].find(b => b.textContent.startsWith(text));
    return { ...p, root, wait, button, reveals: () => reveals, status: () => root.getElementById("status").textContent };
}

test("humble: exports the keys that are showing and leaves unrevealed and expired ones alone", async () => {
    const t = await open();
    t.button("CSV").click();
    assert.ok(await t.wait(() => t.downloads.length === 1));
    assert.deepEqual((await blobText(t.downloads[0].blob)).replace(/^﻿/, "").trim().split("\r\n"), ["Game,Key", '"Hollow Knight","HK111-HK222-HK333"']);
    assert.match(t.downloads[0].name, /^FanaticalGrabber_Humble_/);
    assert.equal(t.reveals(), 0, "exporting never reveals anything on Humble");
    t.dom.window.close();
});

test("humble: revealing asks first because it can't be undone, and skips expired keys", async () => {
    const no = await open({ confirm: false });
    no.button("Reveal").click(); await no.tick(50);
    assert.equal(no.reveals(), 0); assert.match(no.status(), /Cancelled/);
    no.dom.window.close();

    const t = await open();
    t.button("Reveal").click();
    assert.ok(await t.wait(() => /2 keys showing/.test(t.status())), t.status());
    assert.equal(t.reveals(), 1);
    assert.equal(t.chrome.store.ledger["CE111-CE222-CE333"].store, "humble");
    assert.ok(t.chrome.store.vault["CE111-CE222-CE333"], "Steam-format keys join the batch redeem vault");
    t.dom.window.close();
});
