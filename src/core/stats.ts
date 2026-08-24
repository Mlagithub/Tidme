/*
stats.ts — 统计聚合（M5-T4，纯函数）

- deckLoad：牌组负载（total / new / learn / due / overdue）
- docProgress：文档进度（已读 / 剩余）
- retentionFromLogs：从复习日志估算保留率（1 - Again 占比）
- funnelCounts：漏斗（导入文档 / Section / 摘录 / 卡）

review log 行格式（fsrs4tw repeat 写入 $:/Deck/<deck>/log/YYYY0MMDD，index=时间）：
  { rating: 1-4, elapsed_days, scheduled_days, review, state }
*/

import { parseTwDate, normalizePriority } from "./scheduler.ts";

export interface CardLike { title: string; fields: Record<string, any> }

export interface DeckLoad {
	total: number;
	learn: number;   // state 1/3（learning/relearning）
	due: number;     // state 2 且 due <= now
	overdue: number; // state 2 且 due < now
	newCount: number; // 无 state 或 state 0
}

export function deckLoad(cards: CardLike[], now = new Date()): DeckLoad {
	const load: DeckLoad = { total: cards.length, learn: 0, due: 0, overdue: 0, newCount: 0 };
	for (const c of cards) {
		const f = c.fields;
		if (Array.isArray(f.tags) && !f.tags.includes("?")) continue; // 已出队
		if (f["tidme.suspended"] === "yes") continue;
		const state = String(f.state || "0");
		if (state === "1" || state === "3") load.learn++;
		else if (state === "2") {
			load.due++;
			if (parseTwDate(f.due).getTime() < now.getTime()) load.overdue++;
		} else load.newCount++;
	}
	return load;
}

export interface DocProgress { total: number; done: number; left: number }

/** 文档进度：done = 已移出队列（无 ? 标签） */
export function docProgress(sections: CardLike[]): DocProgress {
	const total = sections.length;
	const done = sections.filter((c) => !(Array.isArray(c.fields.tags) && c.fields.tags.includes("?"))).length;
	return { total, done, left: total - done };
}

export interface Retention { reviews: number; againRate: number; retention: number }

/** 从复习日志估算保留率（简化：1 - Again 占比） */
export function retentionFromLogs(logEntries: Array<{ rating?: number | string }>): Retention {
	if (!logEntries.length) return { reviews: 0, againRate: 0, retention: 1 };
	let again = 0;
	for (const e of logEntries) {
		const r = Number(e.rating);
		if (r === 1) again++;
	}
	const againRate = again / logEntries.length;
	return { reviews: logEntries.length, againRate, retention: 1 - againRate };
}

export interface Funnel {
	docs: number;
	sections: number;
	extracts: number;
	cards: number;
}

/** 漏斗：文档 / Section / 摘录 / 问答挖空卡（按 tidme.kind） */
export function funnelCounts(items: CardLike[]): Funnel {
	const f: Funnel = { docs: 0, sections: 0, extracts: 0, cards: 0 };
	for (const c of items) {
		const kind = String(c.fields["tidme.kind"] || "");
		if (kind === "extract") f.extracts++;
		else if (kind === "qa" || kind === "cloze") f.cards++;
		else if (kind === "section") f.sections++;
		else if (Array.isArray(c.fields.tags) && c.fields.tags.includes("tidme-import-doc")) f.docs++;
	}
	return f;
}

/** 按优先级分桶（供排序展示） */
export function priorityBuckets(cards: CardLike[]): { high: number; medium: number; low: number; none: number } {
	const b = { high: 0, medium: 0, low: 0, none: 0 };
	for (const c of cards) {
		const p = normalizePriority(c.fields["tidme.priority"]);
		if (c.fields["tidme.priority"] === undefined) b.none++;
		else if (p <= 33) b.high++;
		else if (p <= 66) b.medium++;
		else b.low++;
	}
	return b;
}
