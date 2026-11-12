const test = require("node:test");
const assert = require("node:assert/strict");
const { page, read, blobText, blobBytes } = require("./helpers.cjs");

const ORDER = read("tests/fixtures/order.html");
const KEYS = { Hades: "AAAAA-BBBBB-CCCCC", Celeste: "DDDDD-EEEEE-FFFFF", "GOG Game": "GOG-1234-5678" };
// Fanatical swaps the button for a key box when it is clicked. The fixture does the same.
function wireReveal(window) {
    for (const btn of window.document.querySelectorAll("article button")) btn.addEventListener("click", () => {
        const a = btn.closest("article"), input = window.document.createElement("input");
        input.setAttribute("aria-label", "reveal-key"); input.value = KEYS[a.querySelector("h3").textContent]; btn.replaceWith(input);
    });
}
async function open(opts = {}) {
    const p = page({ html: ORDER, scripts: ["lib.js", "stack.js", "content.js"], ...opts });
    wireReveal(p.window);
    await p.tick(20);
    const root = p.window.document.getElementById("fg-panel").shadowRoot;
    const wait = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await p.tick(25); } return false; };
    return { ...p, root, $: sel => root.querySelector(sel), wait, status: () => root.getElementById("fg-status-text").textContent };
}
const pick = (t, format) => t.root.querySelector(`[data-format="${format}"]`).click();

test("panel: it sits in its own shadow tree, so nothing of it leaks into the page", async () => {
    const t = await open();
    assert.ok(t.root, "the panel has a shadow root");
    assert.equal(t.window.document.querySelector("#fg-export, #fg-body, #fg-style"), null, "no panel parts or styles in the page itself");
    assert.ok(t.$("#fg-export") && t.$("#fg-reveal") && t.$("#fg-redeem") && t.$("#fg-pick") && t.$("#fg-options"));
    assert.equal(t.window.document.querySelectorAll("#fg-panel").length, 1);
    t.dom.window.close();
});

test("panel: Reveal All clicks only reveal buttons, and a CSV export holds every key with what was paid", async () => {
    const t = await open({ store: { opts: { revealDelayMs: 50 } } });
    let basket = 0; [...t.window.document.querySelectorAll("button")].find(b => b.textContent === "Add to basket").addEventListener("click", () => basket++);
    pick(t, "csv");
    assert.ok(await t.wait(() => t.downloads.length === 1 && /Exported CSV/.test(t.status())), t.status());
    assert.equal(basket, 0);
    const lines = (await blobText(t.downloads[0].blob)).replace(/^﻿/, "").trim().split("\r\n");
    assert.deepEqual(lines, ["Game,Key,Paid", '"Hades","AAAAA-BBBBB-CCCCC",2.25', '"Celeste","DDDDD-EEEEE-FFFFF",2.25', '"GOG Game","GOG-1234-5678",2.25', '"Already Shown","ZZZZZ-YYYYY-XXXXX",2.25']);
    assert.match(t.downloads[0].name, /^FanaticalGrabber_\d{4}-\d{2}-\d{2}\.csv$/);
    assert.deepEqual(Object.keys(t.chrome.store.vault).sort(), ["AAAAA-BBBBB-CCCCC", "DDDDD-EEEEE-FFFFF", "ZZZZZ-YYYYY-XXXXX"], "only Steam-format keys go in the redeem vault");
    assert.equal(Object.keys(t.chrome.store.ledger).length, 4, "every key is remembered for the every-order export");
    assert.equal(t.chrome.store.ledger["GOG-1234-5678"].order, "FAN-12345");
    t.dom.window.close();
});

