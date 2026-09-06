/*
bin-core.test.mjs — bin 产物内 core 模块回归（经 tw.modules.execute 加载产物而非源码）

与 unit/scheduler.test.mjs 互补：那边测源码逻辑，这边保证打包产物中行为一致。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPlugin } from "../helpers/tw-boot.mjs";

const { wiki, mod } = bootPlugin({ prefix: "tidme-bin-core-" });
const sched = mod("core/scheduler.js");
const pipeline = mod("import/pipeline.js");
const sem = mod("core/server/semantic-split");

test("scheduler: 优先级混合队列排序 sortPriorityMixedQueue", () => {
	const c1 = { title: "高优先远到期", fields: { "tidme.priority": "10", due: "20260101000000000" } };
	const c2 = { title: "低优先近逾期", fields: { "tidme.priority": "80", due: "20260105000000000" } };
	const cards = [c2, c1];

	const pf = sched.sortPriorityMixedQueue(cards, "priority-first");
	assert.equal(pf[0].title, "高优先远到期", "priority-first 应先按优先级");

	const df = sched.sortPriorityMixedQueue(cards, "due-first");
	assert.equal(df[0].title, "高优先远到期", "due-first 按到期时间");

	const hb = sched.sortPriorityMixedQueue(cards, "hybrid");
	assert.ok(hb.length === 2, "hybrid 模式正常排序");
});

test("scheduler: 过载自动顺延 autoPostpone 门槛触发", () => {
	const overdueCards = [
		{ title: "卡1", fields: { due: "20200101000000000", "tidme.kind": "item", "tidme.priority": "80" } },
		{ title: "卡2", fields: { due: "20200101000000000", "tidme.kind": "item", "tidme.priority": "70" } }
	];
	// 当 maxOverdueThreshold = 5 时，未达到 5 张逾期，不触发顺延
	const resUnder = sched.autoPostpone(overdueCards, { maxOverdueThreshold: 5 });
	assert.equal(resUnder.patches.length, 0, "未超阈值不发生顺延");

	// 当 maxOverdueThreshold = 1 时，超过阈值，触发顺延
	const resOver = sched.autoPostpone(overdueCards, { maxOverdueThreshold: 1, keepTop: 1, maxPriority: 60 });
	assert.equal(resOver.patches.length, 1, "超阈值顺延 1 张卡");
});

test("pipeline: cleanTitle 剔除冗余副标题与括号说明", () => {
	const rawTitle = "批判性思维与说服性写作：独立思考者的精进技巧（通过25种思维练习、30项写作训练，让你更具备思辨力和创造性, 实现独立思考和写作精进）";
	const cleaned = pipeline.cleanTitle(rawTitle);
	assert.equal(cleaned, "批判性思维与说服性写作", "成功剥离副标题与括号营销说明");
});

test("server: splitSectionText LLM 二次切片且 100% 保持字数完全相同", async () => {
	const sampleText = "第一段正文内容用来测试字符偏移定位。\n\n第二段正文分析实验结果。\n\n第三段正文给出分析结论。";
	const mockHttp = async () => ({
		status: 200,
		data: JSON.stringify({
			choices: [{ message: { content: '[{"breakIndex": 0, "title": "概论"}, {"breakIndex": 1, "title": "实验"}, {"breakIndex": 2, "title": "结论"}]' } }]
		})
	});
	const chunks = await sem.splitSectionText(sampleText, { enable: true, apiKey: "test" }, mockHttp);
	assert.equal(chunks.length, 3, "成功切分为 3 个带语义标题子卡");
	const sumChars = chunks.reduce((n, c) => n + c.text.length, 0);
	assert.equal(sumChars, sampleText.length, "切分前后字数 100% 完全一致（0 字损耗）");
});
