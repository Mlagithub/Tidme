/*
core/session.ts — 学习会话（$:/state/tidme/learning-session）读写与推进（M1 单一实现）

背景：学习会话曾被 section-bar / workflow / startstudy.tid / repeat.tid 各自
读写与推进，语义分叉导致 1:1 死循环、首卡 unfold 等回归。
本模块是会话的唯一读写口；推进统一用 core/scheduler.nextSchedulable。
- 注意：跨 core 模块引用一律显式 require("$:/plugins/keepone/tidme/core/<x>.js")，
  不要用 ES import（会被 esbuild 内联复制，造成同实现多处）。
*/

declare function require(module: string): any;
const sched = require("$:/plugins/keepone/tidme/core/scheduler.js");

export const SESSION_TIDDLER = "$:/state/tidme/learning-session";

export interface LearningSession {
	list: string[];
	mode?: string;
	currentIndex?: string;
}

/** 读会话（无/损坏返回 null） */
export function getSession(wiki: any): LearningSession | null {
	if (!wiki || typeof wiki.getTiddler !== "function") return null;
	const f = wiki.getTiddler(SESSION_TIDDLER)?.fields;
	if (!f) return null;
	const list = Array.isArray(f.list) ? [...f.list] : String(f.list || "").split(" ").filter(Boolean);
	if (!list.length) return null;
	return {
		list,
		mode: f.mode !== undefined ? String(f.mode) : undefined,
		currentIndex: f.current_index !== undefined ? String(f.current_index) : undefined
	};
}

/** 写会话（list 为空数组时不建/清空） */
export function setSession(wiki: any, session: { list: string[]; mode?: string; currentIndex?: string }): void {
	if (!wiki || typeof wiki.addTiddler !== "function") return;
	const fields: Record<string, any> = { title: SESSION_TIDDLER, list: session.list };
	if (session.mode !== undefined) fields.mode = session.mode;
	if (session.currentIndex !== undefined) fields.current_index = session.currentIndex;
	wiki.addTiddler(fields);
}

/** 从会话移除指定卡（不在则无操作）。返回是否移除 */
export function removeFromSession(wiki: any, title: string): boolean {
	const s = getSession(wiki);
	if (!s) return false;
	const next = s.list.filter((t) => t !== title);
	if (next.length === s.list.length) return false;
	setSession(wiki, { list: next, mode: s.mode, currentIndex: s.currentIndex });
	return true;
}

/** 清空会话 */
export function clearSession(wiki: any): void {
	if (!wiki || typeof wiki.deleteTiddler !== "function") return;
	wiki.deleteTiddler(SESSION_TIDDLER);
}

/**
 * 会话内推进：从当前卡之后找下一张"当前可学"的卡（cur 为 null/不在会话时从头找）。
 * canLearn 缺省 = scheduler.isDueNow（未出队且 due≤now，与阅读流/复习流一致）。
 * 注意：cur 之后找（不回选 cur 之前的滞留卡）——这是与旧 startstudy"从头找"的
 * 语义统一点（曾导致未处理卡被反复拉回的 1:1 死循环）。
 */
export function advanceSession(
	wiki: any,
	cur: string | null,
	canLearn?: (title: string) => boolean
): string | null {
	const s = getSession(wiki);
	if (!s) return null;
	const learn = canLearn
		? canLearn
		: (t: string) => {
				const f = wiki.getTiddler(t);
				return f ? sched.isDueNow(f.fields) : false;
			};
	return sched.nextSchedulable(s.list, cur, learn);
}
