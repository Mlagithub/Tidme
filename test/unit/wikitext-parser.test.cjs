const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLineWikiText, cleanContaminatedHtmlToWikiText } = require("../../src/tidme/editor/wikitext-parser.ts");

test("WikiText Parser — Headings", () => {
	const tokens = parseLineWikiText("! 标题一", 0);
	assert.equal(tokens.length, 1);
	assert.equal(tokens[0].type, "heading");
	assert.equal(tokens[0].level, 1);
	assert.equal(tokens[0].markStartFrom, 0);
	assert.equal(tokens[0].markStartTo, 2);
});

test("WikiText Parser — Bold & Italic", () => {
	const tokens = parseLineWikiText("这是''粗体''和//斜体//测试", 0);
	assert.equal(tokens.length, 2);
	assert.equal(tokens[0].type, "bold");
	assert.equal(tokens[0].from, 2);
	assert.equal(tokens[0].to, 8);

	assert.equal(tokens[1].type, "italic");
	assert.equal(tokens[1].from, 9);
	assert.equal(tokens[1].to, 15);
});

test("WikiText Parser — Wikilinks", () => {
	const tokens = parseLineWikiText("参阅 [[TiddlyWiki]] 和 [[显示名称|TargetTitle]]", 0);
	assert.equal(tokens.length, 2);
	assert.equal(tokens[0].type, "wikilink");
	assert.equal(tokens[0].displayText, "TiddlyWiki");

	assert.equal(tokens[1].type, "wikilink");
	assert.equal(tokens[1].displayText, "显示名称");
	assert.equal(tokens[1].linkTarget, "TargetTitle");
});

test("WikiText Parser — Superscript & Subscript & Code", () => {
	const tokens = parseLineWikiText("H^^2^^O 和 E=mc,,2,, 以及 `code`", 0);
	assert.equal(tokens.length, 3);
	assert.equal(tokens[0].type, "superscript");
	assert.equal(tokens[1].type, "subscript");
	assert.equal(tokens[2].type, "inline-code");
});

test("WikiText Parser — Blockquote & List & HR", () => {
	const tokensBq = parseLineWikiText("> 引用文本", 0);
	assert.equal(tokensBq[0].type, "blockquote");

	const tokensList = parseLineWikiText("* 列表项", 0);
	assert.equal(tokensList[0].type, "list-bullet");

	const tokensHr = parseLineWikiText("---", 0);
	assert.equal(tokensHr[0].type, "hr");
});

test("WikiText Parser — Clean Contaminated HTML", () => {
	const contaminated = "<p>真心即本心</p><p>真心是<b>真性</b>之子&nbsp;</p>";
	const cleaned = cleanContaminatedHtmlToWikiText(contaminated);
	assert.equal(cleaned, "真心即本心\n\n真心是''真性''之子");
});

// === 边界与组合（T3 补盲区） ===

test("parseLineWikiText: 空串与无标记纯文本不产生 token", () => {
	assert.deepEqual(parseLineWikiText("", 0), [], "空串");
	assert.deepEqual(parseLineWikiText("普通正文，无任何行内标记。", 0), [], "纯文本");
});

test("parseLineWikiText: 标题 1-6 级；7 个 ! 不是标题", () => {
	for (let lv = 1; lv <= 6; lv++) {
		const line = "!".repeat(lv) + " 标题";
		const tokens = parseLineWikiText(line, 0);
		assert.equal(tokens.length, 1, `${lv} 级`);
		assert.equal(tokens[0].type, "heading");
		assert.equal(tokens[0].level, lv);
	}
	assert.deepEqual(parseLineWikiText("!!!!!!! 七个叹号", 0), [], "超过 6 级不识别为标题");
});

test("parseLineWikiText: 列表类型与层级（* # ; :）", () => {
	assert.equal(parseLineWikiText("* 无序", 0)[0].type, "list-bullet");
	assert.equal(parseLineWikiText("# 有序", 0)[0].type, "list-number");
	assert.equal(parseLineWikiText("; 术语", 0)[0].type, "list-term");
	assert.equal(parseLineWikiText(": 定义", 0)[0].type, "list-def");
	assert.equal(parseLineWikiText("## 二级无序", 0)[0].level, 2, "嵌套层级");
});