test("panel: Choose games exports only what is ticked, and the options change the file name and columns", async () => {
    const t = await open({ store: { opts: { revealDelayMs: 50, fileName: "keys_{order}_{count}", extraColumns: true } } });
    t.$("#fg-reveal").click();
    assert.ok(await t.wait(() => /Ready/.test(t.status())));
    t.$("#fg-pick").click();
    const rows = [...t.root.querySelectorAll(".fg-pickrow")];
    assert.deepEqual(rows.map(r => r.textContent), ["Hades", "Celeste", "GOG Game", "Already Shown"]);
    rows[1].querySelector("input").click(); // untick Celeste
    [...t.root.querySelectorAll(".fg-pickrow")][3].querySelector("input").click(); // and Already Shown
    assert.match(t.$("#fg-pick").textContent, /2 of 4/);
    pick(t, "json");
    assert.ok(await t.wait(() => t.downloads.length === 1));
    const out = JSON.parse(await blobText(t.downloads[0].blob));
    assert.deepEqual(out.keys.map(k => [k.game, k.platform, k.order, k.orderDate]), [["Hades", "Steam", "FAN-12345", "November 3, 2026"], ["GOG Game", "Other", "FAN-12345", "November 3, 2026"]]);
    assert.equal(t.downloads[0].name, "keys_FAN-12345_2.json");
    t.root.querySelector(".fg-pickbar button:nth-child(2)").click(); // None
    pick(t, "csv");
    assert.ok(await t.wait(() => /No games picked/.test(t.status())), t.status());
    assert.equal(t.downloads.length, 1);
    t.dom.window.close();
});

test("panel: an Excel export downloads a real workbook without any library on the page, and the clipboard format is honored", async () => {
    const t = await open({ store: { opts: { revealDelayMs: 50, clipboardFormat: "{key} = {title}" } } });
    assert.equal(typeof t.window.XLSX, "undefined");
    pick(t, "xlsx");
    assert.ok(await t.wait(() => t.downloads.length === 1 && /Exported XLSX/.test(t.status())), t.status());
    const bytes = await blobBytes(t.downloads[0].blob);
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    assert.ok(bytes.includes(Buffer.from("AAAAA-BBBBB-CCCCC")) && /\.xlsx$/.test(t.downloads[0].name));
    pick(t, "clipboard");
    assert.ok(await t.wait(() => /Copied/.test(t.status())));
    assert.equal(t.window.navigator.clipboard.text.split("\n")[0], "AAAAA-BBBBB-CCCCC = Hades");
    t.dom.window.close();
});

test("panel: 'every order I've opened' adds the keys remembered from other order pages", async () => {
    const ledger = { "OLD11-OLD22-OLD33": { title: "Old Game", store: "fanatical", order: "FAN-00001", date: "May 1, 2026", paid: 1, at: "2026-05-01T00:00:00.000Z" } };
    const t = await open({ store: { opts: { revealDelayMs: 50 }, ledger } });
    t.$("#fg-allorders-box").checked = true;
    pick(t, "md");
    assert.ok(await t.wait(() => t.downloads.length === 1));
    const md = await blobText(t.downloads[0].blob);
    assert.match(md, /5 keys/); assert.match(md, /Old Game/); assert.match(md, /Hades/);
    t.dom.window.close();
});

test("panel: a Fanatical page in another language works once its button text is in the options", async () => {
    const html = ORDER.replace(/Reveal Key|reveal key/g, "Zobrazit klíč");
    const none = await open({ html, store: { opts: { revealDelayMs: 50 } } });
    none.$("#fg-reveal").click();
    assert.ok(await none.wait(() => /No keys to reveal/.test(none.status())));
    none.dom.window.close();
    const t = await open({ html, store: { opts: { revealDelayMs: 50, revealLabel: "zobrazit klíč" } } });
    await t.tick(20);
    t.$("#fg-reveal").click();
    assert.ok(await t.wait(() => t.window.document.querySelectorAll('input[aria-label="reveal-key"]').length === 4));
    t.dom.window.close();
});

test("panel: Options opens the options page through the background script", async () => {
    const t = await open();
    t.$("#fg-options").click();
    assert.equal(t.chrome.sent.at(-1).type, "open-options");
    t.dom.window.close();
});
