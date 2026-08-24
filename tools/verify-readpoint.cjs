/* verify-readpoint.cjs — 校验 read-point v2 已打进 widget */
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("out-m2/$__plugins_tidme_import.json", "utf8"));
const t = JSON.parse(p.text).tiddlers;
const w = t["$:/plugins/tidme/import/widgets/section.js"].text;
console.log("设续读点      :", w.includes("设续读点"));
console.log("⏮ chip       :", w.includes("⏮"));
console.log("tm-readpoint  :", w.includes("tm-readpoint"));
console.log("notify-readpt :", !!t["$:/plugins/tidme/import/ui/notify-readpoint"]);