test("parseLineWikiText: hr 要求整行 ---；行内混排不误判", () => {
	assert.equal(parseLineWikiText("---", 0)[0].type, "hr");
	assert.deepEqual(parseLineWikiText("--- 文本", 0), [], "尾随文本 → 非 hr");
});

test("parseLineWikiText: blockquote 需 > 后跟空白", () => {
	assert.equal(parseLineWikiText("> 引用", 0)[0].type, "blockquote");
	assert.deepEqual(parseLineWikiText(">引用", 0), [], "> 后无空格 → 非引用");
});

test("parseLineWikiText: 未闭合的行内标记不产生 token", () => {
	assert.deepEqual(parseLineWikiText("这是''未闭合粗体", 0), []);
	assert.deepEqual(parseLineWikiText("这是//未闭合斜体", 0), []);
	assert.deepEqual(parseLineWikiText("[[未闭合链接", 0), []);
});

test("parseLineWikiText: 标题 + 行内标记混合一行产出多 token", () => {
	const tokens = parseLineWikiText("! 标题带''粗体''", 0);
	assert.equal(tokens.length, 2);
	assert.equal(tokens[0].type, "heading");
	assert.equal(tokens[1].type, "bold");
});

test("parseLineWikiText: lineFrom 偏移计入 from/to", () => {
	const tokens = parseLineWikiText("''粗体''", 100);
	assert.equal(tokens[0].from, 100);
	assert.equal(tokens[0].to, 106);
	assert.equal(tokens[0].markStartFrom, 100);
	assert.equal(tokens[0].markStartTo, 102);
});

test("parseLineWikiText: 高亮/删除线/下划线标记", () => {
	// token 顺序 = 匹配器调用序（下划线 → 删除线 → 高亮），行内出现顺序只影响各类型内部
	const tokens = parseLineWikiText("@@高亮@@和~~删除~~加__下划__", 0);
	assert.deepEqual(tokens.map((t) => t.type), ["underline", "strikethrough", "highlight"]);
});

test("parseLineWikiText: transclusion 与三花括号行内代码", () => {
	const tr = parseLineWikiText("{{某条目}}", 0);
	assert.equal(tr[0].type, "transclusion");
	assert.equal(tr[0].displayText, "某条目");
	const code = parseLineWikiText("{{{code}}}", 0);
	assert.equal(code[0].type, "inline-code");
	assert.equal(code[0].innerText ?? "", "", "innerText 字段按 SyntaxToken 结构");
});

test("parseLineWikiText: HTML 经典标签转 wikitext token（<b>/<i>/<u>/<s>）", () => {
	const tokens = parseLineWikiText("<b>粗</b>与<i>斜</i>", 0);
	assert.deepEqual(tokens.map((t) => t.type), ["bold", "italic"]);
});

test("cleanContaminatedHtmlToWikiText: 纯文本原样返回（含空串）", () => {
	assert.equal(cleanContaminatedHtmlToWikiText("干净文本"), "干净文本");
	assert.equal(cleanContaminatedHtmlToWikiText(""), "");
});

test("cleanContaminatedHtmlToWikiText: 实体转义还原（&nbsp;/&lt;/&gt;/&amp;）", () => {
	assert.equal(cleanContaminatedHtmlToWikiText("A&nbsp;B"), "A B");
	assert.equal(
		cleanContaminatedHtmlToWikiText("<p>3&lt;5 且 A&amp;B&nbsp;C</p>"),
		"3<5 且 A&B C",
		"含真实标签才走清理分支，实体一并还原"
	);
});

test("cleanContaminatedHtmlToWikiText: strong/em/mark 与孤立标签清理、空行收敛", () => {
	assert.equal(cleanContaminatedHtmlToWikiText("<p><strong>重点</strong>和<em>强调</em></p>"), "''重点''和//强调//");
	assert.equal(cleanContaminatedHtmlToWikiText("<p>高亮<span>杂</span></p>"), "高亮杂", "孤立标签被清除");
	assert.equal(cleanContaminatedHtmlToWikiText("<p>a</p><p></p><p>b</p>"), "a\n\nb", "空段不产生三连空行");
});
