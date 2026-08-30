/*
semantic-split.test.mjs — 语义切分（M6-T2）单元测试（node:test）

覆盖：无结构判断、段落提取、LLM 响应解析（容错）、prompt 构造、虚拟标题插入（偏移稳定）、
prepareText 主流程（启用/未启用/LLM 失败回退，网络层注入 mock）。
纯逻辑测试，不依赖 TW。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const sem = require_("../src/tidme/core/server/semantic-split.js");

test("isUnstructured: 区分无标题散文与有结构文本", () => {
	assert.equal(sem.isUnstructured("第一段。\n\n第二段。\n\n第三段。"), true, "纯散文");
	assert.equal(sem.isUnstructured("# 标题\n\n内容。"), false, "markdown ATX");
	assert.equal(sem.isUnstructured("标题\n====\n\n内容。"), false, "markdown setext");
	assert.equal(sem.isUnstructured("! 标题\n\n内容。"), false, "wikitext ! 标题");
	assert.equal(sem.isUnstructured("<h1>标题</h1>\n\n内容。"), false, "HTML h1");
});

test("extractParagraphs: 空行分段 + 原文偏移", () => {
	const text = "第一段。\n\n第二段。\n\n第三段。";
	const paras = sem.extractParagraphs(text);
	assert.equal(paras.length, 3);
	assert.equal(paras[0].text, "第一段。");
	assert.equal(paras[1].start, 6);
	assert.equal(paras[2].start, 12);
});

test("parseBreaksResponse: 容忍 json 包裹 / 前后文字 / 非法值", () => {
	assert.deepEqual(sem.parseBreaksResponse("[2, 5, 1]", 10), [1, 2, 5]);
	assert.deepEqual(sem.parseBreaksResponse("```json\n[3]\n```", 10), [3]);
	assert.deepEqual(sem.parseBreaksResponse("结果如下 [0, 4] 请参考", 10), [0, 4]);
	assert.deepEqual(sem.parseBreaksResponse("[]", 10), []);
	assert.deepEqual(sem.parseBreaksResponse("无法判断", 10), [], "非 JSON 容错");
	assert.deepEqual(sem.parseBreaksResponse("[2, 2, -1, 99, 2]", 5), [2], "去重 + 越界过滤");
});

test("buildPrompt: 含段落编号与要求", () => {
	const prompt = sem.buildPrompt([{ text: "甲" }, { text: "乙" }]);
	assert.ok(prompt.includes("0: 甲") && prompt.includes("1: 乙"), "含编号段落");
	assert.ok(prompt.includes("JSON 数组"), "要求 JSON 输出");
});

test("insertVirtualHeadings: 断点前插虚拟标题（偏移稳定）", () => {
	const text = "第一段。\n\n第二段。\n\n第三段。";
	const paras = sem.extractParagraphs(text);
	const r = sem.insertVirtualHeadings(text, paras, [2], 10);
	assert.equal(r.virtual, 1);
	assert.ok(r.text.includes("## 第三段"), "断点段前插标题");
	// 插入后虚拟标题成为独立段（原 3 段 + 1 标题段 = 4 段）
	const after = sem.extractParagraphs(r.text);
	assert.equal(after.length, 4, "虚拟标题成为独立段");
	const texts = after.map((p) => p.text);
	assert.ok(texts.includes("## 第三段"), "标题段存在");
	assert.ok(texts.includes("第三段。"), "正文内容保留");
	// 多个断点从后往前插
	const r2 = sem.insertVirtualHeadings(text, paras, [1, 2], 10);
	assert.equal(r2.virtual, 2);
	const after2 = sem.extractParagraphs(r2.text);
	const texts2 = after2.map((p) => p.text);
	assert.ok(texts2.some((t) => t.startsWith("## 第二段")), "第二段前插标题");
	assert.ok(texts2.some((t) => t.startsWith("## 第三段")), "第三段前插标题");
});

test("prepareText: 未启用 / 非无结构 → 原样返回", async () => {
	const r1 = await sem.prepareText("甲。\n\n乙。\n\n丙。", {});
	assert.equal(r1.usedBreaks, 0);
	assert.equal(r1.text, "甲。\n\n乙。\n\n丙。");
	const r2 = await sem.prepareText("# 有标题\n\n内容。", { enable: true, apiKey: "k" });
	assert.equal(r2.usedBreaks, 0);
});

test("prepareText: LLM 断点 → 虚拟标题（网络层注入 mock）", async () => {
	const cfg = { enable: true, apiKey: "sk-test", model: "m", baseUrl: "https://x/v1" };
	const httpFn = async (url, body, headers) => {
		assert.ok(url.includes("/chat/completions"), "OpenAI 兼容端点");
		assert.equal(headers.Authorization, "Bearer sk-test", "密钥进请求头");
		const req = JSON.parse(body);
		assert.ok(req.messages[0].content.includes("0: "), "prompt 含段落");
		return { status: 200, data: JSON.stringify({ choices: [{ message: { content: "[2, 5]" } }] }) };
	};
	const text = ["甲段内容。", "乙段内容。", "丙段内容。", "丁段内容。", "戊段内容。", "己段内容。"].join("\n\n");
	const r = await sem.prepareText(text, cfg, httpFn);
	assert.equal(r.usedBreaks, 2);
	assert.ok(r.text.includes("## "), "插入虚拟标题");
});

test("prepareText: LLM 失败 → 静默回退机械切分", async () => {
	const cfg = { enable: true, apiKey: "sk-test" };
	const httpFn = async () => { throw new Error("网络错误"); };
	const text = "甲。\n\n乙。\n\n丙。\n\n丁。";
	const r = await sem.prepareText(text, cfg, httpFn);
	assert.equal(r.usedBreaks, 0);
	assert.equal(r.text, text, "失败原样返回");
});

test("prepareText: LLM 非 200 → 回退", async () => {
	const cfg = { enable: true, apiKey: "sk-test" };
	const httpFn = async () => ({ status: 429, data: "rate limited" });
	const text = "甲。\n\n乙。\n\n丙。\n\n丁。";
	const r = await sem.prepareText(text, cfg, httpFn);
	assert.equal(r.usedBreaks, 0);
	assert.equal(r.text, text);
});
