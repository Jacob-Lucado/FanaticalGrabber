// Price check on other shops' game pages (Humble, GOG, Epic, Green Man Gaming).
// Only the game's title goes to Steam Value Checker, with your link code. Nothing else leaves the page.
(() => {
    if (window.__fgStores) return; window.__fgStores = true;
    const send = m => new Promise(r => { try { chrome.runtime.sendMessage(m, x => r(chrome.runtime.lastError ? null : x)); } catch { r(null); } });
    const HOST = location.hostname.replace(/^www\./, "");
    const THIS_SHOP = /humblebundle/.test(HOST) ? "humble" : /gog\.com/.test(HOST) ? "gog" : /epicgames/.test(HOST) ? "epic" : /greenmangaming/.test(HOST) ? "green man" : "";
    const GAME_PAGE = [/humblebundle\.com\/store\/[^/?#]+/, /gog\.com\/(?:[a-z-]+\/)?game\/[^/?#]+/, /epicgames\.com\/(?:[a-z-]+\/)?p\/[^/?#]+/, /greenmangaming\.com\/(?:[a-z-]+\/)?games\/[^/?#]+/];
    const onGamePage = () => GAME_PAGE.some(re => re.test(location.href));
    const onBundlePage = () => /humblebundle\.com\/games\/[^/?#]+/.test(location.href);
    const parseMoney = t => { const m = /([$\u20ac\u00a3])\s?(\d[\d.,]*)/.exec(String(t ?? "")); if (!m) return null; const n = Number(m[2].replace(/,(\d{2})$/, ".$1").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
    // The games in a bundle: the item names in its tiers. Priced from the tier headings; the top tier is the whole bundle.
    const bundleTitles = () => {
        const seen = new Set();
        for (const e of document.querySelectorAll('[class*="item-title"],[class*="tier-item"] h2,[class*="tier-item"] h3,[class*="tier-item-title"],[class*="game-box"] [class*="title"]')) {
            const t = clean(e.textContent); if (t && t.length < 90 && !parseMoney(t)) seen.add(t);
        }
        return [...seen].slice(0, 30);
    };
    const bundlePrice = () => {
        const all = [...document.querySelectorAll('[class*="tier"] [class*="price"],[class*="tier-price"],[class*="price-button"],[class*="add-to-cart"],button')].map(e => clean(e.textContent)).filter(t => /(pay|\$|\u20ac|\u00a3)/i.test(t)).map(parseMoney).filter(n => n != null && n > 0);
        return all.length ? Math.max(...all) : null;
    };

    const clean = t => String(t ?? "").replace(/\s+/g, " ").trim();
    // The title is the page's own heading; the share tag is the fallback with the store's name stripped off the end.
    const readTitle = () => {
        const og = clean(document.querySelector('meta[property="og:title"]')?.content)
            .replace(/\s*[|–—-]\s*(download|buy|get|play|epic games|gog|humble|green man|pc|steam).*$/i, "")
            .replace(/\s+(on|for)\s+(gog\.com|humble store|epic games store|green man gaming|pc).*$/i, "");
        const h1 = clean(document.querySelector("h1")?.textContent);
        const t = h1 && h1.length < 100 ? h1 : og;
        return t && t.length >= 2 && t.length < 100 ? t : "";
    };

    let host = null, root = null, lastKey = "";
    const SK = s => (window.__fgSkin ? window.__fgSkin(s, "navy") : s);
    const css = `
      :host { all: initial; }
      .card { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; width: 290px; max-width: calc(100vw - 36px); max-height: calc(100vh - 36px); overflow: auto; padding: 14px 16px; box-sizing: border-box; font: 14px/1.4 system-ui, sans-serif; color: #e8eefc; background: #0f1623; border: 1px solid #25324a; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
      h4 { margin: 0 0 8px; color: #8da2c8; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em; }
      .x { float: right; background: none; border: 0; color: #8da2c8; cursor: pointer; font-size: 16px; line-height: 1; }
      .big { font-size: 15px; font-weight: 700; margin: 2px 0 6px; }
      .good { color: #3ddc97; } .warn { color: #ffb84d; }
      .shop { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px solid #1c2740; }
      .shop.here b { color: #4da3ff; } .shop a { color: inherit; text-decoration: none; } .shop a:hover { text-decoration: underline; }
      .muted { color: #8da2c8; font-size: 12px; margin-top: 8px; }
      .tag { display: inline-block; margin: 0 4px 6px 0; padding: 2px 9px; font-size: 11px; font-weight: 700; border-radius: 999px; color: #4da3ff; background: rgba(77,163,255,.18); }
      button.go { margin-top: 8px; padding: 5px 10px; font: inherit; font-size: 12px; color: #e8eefc; background: #1a2740; border: 1px solid #2d3f61; border-radius: 8px; cursor: pointer; }
    `;
    const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(k => k != null)); return n; };
    const money = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(n); } catch { return String(n); } };

    // Not linked with Steam Value Checker yet: say what linking adds, with a button that opens the dashboard. Hidden for a week once dismissed.
    const DASH = "https://steamvaluechecker.com/#/connect";
    async function linkNote(bad) {
        try {
            const v = await chrome.storage.local.get(["svcToken", "linkHintHidden"]);
            if (!bad && v.svcToken) return null;
            if (Date.now() - (v.linkHintHidden || 0) < 7 * 86400_000) return null;
        } catch { return null; }
        const a = el("a", { href: DASH, target: "_blank", rel: "noopener noreferrer", textContent: "Link now" });
        a.style.cssText = SK("display:inline-block;margin-top:6px;padding:5px 12px;border-radius:999px;font-weight:650;font-size:12px;color:#fff;text-decoration:none;background:linear-gradient(90deg,#4da3ff,#7c6cff)");
        const hide = el("button", { textContent: "Not now" });
        hide.style.cssText = "margin-left:8px;background:none;border:0;color:#8da2c8;font:inherit;font-size:12px;cursor:pointer";
        const box = el("div", { className: "muted linknote" }, el("b", { textContent: bad ? "Your link stopped working. " : "Get more out of this. " }), bad ? "Link again to switch your prices, bundle checks and wishlist back on." : "Link with Steam Value Checker (free) to see prices from every store, whether you own a game, wishlist sales and more.", el("br"), a, hide);
        box.style.cssText = SK("margin-top:10px;padding-top:8px;border-top:1px solid #25324a");
        hide.addEventListener("click", async () => { try { await chrome.storage.local.set({ linkHintHidden: Date.now() }); } catch { /* ignore */ } box.remove(); });
        return box;
    }
    function mount() {
        if (host?.isConnected) return;
        host = el("div"); host.id = "fg-stores-card";
        const shadow = host.attachShadow({ mode: "open" });
        shadow.append(el("style", { textContent: SK(css) })); root = el("div"); shadow.append(root);
        document.documentElement.append(host);
    }
    const unmount = () => { host?.remove(); host = null; root = null; };
    const show = (...kids) => { mount(); const x = el("button", { className: "x", textContent: "×", title: "Close" }); x.addEventListener("click", unmount); root.replaceChildren(el("div", { className: "card" }, x, ...kids)); };

    function render(title, data, regions) {
        const it = data?.items?.[0];
        if (!it?.found) return show(el("h4", { textContent: "Price check" }), el("div", { className: "muted", textContent: "Steam Value Checker couldn't match this game." }));
        const here = it.shops.find(s => s.shop.toLowerCase().includes(THIS_SHOP));
        const best = it.shops[0];
        const kids = [el("h4", { textContent: "Steam Value Checker" })];
        if (it.owned) kids.push(el("span", { className: "tag", textContent: "You own this" }));
        if (it.wishlisted) kids.push(el("span", { className: "tag", textContent: "On your wishlist" }));
        if (here && best && best.shop !== here.shop && best.price < here.price - 0.005) kids.push(el("div", { className: "big good", textContent: `Cheaper at ${best.shop}: ${money(best.price, it.currency)}` }), el("div", { className: "muted", textContent: `Save ${money(here.price - best.price, it.currency)} vs ${here.shop}` }));
        else if (here && best && best.shop === here.shop) kids.push(el("div", { className: "big good", textContent: "Best price right now" }));
        else if (best) kids.push(el("div", { className: "big", textContent: `Lowest: ${best.shop} ${money(best.price, it.currency)}` }));
        for (const s of it.shops.slice(0, 4)) {
            const label = el("span", { textContent: s.shop });
            const row = el("div", { className: "shop" + (THIS_SHOP && s.shop.toLowerCase().includes(THIS_SHOP) ? " here" : "") }, s.url ? el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, label) : label, el("b", { textContent: money(s.price, it.currency) }));
            kids.push(row);
        }
        if (it.atl != null) kids.push(el("div", { className: "muted", textContent: `All-time low ${money(it.atl, it.currency)}` + (it.low1y != null ? ` · past year ${money(it.low1y, it.currency)}` : "") }));
        if (it.approx) kids.push(el("div", { className: "muted", textContent: `Matched as "${it.matched}". Check it's the right edition.` }));
        if (regions?.length) kids.push(el("div", { className: "muted", textContent: "Other regions (for comparing only): " + regions.map(r => `${r.cc} ${money(r.price, r.currency)}`).join(" · ") }));
        else { const b = el("button", { className: "go", textContent: "Compare regions" }); b.addEventListener("click", async () => { b.disabled = true; const r = await send({ type: "compare", titles: [title], regions: ["US", "GB", "DE", "CA", "AU"] }); render(title, data, r?.regions ?? []); }); kids.push(b); }
        show(...kids);
    }

    async function runBundle() {
        let list = bundleTitles();
        for (let n = 0; list.length < 2 && n < 10; n++) { await new Promise(r => setTimeout(r, 500)); list = bundleTitles(); }
        if (list.length < 2) return;
        const price = bundlePrice();
        const r = await send({ type: "compare", titles: list });
        if (!r || r.status === "network" || r.status === "error") return;
        if (r.status === "no_code" || r.status === "bad_code") { const n = await linkNote(r.status === "bad_code"); return show(el("h4", { textContent: "Bundle check" }), el("div", { className: "muted", textContent: "See what this bundle is really worth once you link with Steam Value Checker." }), n ?? el("div")); }
        const found = r.items.filter(i => i.found && i.best), fresh = found.filter(i => !i.owned), have = found.filter(i => i.owned);
        const cur = found[0]?.currency;
        const retail = fresh.reduce((a, i) => a + i.best.price, 0), wishRetail = fresh.filter(i => i.wishlisted).reduce((a, i) => a + i.best.price, 0);
        const kids = [el("h4", { textContent: "Bundle check" })];
        if (!fresh.length) { kids.push(el("div", { className: "big warn", textContent: "You own everything here" })); return show(...kids); }
        if (price) {
            const ratio = price / retail;
            kids.push(el("div", { className: "big " + (ratio < 0.7 ? "good" : ratio <= 1 ? "" : "warn"), textContent: ratio < 0.7 ? `Worth it: about ${Math.round((1 - ratio) * 100)}% under buying them separately` : ratio <= 1 ? "Fair: close to the separate prices" : "Skip it: cheaper to buy them one by one" }));
        }
        kids.push(el("div", { className: "shop" }, el("span", { textContent: `${fresh.length} game${fresh.length === 1 ? "" : "s"} you don't own, cheapest prices` }), el("b", { textContent: money(retail, cur) })));
        if (price) kids.push(el("div", { className: "shop" }, el("span", { textContent: "Top tier price" }), el("b", { textContent: money(price, cur) })), el("div", { className: "shop" }, el("span", { textContent: "Per new game" }), el("b", { textContent: money(price / fresh.length, cur) })));
        if (wishRetail) kids.push(el("div", { className: "muted", textContent: `${fresh.filter(i => i.wishlisted).length} on your wishlist, worth ${money(wishRetail, cur)}.` }));
        if (have.length) kids.push(el("div", { className: "muted", textContent: `You already own ${have.length}: ${have.slice(0, 3).map(i => i.title).join(", ")}${have.length > 3 ? " and more" : ""}.` }));
        if (found.length < list.length) kids.push(el("div", { className: "muted", textContent: `${found.length} of ${list.length} games matched.` }));
        show(...kids);
    }

    async function run() {
        if (onBundlePage()) { const key = "b|" + location.pathname; if (key === lastKey) return; lastKey = key; return runBundle(); }
        if (!onGamePage()) { lastKey = ""; unmount(); return; }
        const title = readTitle(); if (!title) return;
        const key = location.pathname + "|" + title; if (key === lastKey) return; lastKey = key;
        const r = await send({ type: "compare", titles: [title] });
        if (key !== lastKey) return; // the page moved on while we waited
        if (!r || r.status === "network" || r.status === "error") return;
        if (r.status === "no_code" || r.status === "bad_code") { const n = await linkNote(r.status === "bad_code"); return show(el("h4", { textContent: "Price check" }), r.status === "no_code" ? el("div", { className: "muted", textContent: "Prices from every store, right here, once you link with Steam Value Checker." }) : null, n ?? el("div")); }
        render(title, r, []);
    }
    // These shops are single-page apps, so the address changes without a reload.
    run(); setInterval(run, 1500);
})();
