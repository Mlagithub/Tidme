// 去重 styles.tid 中"选择器+规则体完全一致"的重复 CSS 块（保留首次出现）
// 用法：node tools/dedupe-styles.cjs [--apply]
const fs = require("fs");
const path = require("path");

const p = path.resolve(__dirname, "../src/tidme/styles/styles.tid");
let text = fs.readFileSync(p, "utf8");

// CSS 正文从 type: text/css 行之后开始（前导为 tiddler 头字段，不参与解析）
const typeIdx = text.indexOf("type: text/css");
const cssStart = text.indexOf("\n", typeIdx) + 1;
const prelude = text.slice(0, cssStart);
const css = text.slice(cssStart);
const n = css.length;

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const norm = (s) => stripComments(s).trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*([,>+~:])\s*/g, "$1").replace(/\s*([{;])\s*/g, "$1");
const normBody = (s) => stripComments(s).trim().replace(/\s+/g, " ");

// 顶层括号平衡解析
const rules = [];
let i = 0;
while (i < n) {
	if (css.startsWith("/*", i)) {
		const end = css.indexOf("*/", i + 2);
		i = end === -1 ? n : end + 2;
		continue;
	}
	if (css[i] !== "{") { i++; continue; }
	let depth = 0, j = i;
	for (; j < n; j++) {
		if (css[j] === "{") depth++;
		else if (css[j] === "}") { depth--; if (depth === 0) break; }
	}
	const prevEnd = rules.length ? rules[rules.length - 1].end + 1 : 0;
	rules.push({ selector: css.slice(prevEnd, i), body: css.slice(i + 1, j), start: prevEnd, end: j });
	i = j + 1;
}

const keyOf = (r) => norm(r.selector) + "|" + normBody(r.body);
const seen = new Map();
const dupes = [];
for (const r of rules) {
	const k = keyOf(r);
	if (seen.has(k)) dupes.push({ key: k, selector: r.selector.trim(), first: seen.get(k).selector.trim() });
	else seen.set(k, r);
}

console.log(`总规则数: ${rules.length}`);
console.log(`重复规则数: ${dupes.length}`);
const bySel = new Map();
for (const d of dupes) bySel.set(d.key.split("|")[0], (bySel.get(d.key.split("|")[0]) || 0) + 1);
console.log("--- 按（注释剥离后的）选择器统计 ---");
for (const [sel, cnt] of [...bySel.entries()].sort((a, b) => b[1] - a[1])) {
	console.log(`${String(cnt).padStart(3)} 处重复: ${sel.slice(0, 90)}`);
}
console.log("--- 明细（选择器 | 规则体摘要） ---");
for (const d of dupes) {
	console.log(`· ${d.key.split("|")[0].slice(0, 60)} | ${d.key.split("|")[1].slice(0, 70)}`);
}
// 核验：tm-btn-icon 各次出现的 key
const iconRules = rules.map((r, idx) => ({ idx, key: keyOf(r) })).filter((x) => x.key.includes("tm-btn-icon"));
console.log("--- .tm-btn-icon 全部出现（idx | key） ---");
for (const x of iconRules) console.log(`${x.idx}: ${x.key.slice(0, 90)}`);

if (process.argv.includes("--apply")) {
	let out = css;
	for (const r of [...rules].reverse()) {
		if (seen.get(keyOf(r)) !== r) {
			out = out.slice(0, r.start) + out.slice(r.end + 1);
		}
	}
	fs.writeFileSync(p, prelude + out, { encoding: "utf8" });
	console.log(`已写回（移除 ${dupes.length} 处重复）`);
}
