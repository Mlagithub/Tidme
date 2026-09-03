/* verify-m3v3.cjs — 校验 v3 工具栏与弹窗移除 */
const fs = require("fs");
const imp = JSON.parse(fs.readFileSync("bin/$__plugins_keepone_tidme.json", "utf8"));
const read = JSON.parse(fs.readFileSync("bin/$__plugins_keepone_tidme.json", "utf8"));

const it = JSON.parse(imp.text).tiddlers;
const w = it["$:/plugins/keepone/tidme/import/widgets/section.js"].text;
console.log("[import] 摘录按钮      :", w.includes("摘录"));
console.log("[import] 挖空按钮      :", w.includes("挖空"));
console.log("[import] Alt+X 处理器  :", w.includes('"alt+x"'));
console.log("[import] Ctrl+F7 处理器:", w.includes('"ctrl+f7"'));
console.log("[import] window 守卫   :", w.includes('typeof window !== "undefined"'));
console.log("[import] 无 globalThis :", !w.includes("globalThis"));

const rb = JSON.parse(read.text).tiddlers["$:/plugins/keepone/tidme/read/ui/ViewTemplate/body"].text;
console.log("[read] 弹窗已移除      :", !rb.includes("annotation popup") && !rb.includes("TidmeRead/annotation"));
console.log("[read] dynannotate保留 :", rb.includes("$dynannotate"));
