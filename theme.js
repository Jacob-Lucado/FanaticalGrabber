// Lets the extension's pop-ups wear the colors of the store they're on. Fanatical gets black and orange, Green Man Gaming gets its
// charcoal and green. Other stores keep the default navy. `from` says which palette the string was written in.
window.__fgSkin = (str, from) => {
    if (!/(^|\.)greenmangaming\.com$/.test(location.hostname)) return str;
    const maps = {
        orange: [["#ffa726", "#00e205"], ["#f57c00", "#00b804"], ["#ff9800", "#00e205"], ["rgba(255,152,0,", "rgba(0,226,5,"], ["rgba(26,26,26,.86)", "rgba(39,40,46,.88)"], ["#1a1a1a", "#27282e"], ["#262626", "#32333a"], ["#3a3a3a", "#45464e"], ["#333", "#3d3e46"]],
        navy: [["color:#fff;text-decoration:none;background:linear-gradient(90deg,#4da3ff,#7c6cff)", "color:#000;text-decoration:none;background:linear-gradient(90deg,#00e205,#00b804)"], ["#0f1623", "#27282e"], ["#25324a", "#3d3e46"], ["#1c2740", "#34353c"], ["#1a2740", "#32333a"], ["#2d3f61", "#45464e"], ["rgba(77,163,255,", "rgba(0,226,5,"], ["#4da3ff", "#00e205"], ["#7c6cff", "#00b804"], ["#8da2c8", "#a8a8a8"], ["#e8eefc", "#f2f2f2"]],
    };
    let out = String(str);
    for (const [a, b] of maps[from] || []) out = out.split(a).join(b);
    return out;
};
