/*
scheduler.ts — 调度体系（M4，对标 SuperMemo 优先级）

- 优先级：tidme.priority 0–100（0 最高）；normalizePriority 归一化
- 批量操作：postpone / advance / ignore / suspend / resume / forget（返回字段补丁）
- autoPostpone：按优先级顺延低优先级逾期卡（保留 top N 高优先级）
- 子集队列：subsetQueue 组合"deck 过滤 + 子集过滤器"

所有函数纯字段操作（无 $tw 依赖），返回 { title, fields } 补丁由调用方写入。
*/

export const PRIORITY_DEFAULT = 50;
export const PRIORITY_TIERS = { high: 10, medium: 50, low: 90 } as const;

/** 归一化优先级：非法值回默认 50 */
export function normalizePriority(v: unknown): number {
	if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.min(100, Math.round(v)));
	if (typeof v === "string" && v.trim() !== "") {
		const n = parseInt(v, 10);
		if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
	}
	return PRIORITY_DEFAULT;
}

/** 三档选择 → 区间随机值（导入时分散，避免同批材料挤在同一队列位置，对应 SM 优先级分散） */
export function tierRandom(tier: keyof typeof PRIORITY_TIERS, spread = 8): number {
	const base = PRIORITY_TIERS[tier];
	return Math.max(0, Math.min(100, base + Math.round((Math.random() - 0.5) * 2 * spread)));
}

/** TW 日期串（YYYYMMDDhhmmssmmm 17 位）→ Date；非法回退 now */
export function parseTwDate(v: unknown, fallback = new Date()): Date {
	const s = String(v || "");
	if (/^\d{17}$/.test(s)) {
		const d = new Date(
			Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)),
			Number(s.slice(8, 10)), Number(s.slice(10, 12)), Number(s.slice(12, 14)), Number(s.slice(14, 17))
		);
		return Number.isNaN(d.getTime()) ? fallback : d;
	}
	const p = Date.parse(s);
	return Number.isNaN(p) ? fallback : new Date(p);
}

function addDays(d: Date, days: number): Date {
	return new Date(d.getTime() + days * 86400000);
}

