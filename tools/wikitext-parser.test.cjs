const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLineWikiText, cleanContaminatedHtmlToWikiText } = require("../src/tidme/editor/wikitext-parser.ts");

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
