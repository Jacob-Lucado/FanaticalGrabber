const test = require("node:test");
const assert = require("node:assert/strict");
const { page } = require("./helpers.cjs");

const VAULT = { vault: { "AAAAA-BBBBB-CCCCC": { title: "Hades", at: "2026-11-01" }, "DDDDD-EEEEE-FFFFF": { title: "Done", at: "2026-10-01" } }, redeemed: { "DDDDD-EEEEE-FFFFF": { status: "redeemed" } } };
async function open({ activation = true, confirm = true, store = structuredClone(VAULT), onMessage } = {}) {
    const p = page({ html: "<!doctype html><body></body>", url: "https://steamvaluechecker.com/redeem", scripts: ["bridge.js"], store, activation, onMessage });
    const got = []; let asked = 0;
    p.window.confirm = () => { asked++; return confirm; };
    p.window.addEventListener("message", e => { if (e.data?.svc === "ext") got.push(JSON.parse(JSON.stringify(e.data))); }); // copied out of the page's own realm
    // What the dashboard's own postMessage looks like to the bridge: same window, same origin.
    const send = async m => { p.window.dispatchEvent(new p.window.MessageEvent("message", { data: { svc: "page", ...m }, origin: p.window.location.origin, source: p.window })); await p.tick(40); };
    return { ...p, got, send, asked: () => asked };
}

test("bridge: saved keys are listed only after a click, and only once the person said yes in the extension's own prompt", async () => {
    const quiet = await open({ activation: false });
    await quiet.send({ type: "vault" });
    assert.deepEqual(quiet.got.filter(m => m.type === "vault"), [{ svc: "ext", type: "vault", items: [], locked: true }]);
    assert.equal(quiet.asked(), 0, "no prompt when nobody clicked");
    quiet.dom.window.close();

    const no = await open({ confirm: false });
    await no.send({ type: "vault" });
    assert.equal(no.got.find(m => m.type === "vault").locked, true);
    assert.equal(no.chrome.store.vaultOk, undefined);
    no.dom.window.close();

    const yes = await open();
    await yes.send({ type: "vault" }); await yes.send({ type: "vault" });
    const lists = yes.got.filter(m => m.type === "vault");
    assert.deepEqual(lists[0].items, [{ key: "AAAAA-BBBBB-CCCCC", title: "Hades", at: "2026-11-01" }], "redeemed keys are left out");
    assert.equal(yes.asked(), 1, "asked once, then remembered");
    assert.equal(yes.chrome.store.vaultOk, true);
    yes.dom.window.close();
});

test("bridge: a redeem that doesn't follow a click is turned away before any key reaches Steam", async () => {
    const t = await open({ activation: false });
    await t.send({ type: "redeem", id: "j1", items: ["AAAAA-BBBBB-CCCCC"] });
    assert.match(t.got.find(m => m.type === "done").aborted, /Press Run again/);
    assert.equal(t.chrome.sent.filter(m => m.type === "redeem-key").length, 0);
    t.dom.window.close();
});

test("bridge: after a click it redeems valid keys, skips ones already handled and remembers the result", async () => {
    const t = await open({ store: { ...structuredClone(VAULT), vaultOk: true }, onMessage: async m => (m.type === "redeem-key" ? { status: "redeemed", game: "Hades" } : null) });
    await t.send({ type: "redeem", id: "j2", items: ["aaaaa-bbbbb-ccccc", "not a key", "DDDDD-EEEEE-FFFFF"] });
    await t.tick(3300); // the pause between keys
    const results = t.got.filter(m => m.type === "result");
    assert.deepEqual(results.map(r => [r.key, r.status]), [["AAAAA-BBBBB-CCCCC", "redeemed"], ["DDDDD-EEEEE-FFFFF", "redeemed"]]);
    assert.equal(t.chrome.sent.filter(m => m.type === "redeem-key").length, 1, "the key redeemed earlier is not sent again");
    assert.ok(t.got.some(m => m.type === "done" && !m.aborted));
    t.dom.window.close();
});

test("bridge: messages from another origin, and link codes that don't look right, are ignored", async () => {
    const t = await open();
    t.window.dispatchEvent(new t.window.MessageEvent("message", { data: { svc: "page", type: "vault" }, origin: "https://evil.example", source: t.window }));
    await t.tick(30);
    assert.equal(t.got.filter(m => m.type === "vault").length, 0);
    await t.send({ type: "connect", token: "nope" });
    assert.deepEqual(t.got.find(m => m.type === "connected"), { svc: "ext", type: "connected", ok: false });
    assert.equal(t.chrome.store.svcToken, undefined);
    t.dom.window.close();
});
