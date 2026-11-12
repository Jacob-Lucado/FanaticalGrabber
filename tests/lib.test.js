const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const L = require("../lib.js");

const ROWS = [{ title: 'Hades, "the" game', key: "AAAAA-BBBBB-CCCCC", paid: 3, order: "FAN-1", date: "Nov 3, 2026" }, { title: "Żółć | ゲーム", key: "GOG-KEY-0001", paid: 3, order: "FAN-1", date: "Nov 3, 2026" }];
const NOW = new Date(2026, 10, 12, 9, 5);

test("options: missing or silly values go back to the defaults, and redeeming is never faster than 3 seconds", () => {
    assert.deepEqual(L.cleanOptions(), L.DEFAULTS);
    const o = L.cleanOptions({ revealDelayMs: 5, redeemDelayMs: 100, fileName: "  ", clipboardFormat: "{key}", extraColumns: 1, revealLabel: "  Key anzeigen " });
    assert.deepEqual([o.revealDelayMs, o.redeemDelayMs, o.fileName, o.clipboardFormat, o.extraColumns, o.revealLabel], [50, 3000, L.DEFAULTS.fileName, "{key}", true, "Key anzeigen"]);
    assert.equal(L.cleanOptions({ redeemDelayMs: "abc" }).redeemDelayMs, 3000);
});

test("reveal buttons are matched in several languages and by a typed label, never by other buttons", () => {
    for (const t of ["Reveal Key", "  reveal   key ", "REVEAL KEY", "Key anzeigen", "Révéler la clé", "Revelar clave"]) assert.equal(L.isRevealLabel(t), true, t);
    for (const t of ["", "Add to basket", "Redeem on Steam", "Reveal", "Key"]) assert.equal(L.isRevealLabel(t), false, t);
    assert.equal(L.isRevealLabel("Zobrazit klíč", "zobrazit klíč"), true);
    assert.equal(L.isRevealLabel("Add to basket", ""), false);
});

test("amounts read in both number styles", () => {
    assert.deepEqual(["$9.00", "€1.234,56", "£1,234.56", "Total: $0", "free"].map(L.parseAmount), [9, 1234.56, 1234.56, 0, null]);
});

test("file names follow the pattern and drop characters a file can't have", () => {
    assert.equal(L.fileName("FanaticalGrabber_{date}", { now: NOW }), "FanaticalGrabber_2026-11-12");
    assert.equal(L.fileName("keys {order} ({count}) {time}", { now: NOW, order: "FAN-1", count: 7 }), "keys FAN-1 (7) 0905");
    assert.equal(L.fileName('a/b:c*?"<>|', { now: NOW }), "abc");
    assert.equal(L.fileName("///", { now: NOW }), "FanaticalGrabber_2026-11-12");
});

test("exports: CSV, JSON, Markdown, HTML and text hold every key, with order columns only when asked", () => {
    const csv = L.buildExport("csv", ROWS, { now: NOW });
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.deepEqual(csv.slice(1).trim().split("\r\n"), ["Game,Key,Paid", '"Hades, ""the"" game","AAAAA-BBBBB-CCCCC",3', '"Żółć | ゲーム","GOG-KEY-0001",3']);
    assert.match(L.buildExport("csv", ROWS, { now: NOW, extraColumns: true }), /Game,Key,Paid,Order,Order date,Platform\r\n.*"FAN-1","Nov 3, 2026","Steam"\r\n.*"Other"/s);
    const json = JSON.parse(L.buildExport("json", ROWS, { now: NOW, extraColumns: true }));
    assert.deepEqual([json.count, json.keys[1].platform, json.keys[0].order], [2, "Other", "FAN-1"]);
    assert.equal("order" in JSON.parse(L.buildExport("json", ROWS, { now: NOW })).keys[0], false);
    assert.match(L.buildExport("md", ROWS, { now: NOW }), /\| Żółć \\\| ゲーム \| `GOG-KEY-0001` \| 3 \|/);
    const html = L.buildExport("html", [{ title: "<b>x</b>", key: "K-1" }], { now: NOW });
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;") && !html.includes("<b>x</b>"));
    assert.match(L.buildExport("txt", ROWS, { now: NOW, version: "9.9" }), /Version: 9\.9[\s\S]*Games Exported: 2/);
    assert.equal(L.buildExport("nope", ROWS), null);
    assert.equal(L.clipboardText(ROWS, "{platform}: {key}"), "Steam: AAAAA-BBBBB-CCCCC\nOther: GOG-KEY-0001");
});

// Reads a stored (uncompressed) zip back: every entry's name, bytes and whether its checksum is right.
function unzip(bytes) {
    const buf = Buffer.from(bytes), out = {};
    const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
    let at = buf.readUInt32LE(end + 16);
    for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
        assert.equal(buf.readUInt32LE(at), 0x02014b50);
        const size = buf.readUInt32LE(at + 24), nameLen = buf.readUInt16LE(at + 28), local = buf.readUInt32LE(at + 42), name = buf.toString("utf8", at + 46, at + 46 + nameLen);
        const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), data = buf.subarray(dataAt, dataAt + size);
        assert.equal(zlib.crc32 ? zlib.crc32(data) : L.crc32(data), buf.readUInt32LE(at + 16), `checksum of ${name}`);
        out[name] = data.toString("utf8");
        at += 46 + nameLen;
    }
    return out;
}

test("excel: the workbook is a valid zip with one sheet, bold headings, numbers as numbers and awkward text kept safe", () => {
    const files = unzip(L.xlsxExport([{ title: 'A & B <"c">', key: "AAAAA-BBBBB-CCCCC", paid: 2.5 }, { title: "ゲーム\u0001", key: "X-1" }], { now: NOW, extraColumns: true }));
    assert.deepEqual(Object.keys(files).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const sheet = files["xl/worksheets/sheet1.xml"];
    assert.match(sheet, /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Game<\/t>/);
    assert.match(sheet, /A &amp; B &lt;&quot;c&quot;&gt;/);
    assert.match(sheet, /<c r="C2"><v>2\.5<\/v><\/c>/);
    assert.ok(sheet.includes("ゲーム") && !sheet.includes("\u0001"));
    assert.match(sheet, /<c r="G1"[^>]*><is><t[^>]*>Export date/);
    assert.equal(L.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("the list of keys from every order: new keys are added once, details fill in, order is newest first", () => {
    const ledger = {};
    assert.equal(L.mergeLedger(ledger, [{ title: "Hades", key: "K-1", order: "A", date: "d", paid: 2 }], { now: new Date("2026-01-01") }), true);
    assert.equal(L.mergeLedger(ledger, [{ title: "Hades", key: "K-1", order: "A", date: "d", paid: 2 }], { now: new Date("2026-02-01") }), false, "the same key again changes nothing");
    assert.equal(L.mergeLedger(ledger, [{ title: "Celeste", key: "K-2" }, { title: "", key: " " }], { store: "humble", now: new Date("2026-03-01") }), true);
    assert.deepEqual(L.ledgerRows(ledger).map(r => [r.title, r.key, r.order, r.paid ?? null]), [["Celeste", "K-2", "", null], ["Hades", "K-1", "A", 2]]);
    assert.equal(ledger["K-2"].store, "humble");
});
