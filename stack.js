// One spot for the extension's pop-up cards on Fanatical, so the bundle check and the region check stack neatly
// (bottom left) instead of landing on top of each other or on the Batch Redeem bar (bottom right).
window.__fgStack = () => {
    let s = document.getElementById("fg-stack");
    if (s?.isConnected) return s;
    s = document.createElement("div"); s.id = "fg-stack";
    s.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483646;display:flex;flex-direction:column;gap:10px;align-items:flex-start;box-sizing:border-box;width:min(320px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-y:auto;overflow-x:hidden;pointer-events:none";
    const st = document.createElement("style");
    st.textContent = "@media (max-width:660px){#fg-stack{bottom:84px!important;max-height:calc(100vh - 100px)!important}}"; // phones and narrow windows: clear the bar on the right
    document.documentElement.append(st, s);
    return s;
};
