
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("out-m2/$__plugins_keepone_tidme.json", "utf8"));
const inner = JSON.parse(p.text);
const pathModules = Object.keys(inner.tiddlers).filter(k => k.includes("paths"));
console.log("paths in built plugin:", pathModules);
// Also check what core modules are there
const coreModules = Object.keys(inner.tiddlers).filter(k => k.includes("core/") && !k.includes("/js/")).slice(0, 20);
console.log("\ncore modules (sample):", coreModules);