function twDate(d: Date): string {
	const p = (n: number, l: number) => String(n).padStart(l, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1, 2)}${p(d.getDate(), 2)}${p(d.getHours(), 2)}${p(d.getMinutes(), 2)}${p(d.getSeconds(), 2)}${p(d.getMilliseconds(), 3)}`;
}

export interface CardLike { title: string; fields: Record<string, any> }
export interface Patch { title: string; fields: Record<string, any> }

function tagsOf(fields: Record<string, any>): string[] {
	return Array.isArray(fields.tags) ? [...fields.tags] : [];
}

/** 顺延：due 推后 byDays 天（相对当前 due 或 now） */
export function postponeCard(fields: Record<string, any>, byDays = 7): Record<string, any> {
	const base = parseTwDate(fields.due);
	return { due: twDate(addDays(base, byDays)) };
}

/** 提前：due = 今天（强制复习） */
export function advanceCard(): Record<string, any> {
	return { due: twDate(new Date()) };
}

/** 忽略：移出学习队列（去 ? 标签，保留内容） */
export function ignoreCard(fields: Record<string, any>): Record<string, any> {
	return { tags: tagsOf(fields).filter((t) => t !== "?") };
}

/** 搁置：tidme.suspended=yes（配合 deck card_exclude 过滤器） */
export function suspendCard(): Record<string, any> {
	return { "tidme.suspended": "yes" };
}

export function resumeCard(): Record<string, any> {
	return { "tidme.suspended": undefined };
}

/** 遗忘：回到新卡（state=0，清空调度） */
export function forgetCard(): Record<string, any> {
	const t = twDate(new Date());
	return {
		state: "0", reps: "0", lapses: "0", stability: "0", difficulty: "0",
		elapsed_days: "0", scheduled_days: "0", due: t, last_review: t
	};
}

/**
 * Done（已读）：移出学习队列 = 去 ?（默认牌组）与 .（阅读牌组）+ tidme.done 标记。
 * 自动牌组按 tidme.doc + tag[?] 过滤，同样出队。完全可逆（resumeCard）。
 */
export function doneCard(fields: Record<string, any>): Record<string, any> {
	return {
		...fields,
		tags: tagsOf(fields).filter((t) => t !== "?" && t !== "."),
		"tidme.done": "yes"
	};
}

/** 恢复队列（Done 的可逆反操作）：按 kind 补回 ?/./去 tidme.done 与搁置标记 */
export function restoreCard(fields: Record<string, any>): Record<string, any> {
	const kind = String(fields["tidme.kind"] || "");
	const tags = tagsOf(fields);
	if (!tags.includes("?")) tags.push("?");
	if (kind === "section" && !tags.includes(".")) tags.push(".");
	const out: Record<string, any> = { ...fields, tags };
	delete out["tidme.done"];
	delete out["tidme.suspended"];
	return out;
}

export interface AutoPostponeOptions {
	/** 逾期卡中超过该优先级（数值更大=更低优先）的才顺延 */
	maxPriority?: number;
	/** 顺延天数 */
	postponeDays?: number;
	/** 始终保留的高优先级卡数（按优先级升序取前 N） */
	keepTop?: number;
}

export interface AutoPostponeResult {
	patches: Patch[];
	stats: { overdue: number; postponed: number; kept: number };
}

/**
 * auto-postpone：对逾期卡按优先级排序，保留 top N 高优先级，其余低优先级顺延。
 * 对应 SM auto-postpone（低优先级积压自动顺延，高优先级不受影响）。
 * @param cards 候选卡（fields 含 due / tidme.priority / tidme.suspended）
 */
export function autoPostpone(cards: CardLike[], opts: AutoPostponeOptions = {}): AutoPostponeResult {
	const maxPriority = opts.maxPriority ?? 60;
	const postponeDays = opts.postponeDays ?? 7;
	const keepTop = opts.keepTop ?? 10;
	const now = Date.now();

	const overdue = cards
		.filter((c) => {
			const f = c.fields;
			if (f["tidme.suspended"] === "yes") return false;
			if (Array.isArray(f.tags) && !f.tags.includes("?")) return false; // 已移出队列
			return parseTwDate(f.due, new Date(0)).getTime() < now;
		})
		.sort((a, b) => {
			const pa = normalizePriority(a.fields["tidme.priority"]);
			const pb = normalizePriority(b.fields["tidme.priority"]);
			if (pa !== pb) return pa - pb; // 0（高）在前
			return parseTwDate(a.fields.due).getTime() - parseTwDate(b.fields.due).getTime();
		});

	const kept = overdue.slice(0, keepTop);
	const postponable = overdue
		.slice(keepTop)
		.filter((c) => normalizePriority(c.fields["tidme.priority"]) >= maxPriority);

	return {
		patches: postponable.map((c) => ({ title: c.title, fields: postponeCard(c.fields, postponeDays) })),
		stats: { overdue: overdue.length, postponed: postponable.length, kept: kept.length }
	};
}

/**
 * 子集队列：deck 过滤 + 子集过滤（按书/标签）→ 学习队列（供子集复习）。
 * @param deckQueueFilter deck 的 queue 过滤器（core deck-engine 产出）
 * @param subsetFilter 子集过滤器，如 [tag[书]]
 * @param evaluate 过滤器求值函数
 */
export function subsetQueue(
	deckQueueFilter: string,
	subsetFilter: string,
	evaluate: (filter: string) => string[]
): string[] {
	return evaluate(`${deckQueueFilter} +[subfilter<subset>]`.replace("<subset>", subsetFilter));
}

/** 子集过滤器构造：按 doc 或标签 */
export function subsetByDoc(docId: string): string {
	return `[tidme.doc[${docId}]]`;
}
export function subsetByTag(tag: string): string {
	return `[tag[${tag}]]`;
}
