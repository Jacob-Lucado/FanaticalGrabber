// Region check for Fanatical game and bundle pages. Fanatical makes you pick each country in its "Check Regions" box one at a time.
// This reads the same list the page uses (one request to Fanatical's own product data) and shows every country at once.
// Nothing is sent anywhere else.
(() => {
    if (window.__fgRegions) return; window.__fgRegions = true;
    if (!/(^|\.)(fanatical|greenmangaming)\.com$/.test(location.hostname)) return; // the same script file ships with the other stores, which have no region check
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

    const SK = s => (window.__fgSkin ? window.__fgSkin(s, "orange") : s);
    const GMG = /(^|\.)greenmangaming\.com$/.test(location.hostname);
    const css = `
      :host { all: initial; }
      .card { position: relative; width: 100%; max-height: 60vh; overflow: auto; padding: 14px 16px; box-sizing: border-box; font: 14px/1.4 system-ui, sans-serif; color: #f2f2f2; background: #1a1a1a; border: 1px solid #333; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
      h4 { margin: 0 0 8px; color: #a8a8a8; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em; }
      .x { float: right; background: none; border: 0; color: #a8a8a8; cursor: pointer; font-size: 16px; line-height: 1; }
      .big { font-size: 16px; font-weight: 700; margin: 2px 0 6px; } .good { color: #3ddc97; } .warn { color: #ffb84d; } .bad { color: #ff6b6b; }
      .muted { color: #a8a8a8; font-size: 12px; margin-top: 6px; }
      .go { padding: 7px 12px; font: inherit; font-size: 13px; font-weight: 650; color: #111; background: linear-gradient(90deg, #ffa726, #f57c00); border: 0; border-radius: 999px; cursor: pointer; }
      .go:disabled { opacity: .6; cursor: default; }
      details { margin-top: 8px; } summary { cursor: pointer; font-weight: 650; }
      .list { margin-top: 6px; font-size: 12px; color: #d6d6d6; line-height: 1.55; }
      input { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 6px 9px; font: inherit; font-size: 13px; color: #f2f2f2; background: #262626; border: 1px solid #3a3a3a; border-radius: 8px; }
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
        a.style.cssText = SK("display:inline-block;margin-top:6px;padding:5px 12px;border-radius:999px;font-weight:650;font-size:12px;color:#111;text-decoration:none;background:linear-gradient(90deg,#ffa726,#f57c00)");
        const hide = el("button", { textContent: "Not now" });
        hide.style.cssText = "margin-left:8px;background:none;border:0;color:#a8a8a8;font:inherit;font-size:12px;cursor:pointer";
        const box = el("div", { className: "muted linknote" }, el("b", { textContent: bad ? "Your link stopped working. " : "Get more out of this. " }), bad ? "Link again to switch your prices, bundle checks and wishlist back on." : "Link with Steam Value Checker (free) to see prices from every store, whether you own a game, wishlist sales and more.", el("br"), a, hide);
        box.style.cssText = SK("margin-top:10px;padding-top:8px;border-top:1px solid #333");
        hide.addEventListener("click", async () => { try { await chrome.storage.local.set({ linkHintHidden: Date.now() }); } catch { /* ignore */ } box.remove(); });
        return box;
    }
    let host = null, root = null, lastSlug = "", busy = false;
    function mount() {
        if (host?.isConnected) return;
        host = el("div", { style: "pointer-events:auto;width:100%" }); host.id = "fg-regions-card";
        const shadow = host.attachShadow({ mode: "open" }); shadow.append(el("style", { textContent: SK(css) })); root = el("div"); shadow.append(root);
        (window.__fgStack ? window.__fgStack() : document.documentElement).append(host);
    }
    const unmount = () => { host?.remove(); host = null; root = null; };
    const show = (...kids) => { mount(); const x = el("button", { className: "x", textContent: "×", title: "Close" }); x.addEventListener("click", () => { unmount(); lastSlug = "closed:" + location.pathname; }); root.replaceChildren(el("div", { className: "card" }, x, ...kids)); };

    // ---------- the results window: a centered, see-through panel over the page ----------
    const MCSS = `
      :host { all: initial; }
      .back { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; background: rgba(6,10,18,.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #f2f2f2; animation: fgin .18s ease-out; }
      @keyframes fgin { from { opacity: 0; } to { opacity: 1; } } @keyframes fgup { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
      .win { width: min(900px, 100%); max-height: min(86vh, 860px); display: flex; flex-direction: column; background: rgba(26,26,26,.86); -webkit-backdrop-filter: blur(18px) saturate(1.2); backdrop-filter: blur(18px) saturate(1.2); border: 1px solid rgba(255,255,255,.28); border-radius: 22px; box-shadow: 0 30px 90px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06); overflow: hidden; animation: fgup .22s ease-out; }
      .head { display: flex; align-items: flex-start; gap: 14px; padding: 22px 26px 16px; border-bottom: 1px solid rgba(255,255,255,.16); background: linear-gradient(180deg, rgba(255,152,0,.10), transparent); }
      .head .ttl { flex: 1; min-width: 0; } .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #ff9800; }
      .head h2 { margin: 4px 0 0; font-size: 24px; line-height: 1.2; font-weight: 800; color: #fff; overflow-wrap: anywhere; }
      .xbtn, .bk { flex: none; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); color: #d6d6d6; border-radius: 999px; cursor: pointer; font: inherit; }
      .xbtn { width: 36px; height: 36px; font-size: 20px; line-height: 1; } .bk { padding: 7px 14px; font-size: 13px; font-weight: 650; margin-bottom: 8px; }
      .xbtn:hover, .bk:hover { background: rgba(255,255,255,.14); color: #fff; }
      .scroll { overflow: auto; padding: 20px 26px 24px; }
      .verdict { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 16px; border: 1px solid; margin-bottom: 16px; }
      .verdict .ic { flex: none; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; font-size: 24px; font-weight: 800; }
      .verdict b { display: block; font-size: 19px; } .verdict span { font-size: 13px; color: #d6d6d6; }
      .v-good { background: rgba(61,220,151,.10); border-color: rgba(61,220,151,.4); } .v-good .ic { background: rgba(61,220,151,.2); color: #3ddc97; } .v-good b { color: #3ddc97; }
      .v-warn { background: rgba(255,184,77,.10); border-color: rgba(255,184,77,.4); } .v-warn .ic { background: rgba(255,184,77,.2); color: #ffb84d; } .v-warn b { color: #ffb84d; }
      .v-bad { background: rgba(255,107,107,.10); border-color: rgba(255,107,107,.4); } .v-bad .ic { background: rgba(255,107,107,.2); color: #ff6b6b; } .v-bad b { color: #ff6b6b; }
      .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
      .tile { padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.18); }
      .tile i { display: block; font-style: normal; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #a8a8a8; } .tile strong { display: block; margin-top: 4px; font-size: 28px; line-height: 1.1; font-weight: 800; }
      .good { color: #3ddc97; } .warn { color: #ffb84d; } .bad { color: #ff6b6b; }
      .meter { display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: rgba(255,107,107,.55); margin-bottom: 20px; } .meter span { background: linear-gradient(90deg, #2bc489, #3ddc97); }
      .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .cols.one { grid-template-columns: 1fr; }
      .pane { border-radius: 16px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.16); padding: 14px 16px; min-width: 0; }
      .pane h3 { margin: 0 0 10px; font-size: 14px; font-weight: 750; display: flex; align-items: center; gap: 8px; } .pane h3 em { font-style: normal; font-size: 12px; padding: 2px 9px; border-radius: 99px; background: rgba(255,255,255,.1); color: #f2f2f2; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 260px; overflow: auto; padding-right: 4px; } .chip { padding: 4px 10px; border-radius: 99px; font-size: 12px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); color: #ececec; }
      .p-good .chip { border-color: rgba(61,220,151,.28); } .p-bad .chip { border-color: rgba(255,107,107,.28); } .none { color: #a8a8a8; font-size: 13px; }
      .find { display: flex; gap: 10px; align-items: center; margin: 16px 0 0; flex-wrap: wrap; }
      .find input { flex: 1; min-width: 180px; padding: 10px 14px; font: inherit; color: #fff; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.3); border-radius: 12px; outline: none; } .find input:focus { border-color: #ff9800; }
      .answer { font-weight: 700; font-size: 13px; padding: 6px 12px; border-radius: 99px; } .answer.y { background: rgba(61,220,151,.16); color: #3ddc97; } .answer.n { background: rgba(255,107,107,.16); color: #ff6b6b; } .answer.q { color: #a8a8a8; font-weight: 500; }
      .filters { display: flex; gap: 8px; margin: 0 0 14px; flex-wrap: wrap; } .fl { padding: 7px 14px; border-radius: 99px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.05); color: #d6d6d6; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; } .fl.on { background: linear-gradient(90deg, #ffa726, #f57c00); color: #111; border-color: transparent; }
      .games { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
      .game { text-align: left; padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.05); color: inherit; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 8px; }
      .game:hover { background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.45); } .game b { font-size: 14px; line-height: 1.3; } .game small { color: #a8a8a8; font-size: 12px; }
      .badge { align-self: flex-start; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: 3px 10px; border-radius: 99px; }
      .b-good { background: rgba(61,220,151,.18); color: #3ddc97; } .b-warn { background: rgba(255,184,77,.18); color: #ffb84d; } .b-bad { background: rgba(255,107,107,.18); color: #ff6b6b; }
      .foot { padding: 12px 26px; border-top: 1px solid rgba(255,255,255,.14); font-size: 12px; color: #a8a8a8; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; }
      @media (max-width: 640px) { .tiles { grid-template-columns: 1fr 1fr 1fr; } .cols { grid-template-columns: 1fr; } .head h2 { font-size: 19px; } .tile strong { font-size: 22px; } }
    `;
    let mHost = null, mRoot = null;
    const closeModal = () => { mHost?.remove(); mHost = null; mRoot = null; document.removeEventListener("keydown", onKey, true); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); closeModal(); } };
    /** Builds the window once and returns a function that swaps what's inside it. */
    function openModal() {
        closeModal();
        mHost = el("div"); mHost.id = "fg-regions-modal";
        const sh = mHost.attachShadow({ mode: "open" }); sh.append(el("style", { textContent: SK(MCSS) }));
        const back = el("div", { className: "back" }); mRoot = back; sh.append(back);
        back.addEventListener("mousedown", e => { if (e.target === back) closeModal(); });
        document.addEventListener("keydown", onKey, true);
        document.documentElement.append(mHost);
    }
    function paint({ eyebrow = "Region check", title, back, body, foot }) {
        const x = el("button", { className: "xbtn", textContent: "×", title: "Close (Esc)", "aria-label": "Close" }); x.addEventListener("click", closeModal);
        const ttl = el("div", { className: "ttl" }, back || null, el("div", { className: "eyebrow", textContent: eyebrow }), el("h2", { textContent: title }));
        const win = el("div", { className: "win", role: "dialog", "aria-modal": "true" }, el("div", { className: "head" }, ttl, x), el("div", { className: "scroll" }, ...body), el("div", { className: "foot" }, ...(foot || [el("span", { textContent: "Checked against Fanatical's own region lists." })])));
        mRoot.replaceChildren(win);
        x.focus({ preventScroll: true });
        return win;
    }
    const chips = list => el("div", { className: "chips" }, ...(list.length ? list.map(c => el("span", { className: "chip", textContent: c.name })) : [el("span", { className: "none", textContent: "None" })]));

    /** One game or bundle: verdict, numbers, and both country lists. */
    function singleBody(res) {
        const total = res.works.length + res.blocked.length, pct = total ? (res.works.length / total) * 100 : 0;
        const mode = res.global ? "good" : !res.works.length ? "bad" : res.blocked.length < res.works.length ? "warn" : "bad";
        const head = res.global ? ["✓", "Global: activates everywhere", `No country is blocked. All ${total} checked.`]
            : !res.works.length ? ["✕", "Blocked everywhere", "This key doesn't activate in any country on Fanatical's list."]
            : ["!", "Region-locked", `Activates in ${res.works.length} of ${total} countries.`];
        const nodes = [el("div", { className: "verdict v-" + mode }, el("div", { className: "ic", textContent: head[0] }), el("div", {}, el("b", { textContent: head[1] }), el("span", { textContent: head[2] }))),
            el("div", { className: "tiles" }, el("div", { className: "tile" }, el("i", { textContent: "Works in" }), el("strong", { className: "good", textContent: String(res.works.length) })),
                el("div", { className: "tile" }, el("i", { textContent: "Blocked in" }), el("strong", { className: res.blocked.length ? "bad" : "", textContent: String(res.blocked.length) })),
                el("div", { className: "tile" }, el("i", { textContent: "Countries checked" }), el("strong", { textContent: String(total) }))),
            el("div", { className: "meter", title: `${Math.round(pct)}% of countries` }, el("span", { style: `width:${pct}%` }))];
        if (!res.global) {
            const mk = (cls, label, list) => el("div", { className: "pane " + cls }, el("h3", { className: cls === "p-good" ? "good" : "bad" }, label, el("em", { textContent: String(list.length) })), chips(list));
            nodes.push(el("div", { className: "cols" + (!res.works.length || !res.blocked.length ? " one" : "") }, ...(res.works.length ? [mk("p-good", "Works in", res.works)] : []), ...(res.blocked.length ? [mk("p-bad", "Doesn't work in", res.blocked)] : [])));
            const out = el("span", { className: "answer q", textContent: "Type a country to check it." }), inp = el("input", { type: "text", placeholder: "Check a country, like Germany or JP", spellcheck: false });
            inp.addEventListener("input", () => {
                const q = inp.value.trim().toLowerCase();
                if (q.length < 2) { out.className = "answer q"; out.textContent = "Type a country to check it."; return; }
                const all = [...res.works.map(c => [c, true]), ...res.blocked.map(c => [c, false])];
                const hit = all.find(([c]) => c.code.toLowerCase() === q || c.name.toLowerCase() === q) || all.find(([c]) => c.name.toLowerCase().startsWith(q)) || all.find(([c]) => c.name.toLowerCase().includes(q));
                if (!hit) { out.className = "answer q"; out.textContent = "No country by that name."; return; }
                out.className = "answer " + (hit[1] ? "y" : "n"); out.textContent = `${hit[0].name}: ${hit[1] ? "activates" : "does NOT activate"}`;
            });
            nodes.push(el("div", { className: "find" }, inp, out));
        }
        return nodes;
    }
    const footWith = async extra => { const f = [el("span", { textContent: extra || "Checked against Fanatical's own region lists." })]; const n = await linkNote(false); if (n) { n.style.cssText = "margin:0;padding:0;border:0"; f.push(n); } return f; };
    const cleanTitle = () => document.title.replace(/\s*\|\s*Fanatical.*$/i, "").replace(/\s*\|\s*(Steam|PC|Mac).*$/i, "").trim();

    let lastView = null; // so the launcher card can bring the window back after it's closed
    async function check(lang, slug) {
        busy = true;
        try {
            const r = await fetch(`/api/products-group/${encodeURIComponent(slug)}/${encodeURIComponent(lang)}`, { credentials: "omit" });
            if (!r.ok) throw new Error("http");
            const product = await r.json(), res = analyze(product, allCountries([...(product.regions_included || []), ...(product.regions_excluded || [])]));
            const body = singleBody(res);
            if (Array.isArray(product.editions) && product.editions.some(e => (e.regions_included?.length || 0) + (e.regions_excluded?.length || 0) > 0)) body.push(el("div", { className: "none", style: "margin-top:14px", textContent: "Some editions have their own region list. This is the main one." }));
            const foot = await footWith();
            lastView = () => { openModal(); paint({ title: product.name || cleanTitle(), body, foot }); };
            lastView();
        } catch { openModal(); paint({ title: cleanTitle() || "Region check", body: [el("div", { className: "verdict v-warn" }, el("div", { className: "ic", textContent: "!" }), el("div", {}, el("b", { textContent: "Couldn't read the region list" }), el("span", { textContent: "Try the page's own Check Regions button, or try again in a moment." })))] }); }
        finally { busy = false; }
    }

    /** Build-your-own bundles: every game in the pool has its own region list, so each one gets its own card and its own verdict. */
    async function checkPick(lang, slug) {
        busy = true;
        try {
            const r = await fetch(`/api/pick-and-mix/${encodeURIComponent(slug)}/${encodeURIComponent(lang)}`, { credentials: "omit" });
            if (!r.ok) throw new Error("http");
            const bundle = await r.json(), games = (Array.isArray(bundle.products) ? bundle.products : []).filter(p => p && p.name);
            if (!games.length) throw new Error("none");
            const uni = allCountries(games.flatMap(p => [...(p.regions_included || []), ...(p.regions_excluded || [])]));
            const rows = games.map(p => ({ name: p.name, res: analyze(p, uni) })).sort((a, b) => (a.res.global === b.res.global ? a.name.localeCompare(b.name) : a.res.global ? -1 : 1));
            const kindOf = res => res.global ? "good" : res.works.length > res.blocked.length ? "warn" : "bad";
            const nGlobal = rows.filter(x => x.res.global).length, nLocked = rows.length - nGlobal;
            const foot = await footWith("Every game in a build-your-own bundle has its own region list.");
            const title = bundle.name || cleanTitle();
            const list = (filter = "all") => {
                const bodyNodes = [];
                const mode = nLocked === 0 ? "good" : nGlobal ? "warn" : "bad";
                bodyNodes.push(el("div", { className: "verdict v-" + mode }, el("div", { className: "ic", textContent: nLocked === 0 ? "✓" : "!" }), el("div", {}, el("b", { textContent: nLocked === 0 ? "Every game is global" : `${nGlobal} of ${rows.length} games are global` }), el("span", { textContent: nLocked === 0 ? `All ${uni.size} countries work for every game in the pool.` : "Region-locked games only activate in some countries. Pick one to see exactly where." }))),
                    el("div", { className: "tiles" }, el("div", { className: "tile" }, el("i", { textContent: "Global games" }), el("strong", { className: "good", textContent: String(nGlobal) })), el("div", { className: "tile" }, el("i", { textContent: "Region-locked" }), el("strong", { className: nLocked ? "warn" : "", textContent: String(nLocked) })), el("div", { className: "tile" }, el("i", { textContent: "Games in the pool" }), el("strong", { textContent: String(rows.length) }))));
                const fl = el("div", { className: "filters" });
                for (const [id, label] of [["all", `All (${rows.length})`], ["good", `Global (${nGlobal})`], ["locked", `Region-locked (${nLocked})`]]) {
                    if (id !== "all" && !(id === "good" ? nGlobal : nLocked)) continue;
                    const b = el("button", { className: "fl" + (filter === id ? " on" : ""), textContent: label }); b.addEventListener("click", () => paint2(id)); fl.append(b);
                }
                bodyNodes.push(fl);
                const grid = el("div", { className: "games" });
                for (const g of rows.filter(x => filter === "all" || (filter === "good" ? x.res.global : !x.res.global))) {
                    const k = kindOf(g.res), tot = g.res.works.length + g.res.blocked.length;
                    const card = el("button", { className: "game", type: "button" }, el("span", { className: "badge b-" + k, textContent: g.res.global ? "Global" : k === "bad" ? "Mostly blocked" : "Region-locked" }), el("b", { textContent: g.name }), el("small", { textContent: g.res.global ? `Works in all ${tot} countries` : `Works in ${g.res.works.length} of ${tot} countries` }));
                    card.addEventListener("click", () => detail(g)); grid.append(card);
                }
                bodyNodes.push(grid);
                return bodyNodes;
            };
            const paint2 = f => paint({ eyebrow: "Region check · build your own bundle", title, body: list(f), foot });
            const detail = g => { const bk = el("button", { className: "bk", textContent: "← All games" }); bk.addEventListener("click", () => paint2("all")); paint({ eyebrow: "Region check", title: g.name, back: bk, body: singleBody(g.res), foot }); };
            lastView = () => { openModal(); paint2("all"); };
            lastView();
        } catch { openModal(); paint({ title: cleanTitle() || "Region check", body: [el("div", { className: "verdict v-warn" }, el("div", { className: "ic", textContent: "!" }), el("div", {}, el("b", { textContent: "Couldn't read this bundle's games" }), el("span", { textContent: "Try again in a moment." })))] }); }
        finally { busy = false; }
    }

    /** Green Man Gaming: its own "View Regions" link calls this endpoint with the product's code, which gives the countries it works in by name. */
    async function checkGmg() {
        busy = true;
        try {
            const sku = document.querySelector("gmgprice[sku]")?.getAttribute("sku");
            if (!sku) throw new Error("nosku");
            const r = await fetch(`/api/v2/pdp_regional_restrictions?sku=${encodeURIComponent(sku)}`, { credentials: "include" });
            if (!r.ok) throw new Error("http");
            const d = await r.json();
            const norm = n => String(n || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, "").replace(/\bthe\b/g, "").replace(/\s+/g, " ").trim();
            const uni = allCountries();
            let res;
            if (!d.HasRegionalRestrictions) res = analyze({}, uni);
            else {
                const names = new Set((d.AvailableCountries || []).map(norm)), used = new Set();
                const works = [], blocked = [];
                for (const [code, name] of uni) { if (names.has(norm(name))) { works.push({ code, name }); used.add(norm(name)); } else blocked.push({ code, name }); }
                for (const n of d.AvailableCountries || []) if (!used.has(norm(n))) works.push({ code: n, name: n }); // a name Intl words differently still counts as working
                const by = (a, b) => a.name.localeCompare(b.name); works.sort(by); blocked.sort(by);
                res = { global: blocked.length === 0, works, blocked };
            }
            const title = (document.querySelector("h1")?.textContent || cleanTitle()).trim();
            const body = singleBody(res), foot = await footWith("Checked against Green Man Gaming's own region list.");
            lastView = () => { openModal(); paint({ title, body, foot }); };
            lastView();
        } catch { openModal(); paint({ title: cleanTitle() || "Region check", body: [el("div", { className: "verdict v-warn" }, el("div", { className: "ic", textContent: "!" }), el("div", {}, el("b", { textContent: "Couldn't read the region list" }), el("span", { textContent: "Try the page's own View Regions link, or try again in a moment." })))] }); }
        finally { busy = false; }
    }

    function tick() {
        const m = GMG ? (/^\/games\/([^/?#]+)/.exec(location.pathname) || []).length ? ["", "", "game", /^\/games\/([^/?#]+)/.exec(location.pathname)[1]] : null : PAGE.exec(location.pathname);
        if (!m) { lastSlug = ""; lastView = null; closeModal(); unmount(); return; }
        const key = m[1] + "/" + m[2] + "/" + m[3];
        if (key === lastSlug || lastSlug === "closed:" + location.pathname || busy) return;
        lastSlug = key; lastView = null; closeModal();
        const go = el("button", { className: "go", textContent: "Check all regions" });
        go.addEventListener("click", async () => {
            if (lastView) { lastView(); return; }
            go.disabled = true; go.textContent = "Checking…";
            await (GMG ? checkGmg : m[2] === "pick-and-mix" ? checkPick : check)(m[1], m[3]);
            go.disabled = false; go.textContent = lastView ? "View results" : "Try again";
        });
        show(el("h4", { textContent: "Region check" }), el("div", { className: "muted", textContent: m[2] === "pick-and-mix" ? "Check which games in this bundle activate in every country." : "See every country this key activates in, in one go." }), el("div", { style: "margin-top:8px" }, go));
        linkNote(false).then(n => { if (n && lastSlug === key && root && !root.querySelector(".linknote")) root.querySelector(".card")?.append(n); });
    }
    tick(); setInterval(tick, 1200); // Fanatical is a single-page app, so the address changes without a reload
})();
