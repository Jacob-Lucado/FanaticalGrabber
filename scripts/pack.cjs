// What goes into the extension, and how the Firefox copy differs. Used by scripts/build.mjs and the tests.
const SHIPPED = ["manifest.json", "background.js", "bridge.js", "content.js", "deals.js", "history.js", "humble.js", "lib.js", "licenses.js", "options.html", "options.js",
    "popup.css", "popup.html", "popup.js", "regions.js", "stack.js", "steam.js", "stores.js", "theme.js", "update.js", "icon16.png", "icon48.png", "icon128.png", "LICENSE"];

/** Firefox runs the same code, but wants a background script instead of a service worker, and an add-on id. */
function firefoxManifest(manifest) {
    const m = structuredClone(manifest);
    m.background = { scripts: [manifest.background.service_worker] };
    m.browser_specific_settings = { gecko: { id: "fanaticalgrabber@jacob-lucado", strict_min_version: "121.0" } };
    return m;
}
module.exports = { SHIPPED, firefoxManifest };
