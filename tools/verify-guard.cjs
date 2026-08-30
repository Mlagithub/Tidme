const fs = require("fs");
const t = JSON.parse(JSON.parse(fs.readFileSync("out-m2/$__plugins_keepone_tidme.json", "utf8")).text).tiddlers;
const w = t["$:/plugins/keepone/tidme/import/widgets/section.js"].text;
console.log("typeof window 守卫(压缩后):", /typeof window/.test(w));
console.log("keysBound 守卫           :", /keysBound/.test(w));
console.log("无 globalThis            :", !w.includes("globalThis"));
