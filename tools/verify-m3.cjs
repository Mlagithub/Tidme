/* verify-m3.cjs — 校验打包产物包含 M3 组件 */
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("out-m2/$__plugins_keepone_tidme.json", "utf8"));
const t = JSON.parse(p.text).tiddlers;
console.log("tiddlers:", Object.keys(t).length);
console.log("section widget :", !!t["$:/plugins/keepone/tidme/import/widgets/section.js"]);
console.log("nav VT         :", !!t["$:/plugins/keepone/tidme/import/ui/section-nav"]);
console.log("resume VT      :", !!t["$:/plugins/keepone/tidme/import/ui/doc-resume"]);
console.log("notify-extract :", !!t["$:/plugins/keepone/tidme/import/ui/notify-extract"]);
