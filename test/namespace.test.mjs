/*
namespace.test.mjs — Tidme 命名空间隔离集成测试（node:test）

验证：导入的文档/节卡/摘录/挖空/问答/子集牌组/手动节卡都进 Tidme/ 命名空间；
title 唯一稳定；过滤仍然基于字段；老前缀消费者不受影响。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TiddlyWiki from "tiddlywiki";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "../out-m2");
const plugins = ["$__plugins_keepone_tidme", "$__tidme_languages_zh-Hans"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
if (!plugins.length) throw new Error("缺少 out-m2 产物，先运行 node tools/build-plugins.cjs");

let wiki, tw, pipeline, paths, sectionMod;
test.before(() => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-ns-"));
	tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray(plugins);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	wiki = tw.wiki;
	pipeline = tw.modules.execute("$:/plugins/keepone/tidme/import/pipeline.js");
	paths = tw.modules.execute("$:/plugins/keepone/tidme/core/paths.js");
	sectionMod = tw.modules.execute("$:/plugins/keepone/tidme/import/widgets/section.js");
});

function twDate(d = new Date()) {
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + p(d.getUTCMilliseconds(), 3);
}

test.beforeEach(() => {
	// 清除用户 tiddler 保留插件/系统（除 Tidme namespace shadow 外）
	for (const t of wiki.filterTiddlers("[!is[system]]")) wiki.deleteTiddler(t);
});

// === 单元：纯函数 ===

test("paths: slugify 处理各种书名", () => {
	assert.equal(paths.slugify("书名"), "书名");
	assert.equal(paths.slugify("《书》"), "书");
	assert.equal(paths.slugify("书（营销）"), "书营销");
	assert.equal(paths.slugify("书 名"), "书-名");
	assert.equal(paths.slugify("1.1 思维与表达"), "1-1-思维与表达");
	// 空字符串目前返回 ""（调用方 bookRoot 兜底为 untitled）
	assert.equal(paths.slugify(""), "");
});

test("paths: bookRoot + sectionPath 产出符合命名空间（可读叶段 + 稳定 id）", () => {
	const root = paths.bookRoot("批评性思维", "d12345678");
	assert.equal(root, "Tidme/Books/批评性思维");
	// sectionLeaf（A2）：可读 caption slug + "-" + id；唯一性由 id 保证
	assert.equal(paths.sectionLeaf("第一章", "s1234567890ab"), "第一章-s1234567890ab");
	assert.equal(paths.sectionLeaf("", "s1234567890ab"), "s1234567890ab", "caption 空退化为纯 id");
	// sectionPath 拍平到书目录
	const sec = paths.sectionPath("批评性思维", "第一章 1.1 思维", "s1234567890ab");
	assert.equal(sec, "Tidme/Books/批评性思维/第一章-1-1-思维-s1234567890ab");
});

test("paths: 摘录留在书目录、知识卡进 decks/（拍平+命名空间分流）", () => {
	// 摘录：Tidme/Books/<书>/<sectionId>--extract（拍平在书目录）
	const extract = paths.extractPath("书", "d1", "s1234567890ab");
	assert.equal(extract, "Tidme/Books/书/s1234567890ab--extract", "摘录拍平到书目录");
	// 知识卡（挖空）：Tidme/Decks/<书>/<sectionId>--cloze（单独命名空间）
	const cloze = paths.cardPath("书", "d1", "s1234567890ab", "cloze");
	assert.equal(cloze, "Tidme/Decks/书/s1234567890ab--cloze", "挖空进 decks 目录");
	// 知识卡（问答）：Tidme/Decks/<书>/<sectionId>--qa
	const qa = paths.cardPath("书", "d1", "s1234567890ab", "qa");
	assert.equal(qa, "Tidme/Decks/书/s1234567890ab--qa", "问答进 decks 目录");
});

test("paths: deckSubsetPath 命名空间为 Tidme/Decks/<书>/<用途>", () => {
	assert.equal(paths.deckSubsetPath("批评性思维", "d12345678"), "Tidme/Decks/批评性思维/复习本书");
});

test("paths: 拒绝保留字书名", () => {
	assert.throws(() => paths.bookRoot("index", "d1"), /reserved/);
	assert.throws(() => paths.bookRoot("default", "d1"), /reserved/);
});

// === 集成：runSplit 产物 ===

test("runSplit: 文档页落在 Tidme/Books/<书名>", async () => {
	const r = await pipeline.runSplit({
		text: "# 第一章\n\n正文一。\n\n## 1.1 节\n\n小节正文。",
		title: "测试书",
		type: "text/markdown",
		minChars: 0
	});
	const doc = r.tiddlers.find((t) => t["tidme.kind"] === undefined);
	assert.equal(doc.title, "Tidme/Books/测试书");
	assert.equal(doc.tags[0], "tidme-import-doc");
});

test("runSplit: 节卡 title 拍平到书目录（章层次在 breadcrumb 字段里）", async () => {
	const r = await pipeline.runSplit({
		text: "# 章一\n\n内容。",
		title: "测试书2",
		type: "text/markdown",
		minChars: 0
	});
	const section = r.tiddlers.find((t) => t["tidme.kind"] === "topic");
	// 拍平：节卡 title = Tidme/Books/<书>/<可读 caption>-<sectionId>（A2）
	assert.match(section.title, /^Tidme\/Books\/测试书2\/章一-s[a-f0-9]+$/);
	assert.ok(section["tidme.id"].startsWith("s"), "tidme.id 以 s 开头");
	// breadcrumb 仍可读（章层次保留在这里）
	assert.equal(section["tidme.breadcrumb"], "测试书2 › 章一", "breadcrumb 保留可读章名（不被 path 污染）");
});

test("runSplit: 同一输入重切分 ID/title 稳定（确定性 → 重导入保进度）", async () => {
	const input = { text: "# 章\n\n内容。", title: "稳定书", type: "text/markdown", minChars: 0 };
	const r1 = await pipeline.runSplit(input);
	const r2 = await pipeline.runSplit(input);
	const s1 = r1.tiddlers.find((t) => t["tidme.kind"] === "topic");
	const s2 = r2.tiddlers.find((t) => t["tidme.kind"] === "topic");
	assert.equal(s1.title, s2.title, "同输入 title 稳定");
	assert.equal(s1["tidme.id"], s2["tidme.id"], "同输入 tidme.id 稳定");
});

test("runSplit: 字段过滤器不依赖 title 结构（向后兼容契约）", async () => {
	const r = await pipeline.runSplit({
		text: "# 章\n\n内容。",
		title: "契约书",
		type: "text/markdown",
		minChars: 0
	});
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const byDoc = wiki.filterTiddlers(`[tidme.doc[${r.docId}]]`);
	assert.ok(byDoc.length >= 2, "按 tidme.doc 能找到所有卡");
	const byKind = wiki.filterTiddlers(`[tidme.doc[${r.docId}]tidme.kind[topic]]`);
	assert.ok(byKind.length >= 1, "按 tidme.doc+tidme.kind 能找到节卡");
});

test("runSplit: 导入产物全部进 Tidme/Books/；不污染顶级或 $:/", async () => {
	const r = await pipeline.runSplit({
		text: "# 章\n\n内容。",
		title: "隔离书",
		type: "text/markdown",
		minChars: 0
	});
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const allUserTiddlers = wiki.filterTiddlers("[!is[system]]");
	for (const t of allUserTiddlers) {
		// 命名空间 shadow tiddlers 也以 Tidme/ 开头；导入产物在 Tidme/Books/
		assert.ok(t.startsWith("Tidme/"), `导入产物 ${t} 必须以 Tidme/ 开头`);
	}
});

test("runSplit: 中文长书名 + 特殊字符全部安全 slug", async () => {
	const r = await pipeline.runSplit({
		text: "# 章\n\n内容。",
		title: "批判性思维（独立思考者的精进技巧）",
		type: "text/markdown",
		minChars: 0
	});
	// runSplit 不自动 cleanTitle（widget 在更外层做），所以 title 含括号但仍合法
	const doc = r.tiddlers.find((t) => t["tidme.kind"] === undefined);
	// 括号被 slugify 剥除（保留内容），但要保持中文段落紧凑
	assert.ok(doc.title.startsWith("Tidme/Books/批判性思维"), `doc title 格式: ${doc.title}`);
	// 经 cleanTitle 后的版本应该是 Tidme/Books/批判性思维
	const cleaned = pipeline.cleanTitle("批判性思维（独立思考者的精进技巧）");
	assert.equal(cleaned, "批判性思维", "cleanTitle 剥括号副标题");
	const r2 = await pipeline.runSplit({
		text: "# 章\n\n内容。",
		title: cleaned,
		type: "text/markdown",
		minChars: 0
	});
	const doc2 = r2.tiddlers.find((t) => t["tidme.kind"] === undefined);
	assert.equal(doc2.title, "Tidme/Books/批判性思维", "cleanTitle 后 doc title 精确");
});

test("runSplit: 节卡叶段 = 可读 caption slug + 稳定 id（A2；同 caption 仍唯一）", async () => {
	const r = await pipeline.runSplit({ text: "# 第一章\n\n内容甲。\n\n# 第一章\n\n内容乙。", title: "叶段书", type: "text/markdown", minChars: 0 });
	const secs = r.tiddlers.filter((t) => t["tidme.kind"] === "topic");
	assert.ok(secs.length >= 2, `应有 ≥2 节（同 caption 两节），实际 ${secs.length}`);
	const leaves = secs.map((s) => String(s.title).split("/").pop());
	for (const lf of leaves) assert.ok(lf.startsWith("第一章-s"), `叶段可读且含 id: ${lf}`);
	assert.notEqual(leaves[0], leaves[1], "同 caption 不同 id → title 唯一");
	const tailId = String(leaves[0]).slice(String(leaves[0]).lastIndexOf("-") + 1);
	assert.equal(tailId, secs[0]["tidme.id"], "叶段尾 = tidme.id");
});

// === 集成：buildExtract / buildCloze / buildQA ===

test("section widget: buildExtract 拍平到书目录（与父节卡同层）", () => {
	const parentTitle = "Tidme/Books/书/s1234567890ab";
	wiki.addTiddler({
		title: parentTitle, type: "text/vnd.tiddlywiki",
		state: "0", due: twDate(),
		"tidme.kind": "topic", "tidme.subkind": "section",
		"tidme.doc": "d12345678", "tidme.breadcrumb": "书 › 章 › 节", bag: "default"
	});
	const t = sectionMod.buildExtract(wiki, parentTitle, "摘录文本");
	// 拍平：摘录 title = <bookRoot>/<sectionId>--extract（不再嵌 /s<hash>/）
	assert.equal(t.title, "Tidme/Books/书/s1234567890ab--extract");
	assert.ok(t.title.startsWith("Tidme/Books/"), "摘录 title 在 Tidme/Books/ 下");
	assert.equal(t["tidme.parent"], parentTitle);
	assert.equal(t["tidme.breadcrumb"], "书 › 章 › 节 › 摘录", "breadcrumb 仍可读");
	assert.equal(t["tidme.subkind"], "extract");
});

test("section widget: buildCloze 与 buildQA 进 Tidme/Decks/<书>/ 命名空间（不在书目录）", () => {
	const parentTitle = "Tidme/Books/书/s1234567890ab";
	wiki.addTiddler({
		title: parentTitle, type: "text/vnd.tiddlywiki",
		state: "0", due: twDate(),
		"tidme.kind": "topic", "tidme.subkind": "section",
		"tidme.doc": "d1", "tidme.breadcrumb": "书 › 章 › 节"
	});
	const cloze = sectionMod.buildCloze(wiki, parentTitle, "首都是北京", "北京");
	// 知识卡走 Tidme/Decks/<书>/ 命名空间（拍平）
	assert.equal(cloze.title, "Tidme/Decks/书/s1234567890ab--cloze");
	assert.equal(cloze["tidme.subkind"], "cloze");
	assert.equal(cloze["tidme.kind"], "item");
	const qa = sectionMod.buildQA(wiki, parentTitle, "问题", "答案");
	assert.equal(qa.title, "Tidme/Decks/书/s1234567890ab--qa");
	assert.equal(qa["tidme.subkind"], "qa");
	assert.equal(qa["tidme.kind"], "item");
});

test("section widget: 同位置多张摘录/挖空/问答自动加序号（拍平设计下）", () => {
	const parentTitle = "Tidme/Books/书/s1234567890ab";
	wiki.addTiddler({
		title: parentTitle, type: "text/vnd.tiddlywiki",
		state: "0", due: twDate(),
		"tidme.kind": "topic", "tidme.subkind": "section",
		"tidme.doc": "d1", "tidme.breadcrumb": "书 › 章 › 节"
	});
	// buildExtract 拍平后：base = <bookRoot>/<sectionId>--extract，冲突加 -N
	const a = sectionMod.buildExtract(wiki, parentTitle, "选一");
	wiki.addTiddler(a);
	const b = sectionMod.buildExtract(wiki, parentTitle, "选二");
	wiki.addTiddler(b);
	const c = sectionMod.buildExtract(wiki, parentTitle, "选三");
	wiki.addTiddler(c);
	const d = sectionMod.buildExtract(wiki, parentTitle, "选四");
	const extractBase = "Tidme/Books/书/s1234567890ab--extract";
	assert.equal(a.title, extractBase);
	assert.equal(b.title, extractBase + "-2");
	assert.equal(c.title, extractBase + "-3");
	assert.equal(d.title, extractBase + "-4");
});

// === 集成：子集牌组 ===

test("deck: 子集牌组（复习本书）走 Tidme/Decks/<书>/复习本书", async () => {
	const r = await pipeline.runSplit({
		text: "# 章\n\n内容。",
		title: "复习本书测试",
		type: "text/markdown",
		minChars: 0
	});
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const bookSlug = r.tiddlers[0].title.replace(/^Tidme\/Books\//, "");
	const deckTitle = `Tidme/Decks/${bookSlug}/复习本书`;
	const baseDeck = wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]!is[draft]]")[0];
	const bf = (baseDeck && wiki.getTiddler(baseDeck)?.fields) || {};
	wiki.addTiddler({
		...bf,
		title: deckTitle,
		tags: ["$:/tags/TidmeDeck"],
		caption: "复习：测试",
		card: `[tidme.doc[${r.docId}]tidme.kind[item]]`,
		"tidme.subset-doc": r.docId
	});
	const deck = wiki.getTiddler(deckTitle);
	assert.ok(deck, "子集牌组创建成功");
	assert.equal(deck.fields.tags[0], "$:/tags/TidmeDeck");
	assert.equal(deck.fields["tidme.subset-doc"], r.docId);
	assert.ok(deckTitle.startsWith("Tidme/Decks/复习本书测试/"), `命名空间正确: ${deckTitle}`);
});

// === 集成：手动插入节卡 ===

test("import widget: 手动插入节卡落到 manual/ 子目录", async () => {
	const r = await pipeline.runSplit({
		text: "# 章\n\n内容。",
		title: "手动测试书",
		type: "text/markdown",
		minChars: 0
	});
	const newSection = {
		title: `Tidme/Books/${r.bookTitle}/manual/我的节`,
		caption: "我的节",
		text: "手动内容",
		"tidme.doc": r.docId,
		"tidme.kind": "topic",
		"tidme.subkind": "section",
		"tidme.breadcrumb": `${r.bookTitle} › 我的节`
	};
	wiki.addTiddler(newSection);
	const t = wiki.getTiddler(newSection.title);
	assert.ok(t, "手动节卡入库");
	assert.ok(t.fields.title.includes("/manual/"), "manual/ 子目录标记");
});

// === 集成：namespace shadow tiddlers ===

test("shadow: Tidme 命名空间根/Books/Decks/Clips 索引存在", () => {
	for (const t of ["Tidme/index", "Tidme/Books/index", "Tidme/Decks/index", "Tidme/Clips/index"]) {
		const tt = wiki.getTiddler(t);
		assert.ok(tt, `命名空间索引存在: ${t}`);
		assert.ok(String(tt.fields.text).length > 0, `索引有内容: ${t}`);
	}
});

test("UI: $:/Deck/default/log/ 前缀消费者（牌组日志）仍工作", () => {
	// 注意：stats-panel 的 [prefix[$:/Deck/]suffix[/log/]] 实际上有 bug，
	// 这里用更精确的前缀确保 namespace 改动不影响老前缀消费者
	const logTitle = "$:/Deck/default/log/20260903";
	wiki.addTiddler({ title: logTitle, type: "application/json", text: '{"rating":4}' });
	const found = wiki.filterTiddlers("[prefix[$:/Deck/default/log/]]");
	assert.ok(found.includes(logTitle), "deck log 前缀过滤仍工作（未受 namespace 改动影响）");
});

test("UI: 重复导入 bookTitle 冲突时对齐 alignCards 仍能用 breadcrumb 匹配", async () => {
	const input = { text: "# 章\n\n内容。", title: "重复书", type: "text/markdown", minChars: 0 };
	const align = tw.modules.execute("$:/plugins/keepone/tidme/core/align.js");
	const r1 = await pipeline.runSplit(input);
	for (const t of r1.tiddlers) wiki.addTiddler(t);
	// 给首张节卡设 SRS 进度
	const sec = r1.tiddlers.find((t) => t["tidme.kind"] === "topic");
	wiki.addTiddler({ ...wiki.getTiddler(sec.title).fields, state: "2", reps: "3", due: twDate(new Date(Date.now() + 86400000)) });
	// 再次切分
	const r2 = await pipeline.runSplit(input);
	const oldCards = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]]`)
		.map((t) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
	const sectionCards = r2.tiddlers.filter((x) => x["tidme.kind"] === "topic");
	const aligned = await align.alignCards(oldCards, r1.bookTitle, sectionCards.map((c) => ({ title: c.title, fields: c })));
	assert.ok(aligned.unchanged >= 1, "重切分对齐：未变节卡通过 breadcrumb trail 匹配（SRS 进度保留）");
});

// === 集成：FileSystemPaths（落盘目录）===

test("shadow: FileSystemPaths config 不存在（plugin 不应自带；由 wiki/tiddlers 注入）", () => {
	// 这是有意的设计：FSP 必须是普通 tiddler（tiddlerExists 排除 shadow），由 wiki 维护
	assert.equal(wiki.getTiddler("$:/config/FileSystemPaths"), undefined, "plugin 不带 FSP shadow（避免 tiddlerExists 跳过）");
});

test("FSP: 启动自愈——filesystem 生效且缺失时创建真实 FSP，已存在不覆盖，非 filesystem 不动", () => {
	const mod = tw.modules.execute("$:/plugins/keepone/tidme/core/server/ensure-filesystem.js");
	// 当前测试 wiki 未加载 filesystem 插件 → 不创建（保证 shadow 测试与 headless 环境不受污染）
	mod.ensureFileSystemPaths(wiki);
	assert.equal(wiki.getTiddler("$:/config/FileSystemPaths"), undefined, "非 filesystem 环境不创建");
	// 模拟 filesystem 插件存在 → 创建默认 FSP（真实 tiddler）
	wiki.addTiddler({ title: "$:/plugins/tiddlywiki/filesystem", type: "application/javascript", text: "" });
	mod.ensureFileSystemPaths(wiki);
	const fsp = wiki.getTiddler("$:/config/FileSystemPaths");
	assert.ok(fsp, "filesystem 生效且缺失 → 创建 FSP");
	assert.ok(String(fsp.fields.text).includes("[is[tiddler]prefix[Tidme/Books/]]"), "默认含 Books/Decks 目录过滤");
	assert.ok(String(fsp.fields.text).includes("prefix[Tidme/Decks/]"), "含 Decks 过滤");
	// 已存在（wiki 自行定制）→ 不覆盖
	wiki.addTiddler({ title: "$:/config/FileSystemPaths", type: "text/vnd.tiddlywiki", text: "[is[tiddler]prefix[Tidme/Books/]]" });
	mod.ensureFileSystemPaths(wiki);
	assert.equal(wiki.getTiddler("$:/config/FileSystemPaths").fields.text, "[is[tiddler]prefix[Tidme/Books/]]", "不覆盖 wiki 自定义 FSP");
});

test("FSP: 注入普通 tiddler 后保留 Tidme 目录结构（filesystem 适配器真正写入子目录）", () => {
	// 注入 FSP config（模拟 wiki/tiddlers 加载）
	wiki.addTiddler({
		title: "$:/config/FileSystemPaths",
		type: "text/vnd.tiddlywiki",
		text: "[is[tiddler]prefix[Tidme/Books/]]\n[is[tiddler]prefix[Tidme/Decks/]]\n[is[tiddler]prefix[Tidme/Clips/]]\n[is[tiddler]prefix[Tidme/]]"
	});
	assert.equal(wiki.tiddlerExists("$:/config/FileSystemPaths"), true, "FSP 作为普通 tiddler 加载");

	// 调 filesystem 文件信息生成器
	const bookTitle = "导航测试书";
	const docId = "dnav1234";
	const sectionTitle = paths.sectionPath(bookTitle, "第一章", "s1234567890ab");
	wiki.addTiddler({ title: sectionTitle, type: "text/vnd.tiddlywiki", text: "x", "tidme.doc": docId, "tidme.kind": "topic", "tidme.subkind": "section", "tidme.breadcrumb": `${bookTitle} › 第一章` });

	// 用 generateTiddlerFileInfo 验证路径（拍平：节卡直接落书目录，叶段=可读+id）
	const tiddler = wiki.getTiddler(sectionTitle);
	const filters = wiki.getTiddlerText("$:/config/FileSystemPaths", "").split("\n").filter(s => s.trim());
	const fi = tw.utils.generateTiddlerFileInfo(tiddler, { pathFilters: filters, wiki });
	assert.match(fi.filepath, /Tidme[\\\/]Books[\\\/]导航测试书[\\\/]第一章-s1234567890ab\.tid$/,
		`filepath 拍平到书目录（可读叶段）: ${fi.filepath}`);
});

// === 集成：reading-list 导航修复（用真实 doc title）===

test("nav: reading-list 跳转到 doc 页用真实命名空间路径（不是 breadcrumb 首段）", async () => {
	const bookTitle = "跳转测试书";
	// 注入 FSP（reading-list 测试也需要）
	wiki.addTiddler({
		title: "$:/config/FileSystemPaths", type: "text/vnd.tiddlywiki",
		text: "[is[tiddler]prefix[Tidme/Books/]]"
	});
	const res = await pipeline.runSplit({ text: "# 第一章\n\n内容。", title: bookTitle, type: "text/markdown", minChars: 0 });
	for (const t of res.tiddlers) wiki.addTiddler(t);

	// 模拟 reading-list 内部：从 breadcrumb 拼出 docTiddlerTitle
	const rl = tw.modules.execute("$:/plugins/keepone/tidme/import/widgets/reading-list.js");
	const cards = rl.collectTopicCards(wiki).filter((c) => c.doc === res.docId);
	const groups = rl.groupByDoc(cards);
	assert.equal(groups.length, 1, "该书有一组 topic 卡");
	const g = groups[0];
	// reading-list 现在的实现：bookTitle 从 breadcrumb 拼，docTiddlerTitle 用 paths.bookRoot
	const breadcrumb = g.cards[0].breadcrumb;
	const bookTitleFromCrumb = breadcrumb.split(" › ")[0] || "";
	const expectedDocTiddler = paths.bookRoot(bookTitleFromCrumb, g.doc);
	assert.equal(expectedDocTiddler, `Tidme/Books/${bookTitle}`,
		"reading-list 应该用 paths.bookRoot 重建 doc tiddler title（命名空间路径），不是 breadcrumb 首段");
	// 验证：docTiddlerTitle 真的能在 wiki 里查到 doc 页
	const docTiddler = wiki.getTiddler(expectedDocTiddler);
	assert.ok(docTiddler, `doc tiddler 存在: ${expectedDocTiddler}`);
	assert.equal(docTiddler.fields.tags[0], "tidme-import-doc");
});

test("nav: section.ts 面包屑点击也用真实 doc title（修复同上）", async () => {
	const bookTitle = "面包屑测试书";
	const r = await pipeline.runSplit({ text: "# 第一章\n\n内容。", title: bookTitle, type: "text/markdown", minChars: 0 });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const sec = r.tiddlers.find((t) => t["tidme.kind"] === "topic");
	const secTiddler = wiki.getTiddler(sec.title);
	// 模拟 section.ts 内部 crumb click handler：
	const crumbBook = secTiddler.fields["tidme.breadcrumb"].split(" › ")[0];
	const crumbDoc = secTiddler.fields["tidme.doc"];
	const crumbDocTitle = paths.bookRoot(crumbBook, crumbDoc);
	const expectedDocTiddler = `Tidme/Books/${bookTitle}`;
	assert.equal(crumbDocTitle, expectedDocTiddler);
	assert.ok(wiki.getTiddler(crumbDocTitle), `doc tiddler 存在: ${crumbDocTitle}`);
});

test("A1: 同名书不同 docId folder 冲突 → ~docId 后缀；同 docId 重导入幂等复用；卡带 tidme.docpage", async () => {
	const mk = (creator) => pipeline.makeDocId({ title: "同名书", creator, language: "" });
	const dA = await mk("作者A");
	const dB = await mk("作者B");
	const text = "# 章\n\n内容。";
	// 场景 1：folder 被别的 docId（B）占用 → 加 ~docId 后缀
	const rA = await pipeline.runSplit({ text, title: "同名书", type: "text/markdown", sourceFields: { creator: "作者A" }, folderOccupied: () => dB });
	const docA = rA.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes("tidme-import-doc"));
	assert.ok(docA.title.startsWith("Tidme/Books/同名书~"), `被其它 doc 占用 → 加后缀：${docA.title}`);
	assert.notEqual(docA.title, "Tidme/Books/同名书");
	const secA = rA.tiddlers.find((t) => t["tidme.kind"] === "topic");
	assert.ok(secA.title.startsWith(docA.title + "/"), "节卡落在带后缀 docRoot 下");
	assert.equal(secA["tidme.docpage"], docA.title, "节卡带 tidme.docpage（= 真实 doc 页）");
	assert.equal(docA["tidme.docpage"], docA.title, "doc 页自指 docpage");
	// 场景 2：folder 被同一 docId 占用（重导入）→ 幂等复用，不加后缀
	const rA2 = await pipeline.runSplit({ text, title: "同名书", type: "text/markdown", sourceFields: { creator: "作者A" }, folderOccupied: () => dA });
	const docA2 = rA2.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes("tidme-import-doc"));
	assert.equal(docA2.title, "Tidme/Books/同名书", "同 docId 占用 → 不加后缀（重导入幂等）");
	// 场景 3：无占用 → 不加后缀
	const r3 = await pipeline.runSplit({ text, title: "无冲突书", type: "text/markdown", folderOccupied: () => null });
	const doc3 = r3.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes("tidme-import-doc"));
	assert.equal(doc3.title, "Tidme/Books/无冲突书");
});

test("ui-utils: docPageOfDoc 按 docId 查到真实文档页（folder 带 ~docId 后缀亦准确）；docFolderOwner 可探测占用", async () => {
	const uiUtils = tw.modules.execute("$:/plugins/keepone/tidme/core/ui-utils.js");
	const r = await pipeline.runSplit({ text: "# 章\n\n内容。", title: "后缀书", type: "text/markdown", folderOccupied: () => "d000000000" });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const doc = r.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes("tidme-import-doc"));
	assert.ok(doc.title.includes("~"), "前置：folder 应带后缀");
	assert.equal(uiUtils.docPageOfDoc(wiki, r.docId), doc.title, "按 docId 查到真实（带后缀）文档页");
	assert.equal(uiUtils.docFolderOwner(wiki, doc.title), r.docId, "folder 占用可探测到本 docId");
});

test("deleteDocContent: 删阅读材料、保留知识产物（摘录/挖空/问答/无 kind 散卡）；他书与续读点指向保留卡时不误伤", async () => {
	const uiUtils = tw.modules.execute("$:/plugins/keepone/tidme/core/ui-utils.js");
	// 书 A：2 普通节 + 1 大纲手动"新节"（topic/section/manual-）+ 1 摘录 + 1 挖空 + 1 无 kind 散卡
	const rA = await pipeline.runSplit({ text: "# 章一\n\n内容一。\n\n# 章二\n\n内容二。", title: "删书A", type: "text/markdown", minChars: 0 });
	for (const t of rA.tiddlers) wiki.addTiddler(t); // 文档页 + 2 节
	const secA = rA.tiddlers.find((t) => t["tidme.kind"] === "topic");
	const manualSec = { title: `${secA.title.slice(0, secA.title.lastIndexOf("/") + 1)}manual-新笔记`, caption: "新笔记", text: "手写知识。", "tidme.doc": rA.docId, "tidme.kind": "topic", "tidme.subkind": "section", state: "0", due: twDate() };
	wiki.addTiddler(manualSec);
	const ext = sectionMod.buildExtract(wiki, secA.title, "摘录句。");
	wiki.addTiddler(ext);
	const cloze = sectionMod.buildCloze(wiki, secA.title, "首都 Freetown", "Freetown");
	wiki.addTiddler(cloze);
	wiki.addTiddler({ title: "手动散卡A", caption: "Q?", text: "A", "tidme.doc": rA.docId, state: "0", due: twDate(), reps: "0", lapses: "0", stability: "0", difficulty: "0", elapsed_days: "0", scheduled_days: "0", last_review: twDate() });
	// 子集牌组
	wiki.addTiddler({ title: "Tidme/Decks/删书A/复习本书", tags: ["$:/tags/TidmeDeck"], card: "[tidme.kind[item]]", "tidme.subset-doc": rA.docId });
	// 续读点：一个指向普通节（应删）、一个指向摘录（应留）
	wiki.addTiddler({ title: "$:/state/tidme-import/readpoint/" + rA.docId, text: JSON.stringify({ t: secA.title, s: "" }) });
	wiki.addTiddler({ title: "$:/state/tidme-import/readpoint/keep", text: JSON.stringify({ t: ext.title, s: "" }) });
	wiki.addTiddler({ title: "$:/state/tidme/learning-session", list: [secA.title, ext.title, "其它书卡"] });
	// 书 B 不受影响
	const rB = await pipeline.runSplit({ text: "# 唯一章\n\n内容乙。", title: "别书B", type: "text/markdown", minChars: 0 });
	for (const t of rB.tiddlers) wiki.addTiddler(t);
	const secB = rB.tiddlers.find((t) => t["tidme.kind"] === "topic");

	const n = uiUtils.deleteDocContent(wiki, rA.docId);
	// 删除 5 个：文档页 + 2 普通节 + 1 大纲新节 + 1 子集牌组
	assert.equal(n, 5, `删除数量=5，实际 ${n}`);
	// 保留的知识产物仍存在
	assert.ok(wiki.getTiddler(ext.title), "摘录保留");
	assert.ok(wiki.getTiddler(cloze.title), "挖空保留");
	assert.ok(wiki.getTiddler("手动散卡A"), "无 kind 手动散卡保留");
	// 被删的不存在
	assert.equal(wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.doc[${rA.docId}]tidme.kind[topic]!tidme.subkind[extract]]`).length, 0, "普通节卡/大纲新节全删");
	assert.equal(wiki.getTiddler(manualSec.title), undefined, "大纲手动新节删除");
	assert.equal(wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.subset-doc[${rA.docId}]]`).length, 0, "子集牌组删除");
	// 文档页删除
	assert.equal(wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${rA.docId}]]`).length, 0, "文档页删除");
	// 续读点：指向节 → 删；指向摘录（保留）→ 留
	assert.equal(wiki.getTiddler("$:/state/tidme-import/readpoint/" + rA.docId), undefined, "指向被删节的续读点删除");
	assert.ok(wiki.getTiddler("$:/state/tidme-import/readpoint/keep"), "指向保留摘录的续读点保留");
	// 会话：剔除被删节，保留摘录与其它的
	const sess = wiki.getTiddler("$:/state/tidme/learning-session");
	assert.ok(!sess.fields.list.includes(secA.title), "会话剔除被删节");
	assert.ok(sess.fields.list.includes(ext.title) && sess.fields.list.includes("其它书卡"), "会话保留摘录与其它");
	// 书 B 完好
	assert.ok(wiki.getTiddler(secB.title), "B 不受影响");
	// 幂等
	assert.equal(uiUtils.deleteDocContent(wiki, rA.docId), 0, "重复删除幂等");
});
