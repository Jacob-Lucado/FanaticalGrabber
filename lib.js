// Helpers shared by the Fanatical and Humble panels and the options page: export builders, a small Excel writer,
// file naming and reveal-button matching. Nothing here touches the page, so the tests run it in plain Node.
(root => {
    "use strict";

    const STEAM_KEY_RE = /^[A-Z0-9]{5}(-[A-Z0-9]{5}){2}$/i; // Steam keys are 5-5-5

    const DEFAULTS = {
        revealDelayMs: 150,      // pause between Reveal Key clicks
        redeemDelayMs: 3000,     // pause between keys sent to Steam
        fileName: "FanaticalGrabber_{date}", // {date} {time} {order} {count}
        clipboardFormat: "{title} | {key}",  // {title} {key} {order} {platform}
        extraColumns: false,     // Order, Order date and Platform columns in exports
        revealLabel: ""          // the Reveal Key button's text, for a Fanatical language the extension doesn't know
    };
    const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    /** Saved options with anything missing or out of range put back to its default. */
    function cleanOptions(o = {}) {
        const text = (v, d, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);
        return {
            revealDelayMs: clampInt(o.revealDelayMs, 50, 2000, DEFAULTS.revealDelayMs),
            redeemDelayMs: clampInt(o.redeemDelayMs, 3000, 30000, DEFAULTS.redeemDelayMs), // never faster than 3 seconds: Steam blocks quick redeems
            fileName: text(o.fileName, DEFAULTS.fileName, 80),
            clipboardFormat: text(o.clipboardFormat, DEFAULTS.clipboardFormat, 120),
            extraColumns: Boolean(o.extraColumns),
            revealLabel: typeof o.revealLabel === "string" ? o.revealLabel.trim().slice(0, 60) : ""
        };
    }

    // "Reveal Key" in the languages Fanatical offers. Anything else can be typed into the options page.
    const REVEAL_LABELS = ["reveal key", "reveal keys", "key anzeigen", "schlüssel anzeigen", "key aufdecken", "révéler la clé", "afficher la clé", "revelar clave", "mostrar clave", "revelar chave", "mostrar chave",
        "rivela chiave", "mostra chiave", "sleutel onthullen", "toon sleutel", "pokaż klucz", "odkryj klucz", "показать ключ", "anahtarı göster", "キーを表示", "显示密钥", "顯示金鑰", "키 보기"];
    const squash = s => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    /** Is this a Reveal Key button's text? `extra` is the label from the options page. */
    const isRevealLabel = (text, extra = "") => { const t = squash(text); return Boolean(t) && (REVEAL_LABELS.includes(t) || (Boolean(squash(extra)) && t === squash(extra))); };

    function parseAmount(text) {
        const m = String(text ?? "").match(/[$€£]\s?(\d[\d.,]*)/);
        if (!m) return null;
        const raw = /,\d{1,2}$/.test(m[1]) ? m[1].replace(/\./g, "").replace(",", ".") : m[1].replace(/,/g, "");
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }

    const platformOf = key => (STEAM_KEY_RE.test(String(key ?? "").trim()) ? "Steam" : "Other");
    const pad = n => String(n).padStart(2, "0");
    /** File name (no extension) from the pattern on the options page. Characters a file name can't hold are dropped. */
    function fileName(pattern, { now = new Date(), order = "", count = 0 } = {}) {
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
        const out = String(pattern || DEFAULTS.fileName).replace(/\{date\}/g, date).replace(/\{time\}/g, time).replace(/\{order\}/g, order || "order").replace(/\{count\}/g, String(count))
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
        return out || `FanaticalGrabber_${date}`;
    }
    const clipboardText = (rows, format) => rows.map(r => String(format || DEFAULTS.clipboardFormat)
        .replace(/\{title\}/g, r.title).replace(/\{key\}/g, r.key).replace(/\{order\}/g, r.order ?? "").replace(/\{platform\}/g, platformOf(r.key))).join("\n");

    const csvCell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const mdCell = v => String(v ?? "").replace(/\|/g, "\\|");
    const htmlEsc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /** The table every format is built from: a header row, then one row per key. */
    function table(rows, { extraColumns = false } = {}) {
        const paid = rows.some(r => r.paid != null);
        const head = ["Game", "Key", ...(paid ? ["Paid"] : []), ...(extraColumns ? ["Order", "Order date", "Platform"] : [])];
        const body = rows.map(r => [r.title, r.key, ...(paid ? [r.paid ?? ""] : []), ...(extraColumns ? [r.order ?? "", r.date ?? "", platformOf(r.key)] : [])]);
        return { head, body };
    }

    const FORMATS = [
        { id: "txt", label: "Text (.txt)", ext: "txt", mime: "text/plain",
            build: (rows, o) => ["FanaticalGrabber", "© 2026 Jacob Lucado", `Version: ${o.version}`, "", `${o.store} Key Export Report`, "", `Export Date: ${o.now.toLocaleString()}`, "",
                "========================================", "",
                ...rows.map(r => `${r.title} | ${r.key}` + (o.extraColumns && r.order ? ` | order ${r.order}` : "")),
                "", "========================================", "", `Games Exported: ${rows.length}`, "", "Created By: Jacob Lucado", "Follow: https://x.com/twit_user69", ""].join("\n") },
        { id: "csv", label: "CSV (.csv)", ext: "csv", mime: "text/csv", // BOM so Excel reads UTF-8 titles correctly
            build: (rows, o) => { const t = table(rows, o); return "﻿" + [t.head.join(","), ...t.body.map(r => r.map((c, i) => (t.head[i] === "Paid" ? c : csvCell(c))).join(","))].join("\r\n") + "\r\n"; } },
        { id: "json", label: "JSON (.json)", ext: "json", mime: "application/json",
            build: (rows, o) => JSON.stringify({ exportedAt: o.now.toISOString(), count: rows.length,
                keys: rows.map(r => ({ game: r.title, key: r.key, ...(r.paid != null ? { paid: r.paid } : {}), ...(o.extraColumns ? { order: r.order ?? null, orderDate: r.date ?? null, platform: platformOf(r.key) } : {}) })) }, null, 2) },
        { id: "md", label: "Markdown (.md)", ext: "md", mime: "text/markdown",
            build: (rows, o) => { const t = table(rows, o); return [`# ${o.store} Keys`, "", `Exported ${o.now.toLocaleString()} — ${rows.length} keys`, "",
                `| ${t.head.join(" | ")} |`, `| ${t.head.map(() => "---").join(" | ")} |`, ...t.body.map(r => `| ${r.map((c, i) => (t.head[i] === "Key" ? `\`${c}\`` : mdCell(c))).join(" | ")} |`), ""].join("\n"); } },
        { id: "html", label: "HTML page (.html)", ext: "html", mime: "text/html",
            build: (rows, o) => { const t = table(rows, o); return `<!doctype html>
<html><head><meta charset="utf-8"><title>${htmlEsc(o.store)} Keys</title>
<style>body{font-family:Segoe UI,sans-serif;margin:2rem}table{border-collapse:collapse}
td,th{border:1px solid #ccc;padding:6px 12px;text-align:left}code{font-size:1.05em}</style></head>
<body><h1>${htmlEsc(o.store)} Keys</h1><p>Exported ${htmlEsc(o.now.toLocaleString())} — ${rows.length} keys</p>
<table><tr>${t.head.map(c => `<th>${htmlEsc(c)}</th>`).join("")}</tr>
${t.body.map(r => `<tr>${r.map((c, i) => `<td>${t.head[i] === "Key" ? `<code>${htmlEsc(c)}</code>` : htmlEsc(c)}</td>`).join("")}</tr>`).join("\n")}
</table></body></html>`; } }
    ];
    /** One export as text. `opts`: { version, store, now, extraColumns }. Returns null for a format it doesn't know. */
    function buildExport(id, rows, opts = {}) {
        const f = FORMATS.find(x => x.id === id);
        return f ? f.build(rows, { version: "", store: "Fanatical", now: new Date(), extraColumns: false, ...opts }) : null;
    }

    // ---------- Excel (.xlsx) ----------
    // A workbook is a zip of a few small XML files. Writing one sheet of text and numbers needs no library:
    // the files are stored uncompressed, which every spreadsheet app opens.
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = bytes => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const utf8 = s => new TextEncoder().encode(s);
    function zipStore(files) {
        const parts = [], central = []; let offset = 0;
        const u16 = n => [n & 0xff, (n >>> 8) & 0xff], u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
        for (const f of files) {
            const name = utf8(f.name), data = f.data, crc = crc32(data);
            const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]; // 0x0800: names are UTF-8
            const local = new Uint8Array([0x50, 0x4b, 3, 4, ...common]);
            parts.push(local, name, data);
            central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
            offset += local.length + name.length + data.length;
        }
        const size = central.reduce((n, p) => n + p.length, 0);
        const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
        const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
        let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
        return out;
    }
    const xmlEsc = v => String(v ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    const colName = i => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
    /** The bytes of an .xlsx file with one sheet. `head` is the first (bold) row; numbers stay numbers, everything else is text. */
    function xlsxBytes(head, body, { sheet = "Keys", widths = [] } = {}) {
        const cell = (v, r, c, bold) => (typeof v === "number" && Number.isFinite(v)
            ? `<c r="${colName(c)}${r}"${bold ? ' s="1"' : ""}><v>${v}</v></c>`
            : `<c r="${colName(c)}${r}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`);
        const rows = [head, ...body].map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r + 1, c, r === 0)).join("")}</row>`).join("");
        const cols = head.map((_h, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i] ?? 22}" customWidth="1"/>`).join("");
        const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
        const files = [
            ["[Content_Types].xml", `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
            ["_rels/.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
            ["xl/workbook.xml", `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheet).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
            ["xl/_rels/workbook.xml.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
            ["xl/styles.xml", `${X}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
            ["xl/worksheets/sheet1.xml", `${X}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`]
        ];
        return zipStore(files.map(([name, text]) => ({ name, data: utf8(text) })));
    }
    /** The Excel export of a key list. */
    function xlsxExport(rows, opts = {}) {
        const now = opts.now ?? new Date(), t = table(rows, opts);
        const head = [...t.head, "Export date"], body = t.body.map(r => [...r, now.toLocaleString()]);
        return xlsxBytes(head, body, { widths: head.map(h => (h === "Game" ? 50 : h === "Key" ? 30 : h === "Export date" ? 25 : 16)) });
    }

    /** Adds revealed keys to the everything-I've-revealed list. Returns true when something was new or better filled in. */
    function mergeLedger(ledger, rows, { store = "fanatical", now = new Date() } = {}) {
        let changed = false;
        for (const r of rows) {
            const k = String(r.key ?? "").trim(); if (!k) continue;
            const old = ledger[k];
            const next = { title: r.title || old?.title || "Unknown", store: old?.store ?? store, order: r.order || old?.order || "", date: r.date || old?.date || "", paid: r.paid ?? old?.paid ?? null, at: old?.at ?? now.toISOString() };
            if (!old || JSON.stringify(old) !== JSON.stringify(next)) { ledger[k] = next; changed = true; }
        }
        return changed;
    }
    /** The list as export rows, newest order first. */
    const ledgerRows = ledger => Object.entries(ledger ?? {}).map(([key, v]) => ({ key, title: v.title, order: v.order || "", date: v.date || "", ...(v.paid != null ? { paid: v.paid } : {}), at: v.at || "" }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.title.localeCompare(b.title));

    const api = { STEAM_KEY_RE, DEFAULTS, cleanOptions, REVEAL_LABELS, isRevealLabel, parseAmount, platformOf, fileName, clipboardText, table, FORMATS, buildExport, crc32, zipStore, xlsxBytes, xlsxExport, mergeLedger, ledgerRows };
    root.FGLib = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
