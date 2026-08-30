/*
stats.test.mjs — core 统计聚合单元测试（node:test）
*/
import { test } from "node:test";
import assert from "node:assert/strict";

const stats = await import("../src/tidme/core/stats.ts");

const T = (offsetHours) => {
	const d = new Date(Date.now() + offsetHours * 3600000);
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
};

test("deckLoad: new/learn/due/overdue 分类", () => {
	const cards = [
		{ title: "新卡", fields: { tags: ["?"], state: "0", due: T(48) } },
		{ title: "学习中", fields: { tags: ["?"], state: "1", due: T(-1) } },
		{ title: "到期", fields: { tags: ["?"], state: "2", due: T(6) } },
		{ title: "逾期", fields: { tags: ["?"], state: "2", due: T(-24) } },
		{ title: "已出队", fields: { tags: ["."], state: "2", due: T(-24) } },
		{ title: "搁置", fields: { tags: ["?"], state: "2", due: T(-24), "tidme.suspended": "yes" } }
	];
	const load = stats.deckLoad(cards);
	assert.equal(load.total, 6);
	assert.equal(load.newCount, 1);
	assert.equal(load.learn, 1);
	assert.equal(load.due, 2); // 到期+逾期（已出队/搁置排除）
	assert.equal(load.overdue, 1);
});

test("docProgress: 已读/剩余", () => {
	const sections = [
		{ title: "A", fields: { tags: ["?", "."] } },
		{ title: "B", fields: { tags: ["?"] } },
		{ title: "C", fields: { tags: ["."] } } // 已读
	];
	assert.deepEqual(stats.docProgress(sections), { total: 3, done: 1, left: 2 });
});

test("retentionFromLogs: 保留率 ≈ 1 - Again 占比", () => {
	const r = stats.retentionFromLogs([{ rating: 1 }, { rating: 3 }, { rating: 4 }, { rating: 3 }]);
	assert.equal(r.reviews, 4);
	assert.equal(r.retention, 0.75);
	assert.equal(stats.retentionFromLogs([]).retention, 1);
});

test("funnelCounts: 漏斗分层", () => {
	const items = [
		{ title: "文档", fields: { tags: ["tidme-import-doc"], "tidme.kind": undefined } },
		{ title: "节", fields: { "tidme.kind": "section" } },
		{ title: "节2", fields: { "tidme.kind": "section" } },
		{ title: "摘录", fields: { "tidme.kind": "extract" } },
		{ title: "挖空", fields: { "tidme.kind": "cloze" } }
	];
	assert.deepEqual(stats.funnelCounts(items), { docs: 1, sections: 2, extracts: 1, cards: 1 });
});

test("priorityBuckets: 分桶", () => {
	const cards = [
		{ title: "A", fields: { "tidme.priority": "10" } },
		{ title: "B", fields: { "tidme.priority": "90" } },
		{ title: "C", fields: { "tidme.priority": "50" } },
		{ title: "D", fields: {} }
	];
	const b = stats.priorityBuckets(cards);
	assert.equal(b.high, 1);
	assert.equal(b.medium, 1);
	assert.equal(b.low, 1);
	assert.equal(b.none, 1);
});

test("formatDuration: 格式化时间", () => {
	assert.equal(stats.formatDuration(15), "15 秒");
	assert.equal(stats.formatDuration(120), "2 分钟");
	assert.equal(stats.formatDuration(330), "5 分 30 秒");
	assert.equal(stats.formatDuration(3600), "1 小时");
	assert.equal(stats.formatDuration(3720), "1 小时 2 分");
});

test("recordReadTime and getReadTimeStats: 记录与获取阅读时长", () => {
	const store = new Map();
	const mockWiki = {
		getTiddlerText: (title) => store.get(title) || "",
		addTiddler: (t) => store.set(t.title, t.text)
	};

	stats.recordReadTime(mockWiki, "doc-1", 120);
	stats.recordReadTime(mockWiki, "doc-1", 60);
	stats.recordReadTime(mockWiki, "doc-2", 300);

	const res = stats.getReadTimeStats(mockWiki);
	assert.equal(res.totalSeconds, 480);
	assert.equal(res.todaySeconds, 480);
	assert.equal(res.docSeconds["doc-1"], 180);
	assert.equal(res.docSeconds["doc-2"], 300);
});
