// Fanatical bundle and cart check: compares what you would pay with Steam's own prices and says whether it is worth buying.
// Only game titles go to Steam and your link code to Steam Value Checker. Nothing else is recommended or linked.
(() => {
    const send = m => new Promise(r => { try { chrome.runtime.sendMessage(m, x => r(chrome.runtime.lastError ? null : x)); } catch { r(null); } });
    // Fanatical is a single-page app: the address changes without a reload, so the page type is re-read on every run.
    let isBundle = false, isCart = false;
    const readPath = () => { const p = location.pathname; isBundle = /\/bundle\//.test(p); isCart = /\/(cart|checkout)\b/.test(p); return isBundle || isCart; };

    const CUR = { "$": ["US", "USD"], "€": ["DE", "EUR"], "£": ["GB", "GBP"] };
    const parse = t => { const m = /([$€£])\s?(\d[\d.,]*)|(\d[\d.,]*)\s?([€£])/.exec(String(t ?? "")); if (!m) return null; const sym = m[1] || m[4], raw = m[2] || m[3]; const n = Number(/,\d{1,2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? { n, sym } : null; };
    const clean = t => String(t ?? "").replace(/\s+/g, " ").trim();
    const fmt = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n); } catch { return n.toFixed(2); } };

    const titles = () => {
        if (isCart) { const c = cartTitles(); if (c.length) return c; }
        const sel = '[class*="card-title"],[class*="game-name"],[class*="product-name"],[class*="item-name"],[class*="cart-item"] h2,[class*="cart-item"] h3,[class*="cart-item"] h4,[class*="game-card"] h3,[class*="hitCard"] h3';
        const seen = new Set();
        for (const e of document.querySelectorAll(sel)) {
            const t = clean(e.textContent);
            if (t && t.length < 90 && !parse(t) && !/^(bundle|add to cart|remove)/i.test(t)) seen.add(t);
        }
        return [...seen];
    };
    // Cart rows: find each "STEAM" platform badge, climb to its row (it has a picture and a price), and take the first line of
    // text that is not a price, a percent, or a platform name. This does not depend on Fanatical's class names.
    const cartTitles = () => {
        const out = new Set();
        const badges = [...document.querySelectorAll("main *, #root *, body *")].filter(e => e.children.length <= 1 && /^\s*steam\s*$/i.test(e.textContent || "") && e.offsetParent !== null);
        for (const b of badges) {
            let row = b;
            for (let i = 0; i < 7 && row.parentElement; i++) { row = row.parentElement; if (row.querySelector("img") && parse(row.textContent) && row.querySelectorAll("img").length <= 6) break; }
            const lines = [...row.querySelectorAll("*")].filter(e => !e.children.length).map(e => clean(e.textContent)).filter(Boolean);
            const t = lines.find(x => x.length > 2 && x.length < 90 && !parse(x) && !/^-?\d+%$/.test(x) && !/^(steam|windows|mac|linux|add|remove|edit|exclusive offer)$/i.test(x));
            if (t) out.add(t);
        }
        return [...out];
    };
    const priceOf = () => {
        if (isCart) {
            const m = /\btotal\b[^\n$€£\d]{0,12}([$€£]\s?\d[\d.,]*|\d[\d.,]*\s?[€£])/i.exec(document.body.innerText || "");
            if (m) { const p = parse(m[1]); if (p) return p; }
            const els = [...document.querySelectorAll('[class*="total"]')].filter(e => parse(e.textContent) && !/save|discount|you save/i.test(e.textContent));
            const last = els[els.length - 1];
            return last ? parse(last.textContent) : null;
        }
        const all = [...document.querySelectorAll('[class*="price"]')].map(e => parse(e.textContent)).filter(Boolean);
        return all.length ? all.reduce((a, b) => (b.n > a.n ? b : a)) : null; // the top tier, i.e. the whole bundle
    };

    let card;
    const show = (title, lines, tone) => {
        card?.remove();
        card = document.createElement("div");
        const sh = card.attachShadow({ mode: "open" });
        const color = tone === "ok" ? "#2e8b57" : tone === "bad" ? "#c0392b" : "#555";
        sh.innerHTML = `<style>.c{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:300px;font:13px/1.45 system-ui,sans-serif;background:#16181d;color:#e8e8ea;border:1px solid #333;border-left:4px solid ${color};border-radius:10px;padding:12px 14px;box-shadow:0 6px 24px #0008}h4{margin:0 0 6px;font-size:14px}.l{margin:3px 0}.x{position:absolute;top:4px;right:8px;background:none;border:0;color:#aaa;font-size:18px;cursor:pointer}</style><div class="c"><button class="x" aria-label="Close">×</button><h4></h4></div>`;
        sh.querySelector("h4").textContent = title;
        for (const l of lines) { const d = document.createElement("div"); d.className = "l"; d.textContent = l; sh.querySelector(".c").append(d); }
        sh.querySelector(".x").addEventListener("click", () => card.remove());
        document.documentElement.append(card);
    };

    async function run() {
        card?.remove();
        if (!readPath()) return;
        let list = titles();
        for (let n = 0; list.length < (isBundle ? 2 : 1) && n < 16; n++) { await new Promise(r => setTimeout(r, 500)); list = titles(); }
        if (!list.length) { if (isCart) show("Cart check", ["I could not read the games in this cart. Reload the page once it has fully loaded."], ""); return; }
        const price = priceOf();
        if (!price || !CUR[price.sym]) { if (isCart) show("Cart check", ["I found the games but could not read the total."], ""); return; }
        const [cc, cur] = CUR[price.sym];
        const [ids, owned] = await Promise.all([send({ type: "title-appids", titles: list }), send({ type: "owned-apps" })]);
        if (!ids?.ids) { if (isCart) show("Cart check", ["Could not look the games up on Steam right now."], ""); return; }
        const mine = new Set(owned?.apps || []);
        const found = list.map(t => ({ t, id: ids.ids[t] })).filter(x => x.id);
        if (!found.length) { if (isCart) show("Cart check", ["None of these games matched a Steam page, so I can't compare prices."], ""); return; }
        const have = found.filter(x => mine.has(x.id)), fresh = found.filter(x => !mine.has(x.id));
        const lines = [];
        if (have.length) lines.push(`You already own ${have.length}: ${have.slice(0, 4).map(x => x.t).join(", ")}${have.length > 4 ? " and more" : ""}.`);
        if (!fresh.length) { show(isCart ? "Cart check" : "Bundle check", [...lines, "You own everything here, so it is not worth buying."], "bad"); return; }
        const pr = await send({ type: "prices-for", appids: fresh.map(x => x.id), cc });
        if (pr?.status === "no_code") { show("Price check", ["Add your Steam Value Checker link code (in the Steam page's batch redeem panel) to compare with Steam prices."], ""); return; }
        if (pr?.status !== "ok") { if (isCart) show("Cart check", ["Could not get Steam prices right now."], ""); return; }
        const priced = pr.items.filter(i => i.steam > 0);
        if (!priced.length) { if (isCart) show("Cart check", [...lines, "Steam shows no price for these games, so there is nothing to compare with."], ""); return; }
        const steamTotal = priced.reduce((a, i) => a + i.steam, 0);
        const missing = found.length < list.length ? ` (${found.length} of ${list.length} games matched on Steam)` : "";
        lines.push(`Steam price for the ${priced.length} game${priced.length === 1 ? "" : "s"} you don't own: ${fmt(steamTotal, pr.items[0].currency || cur)}${missing}.`);
        lines.push(`${isCart ? "Your total" : "Full bundle"}: ${fmt(price.n, cur)}.`);
        const ratio = price.n / steamTotal;
        const worth = ratio < 0.9;
        lines.push(worth ? `👍 Worth it: about ${Math.round((1 - ratio) * 100)}% under Steam.` : ratio <= 1.05 ? "👎 Not really worth it: about the same as Steam." : `👎 Not worth it: costs more than Steam.`);
        if (worth && isCart) lines.push("You're seeing the best deals available.");
        show(isCart ? "Cart check" : "Bundle check", lines, worth ? "ok" : "bad");
    }
    let last = "", timer;
    const watch = () => { const key = location.pathname; if (key === last) return; last = key; clearTimeout(timer); timer = setTimeout(() => run().catch(() => {}), 800); };
    watch(); setInterval(watch, 1000);
})();
