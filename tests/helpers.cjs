// A fake browser for the content scripts: a jsdom page, a chrome.* stand-in backed by a plain object, and a record of downloads.
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

function fakeChrome(store = {}, { onMessage = async () => null } = {}) {
    const sent = [];
    return {
        sent, store,
        runtime: { id: "ext", getManifest: () => JSON.parse(read("manifest.json")), sendMessage: (m, cb) => { sent.push(m); const p = onMessage(m); if (cb) { p.then(cb); return; } return p; }, lastError: null },
        storage: {
            local: {
                get: async keys => { const ks = keys == null ? Object.keys(store) : typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys); return Object.fromEntries(ks.filter(k => k in store).map(k => [k, structuredClone(store[k])])); },
                set: async obj => { Object.assign(store, structuredClone(obj)); },
                remove: async keys => { for (const k of [].concat(keys)) delete store[k]; }
            },
            onChanged: { addListener() {} }
        }
    };
}

/** Loads a page and runs the given extension scripts in it, in order. Returns { dom, window, chrome, downloads, tick }. */
function page({ html, url = "https://www.fanatical.com/en/orders/FAN-12345", scripts = [], store = {}, onMessage, activation = true }) {
    const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
    const { window } = dom;
    const chrome = fakeChrome(store, { onMessage });
    const downloads = [];
    window.chrome = chrome;
    window.TextEncoder = TextEncoder; // browsers have it; jsdom leaves it out
    window.confirm = () => true; window.prompt = () => "";
    // jsdom's Blob can't be read back, so keep what each one was made from.
    const RealBlob = window.Blob;
    window.Blob = class extends RealBlob { constructor(parts = [], o) { super(parts, o); this.parts = parts; } };
    window.URL.createObjectURL = blob => { downloads.push({ blob }); return "blob:x"; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.at(-1).name = this.download; };
    Object.defineProperty(window.navigator, "clipboard", { value: { text: "", writeText: async t => { window.navigator.clipboard.text = t; } }, configurable: true });
    Object.defineProperty(window.navigator, "userActivation", { value: { isActive: activation }, configurable: true, writable: true });
    for (const f of scripts) window.eval(read(f));
    const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
    return { dom, window, chrome, downloads, tick };
}
const blobBytes = async blob => Buffer.concat(blob.parts.map(p => (typeof p === "string" ? Buffer.from(p, "utf8") : Buffer.from(p))));
const blobText = async blob => (await blobBytes(blob)).toString("utf8");
module.exports = { page, fakeChrome, read, ROOT, blobText, blobBytes };
