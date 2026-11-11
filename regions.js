// Region check for Fanatical game and bundle pages. Fanatical makes you pick each country in its "Check Regions" box one at a time.
// This reads the same list the page uses (one request to Fanatical's own product data) and shows every country at once.
// Nothing is sent anywhere else.
(() => {
    if (window.__fgRegions) return; window.__fgRegions = true;
    const PAGE = /^\/([a-z]{2}(?:-[A-Za-z]{2})?)\/(game|bundle|pick-and-mix)\/([^/?#]+)/;

    /** The countries Fanatical's own "Check Regions" box lists (239), with plain English names. Anything a game lists beyond these is added. */
    const CODES = "AF,AX,DZ,AS,AD,AO,AI,AQ,AG,AR,AM,AW,AU,AT,AZ,BS,BD,BB,BE,BZ,BJ,BM,BT,BO,BQ,BA,BW,BV,BR,IO,BN,BG,BF,BI,KH,CM,CA,CV,KY,CF,TD,CL,CN,CX,CC,CO,KM,CG,CD,CK,CR,CI,HR,CW,CY,CZ,DK,DJ,DM,DO,EC,EG,SV,GQ,ER,EE,ET,FK,FO,FJ,FI,FR,GF,PF,TF,GA,GM,GE,DE,GH,GI,GR,GL,GD,GP,GU,GT,GG,GN,GW,GY,HT,HM,VA,HN,HK,HU,IS,IN,ID,IR,IQ,IE,IL,IT,JM,JP,JE,JO,KZ,KI,KR,KW,KG,LA,LV,LB,LS,LR,LY,LI,LT,LU,MO,MG,MW,MY,MV,ML,MT,MH,MQ,MR,MU,YT,MX,FM,MN,ME,MS,MA,MZ,MM,NA,NR,NP,NL,AN,NC,NZ,NI,NE,NG,NU,NF,MK,MP,NO,OM,PK,PW,PS,PA,PG,PE,PH,PN,PL,PT,PR,QA,XK,RE,RO,RW,BL,SH,KN,LC,MF,PM,VC,WS,SM,ST,SA,SN,RS,SC,SL,SG,SX,SK,SI,SB,SO,ZA,GS,SS,ES,LK,SD,SR,SJ,SZ,SE,CH,TW,TJ,TZ,TH,TL,TG,TK,TO,TT,TN,TR,TM,TC,TV,UG,UA,AE,GB,US,UM,UY,UZ,VU,VE,VN,VG,VI,WF,EH,YE,ZM,ZW".split(",");
    function allCountries(extra = []) {
        const names = new Intl.DisplayNames(["en"], { type: "region" }), out = new Map();
        const add = (code, fallback) => { let n = fallback; try { n = names.of(code) || fallback; } catch { /* use the given name */ } if (n && n !== code && !/^Unknown/i.test(n)) out.set(code, n); };
        for (const c of CODES) add(c, c);
        for (const r of extra) if (r?.code && !out.has(r.code)) add(r.code, r.name);
        return out;
    }

    /** Fanatical's rule, as its own box applies it: a list of countries where it works, else a list where it does not, else everywhere. */
    function analyze(product, universe) {
        const inc = Array.isArray(product?.regions_included) ? product.regions_included : [], exc = Array.isArray(product?.regions_excluded) ? product.regions_excluded : [];
        const nameOf = (code, fallback) => universe.get(code) ?? fallback ?? code;
        let works, blocked;
        if (inc.length) {
            const ok = new Set(inc.map(r => r.code));
            works = inc.map(r => ({ code: r.code, name: r.name || nameOf(r.code) }));
            blocked = [...universe].filter(([c]) => !ok.has(c)).map(([code, name]) => ({ code, name }));
        } else if (exc.length) {
            const no = new Set(exc.map(r => r.code));
            blocked = exc.map(r => ({ code: r.code, name: r.name || nameOf(r.code) }));
            works = [...universe].filter(([c]) => !no.has(c)).map(([code, name]) => ({ code, name }));
        } else { works = [...universe].map(([code, name]) => ({ code, name })); blocked = []; }
        const by = (a, b) => a.name.localeCompare(b.name);
        works.sort(by); blocked.sort(by);
        return { global: blocked.length === 0, works, blocked };
    }
    window.__fgRegionsAnalyze = analyze; // for tests

    const css = `
      :host { all: initial; }
      .card { position: relative; width: 100%; max-height: 60vh; overflow: auto; padding: 14px 16px; box-sizing: border-box; font: 14px/1.4 system-ui, sans-serif; color: #e8eefc; background: #0f1623; border: 1px solid #25324a; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
      h4 { margin: 0 0 8px; color: #8da2c8; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em; }
      .x { float: right; background: none; border: 0; color: #8da2c8; cursor: pointer; font-size: 16px; line-height: 1; }
      .big { font-size: 16px; font-weight: 700; margin: 2px 0 6px; } .good { color: #3ddc97; } .warn { color: #ffb84d; } .bad { color: #ff6b6b; }
      .muted { color: #8da2c8; font-size: 12px; margin-top: 6px; }
      .go { padding: 7px 12px; font: inherit; font-size: 13px; font-weight: 650; color: #fff; background: linear-gradient(90deg, #4da3ff, #7c6cff); border: 0; border-radius: 999px; cursor: pointer; }
      .go:disabled { opacity: .6; cursor: default; }
      details { margin-top: 8px; } summary { cursor: pointer; font-weight: 650; }
      .list { margin-top: 6px; font-size: 12px; color: #c4d0e6; line-height: 1.55; }
      input { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 6px 9px; font: inherit; font-size: 13px; color: #e8eefc; background: #162134; border: 1px solid #2d3f61; border-radius: 8px; }
    `;
    const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(k => k != null)); return n; };
    // Not linked with Steam Value Checker yet: say what linking adds, with a button that opens the dashboard. Hidden for a week once dismissed.
    const DASH = "https://steamvaluechecker.com/#/connect";
    async function linkNote(bad) {
        try {
            const v = await chrome.storage.local.get(["svcToken", "linkHintHidden"]);
            if (!bad && v.svcToken) return null;
            if (Date.now() - (v.linkHintHidden || 0) < 7 * 86400_000) return null;
        } catch { return null; }
        const a = el("a", { href: DASH, target: "_blank", rel: "noopener noreferrer", textContent: "Link now" });
        a.style.cssText = "display:inline-block;margin-top:6px;padding:5px 12px;border-radius:999px;font-weight:650;font-size:12px;color:#fff;text-decoration:none;background:linear-gradient(90deg,#4da3ff,#7c6cff)";
        const hide = el("button", { textContent: "Not now" });
        hide.style.cssText = "margin-left:8px;background:none;border:0;color:#8da2c8;font:inherit;font-size:12px;cursor:pointer";
        const box = el("div", { className: "muted linknote" }, el("b", { textContent: bad ? "Your link stopped working. " : "Get more out of this. " }), bad ? "Link again to switch your prices, bundle checks and wishlist back on." : "Link with Steam Value Checker (free) to see prices from every store, whether you own a game, wishlist sales and more.", el("br"), a, hide);
        box.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid #25324a";
        hide.addEventListener("click", async () => { try { await chrome.storage.local.set({ linkHintHidden: Date.now() }); } catch { /* ignore */ } box.remove(); });
        return box;
    }
    let host = null, root = null, lastSlug = "", busy = false;
    function mount() {
        if (host?.isConnected) return;
        host = el("div", { style: "pointer-events:auto;width:100%" }); host.id = "fg-regions-card";
        const shadow = host.attachShadow({ mode: "open" }); shadow.append(el("style", { textContent: css })); root = el("div"); shadow.append(root);
        (window.__fgStack ? window.__fgStack() : document.documentElement).append(host);
    }
    const unmount = () => { host?.remove(); host = null; root = null; };
    const show = (...kids) => { mount(); const x = el("button", { className: "x", textContent: "×", title: "Close" }); x.addEventListener("click", () => { unmount(); lastSlug = "closed:" + location.pathname; }); root.replaceChildren(el("div", { className: "card" }, x, ...kids)); };

    async function check(lang, slug) {
        busy = true;
        try {
            const r = await fetch(`/api/products-group/${encodeURIComponent(slug)}/${encodeURIComponent(lang)}`, { credentials: "omit" });
            if (!r.ok) return show(el("h4", { textContent: "Region check" }), el("div", { className: "muted", textContent: "Couldn't read this game's region list. Try the page's own Check Regions button." }));
            const product = await r.json(), res = analyze(product, allCountries([...(product.regions_included || []), ...(product.regions_excluded || [])]));
            const total = res.works.length + res.blocked.length, kids = [el("h4", { textContent: "Region check" })];
            if (res.global) kids.push(el("div", { className: "big good", textContent: "Global: activates everywhere" }), el("div", { className: "muted", textContent: `No country is blocked (${total} checked).` }));
            else if (!res.works.length) kids.push(el("div", { className: "big bad", textContent: "Blocked everywhere" }));
            else kids.push(el("div", { className: "big " + (res.blocked.length < res.works.length ? "warn" : "bad"), textContent: `Region-locked: works in ${res.works.length} of ${total} countries` }));
            if (!res.global) {
                const mk = (title, list, cls) => el("details", {}, el("summary", { className: cls, textContent: `${title} (${list.length})` }), el("div", { className: "list", textContent: list.map(c => c.name).join(", ") || "None" }));
                // The shorter list opens first, since that's the one worth reading.
                const a = mk("Works in", res.works, "good"), b = mk("Doesn't work in", res.blocked, "bad");
                (res.works.length <= res.blocked.length ? a : b).open = true;
                kids.push(a, b);
                const out = el("div", { className: "muted" }), inp = el("input", { type: "text", placeholder: "Check a country…" });
                inp.addEventListener("input", () => {
                    const q = inp.value.trim().toLowerCase(); if (q.length < 2) { out.textContent = ""; return; }
                    const hit = [...res.works.map(c => [c, true]), ...res.blocked.map(c => [c, false])].find(([c]) => c.name.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
                    out.textContent = hit ? `${hit[0].name}: ${hit[1] ? "activates" : "does NOT activate"}` : "No country by that name.";
                });
                kids.push(inp, out);
            }
            if (Array.isArray(product.editions) && product.editions.some(e => (e.regions_included?.length || 0) + (e.regions_excluded?.length || 0) > 0)) kids.push(el("div", { className: "muted", textContent: "Some editions have their own region list. This is the main game's; check the others on the page." }));
            const note = await linkNote(false); if (note) kids.push(note);
            show(...kids);
        } catch { show(el("h4", { textContent: "Region check" }), el("div", { className: "muted", textContent: "Couldn't read this game's region list." })); }
        finally { busy = false; }
    }

    /** Build-your-own bundles: every game in the pool has its own region list, so each one gets its own verdict. */
    async function checkPick(lang, slug) {
        busy = true;
        try {
            const r = await fetch(`/api/pick-and-mix/${encodeURIComponent(slug)}/${encodeURIComponent(lang)}`, { credentials: "omit" });
            if (!r.ok) return show(el("h4", { textContent: "Region check" }), el("div", { className: "muted", textContent: "Couldn't read this bundle's games. Try again in a moment." }));
            const bundle = await r.json(), games = (Array.isArray(bundle.products) ? bundle.products : []).filter(p => p && p.name);
            if (!games.length) return show(el("h4", { textContent: "Region check" }), el("div", { className: "muted", textContent: "No games found in this bundle." }));
            const extra = games.flatMap(p => [...(p.regions_included || []), ...(p.regions_excluded || [])]);
            const uni = allCountries(extra);
            const rows = games.map(p => ({ name: p.name, res: analyze(p, uni) })).sort((a, b) => (a.res.global === b.res.global ? a.name.localeCompare(b.name) : a.res.global ? -1 : 1));
            const globals = rows.filter(x => x.res.global).length;
            const kids = [el("h4", { textContent: "Region check" }),
                el("div", { className: "big " + (globals === rows.length ? "good" : globals ? "warn" : "bad"), textContent: globals === rows.length ? "Every game is global" : `${globals} of ${rows.length} games are global` }),
                el("div", { className: "muted", textContent: `Checked ${uni.size} countries for each game. Each game is checked on its own. Open a locked one to see where it works.` })];
            for (const { name, res } of rows) {
                if (res.global) { kids.push(el("div", { className: "muted" }, el("span", { className: "good", textContent: "\u2713 " }), name)); continue; }
                kids.push(el("details", {}, el("summary", { className: res.works.length > res.blocked.length ? "warn" : "bad", textContent: `${name}: works in ${res.works.length} of ${res.works.length + res.blocked.length}` }),
                    el("div", { className: "list" }, el("b", { className: "good", textContent: `Works in (${res.works.length}): ` }), res.works.map(c => c.name).join(", ") || "None"),
                    el("div", { className: "list" }, el("b", { className: "bad", textContent: `Doesn't work in (${res.blocked.length}): ` }), res.blocked.map(c => c.name).join(", ") || "None")));
            }
            const note = await linkNote(false); if (note) kids.push(note);
            show(...kids);
        } catch { show(el("h4", { textContent: "Region check" }), el("div", { className: "muted", textContent: "Couldn't read this bundle's games." })); }
        finally { busy = false; }
    }

    function tick() {
        const m = PAGE.exec(location.pathname);
        if (!m) { lastSlug = ""; unmount(); return; }
        const key = m[1] + "/" + m[2] + "/" + m[3];
        if (key === lastSlug || lastSlug === "closed:" + location.pathname || busy) return;
        lastSlug = key;
        const go = el("button", { className: "go", textContent: "Check all regions" });
        go.addEventListener("click", () => { go.disabled = true; go.textContent = "Checking…"; (m[2] === "pick-and-mix" ? checkPick : check)(m[1], m[3]); });
        show(el("h4", { textContent: "Region check" }), el("div", { className: "muted", textContent: m[2] === "pick-and-mix" ? "Check which games in this bundle activate in every country." : "See every country this key activates in, in one go." }), el("div", { style: "margin-top:8px" }, go));
        linkNote(false).then(n => { if (n && lastSlug === key && root && !root.querySelector(".linknote")) root.querySelector(".card")?.append(n); });
    }
    tick(); setInterval(tick, 1200); // Fanatical is a single-page app, so the address changes without a reload
})();
