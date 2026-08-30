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

/**
 * 复习流（item 类）的 kind 过滤片段（分类对齐 SuperMemo：Topic=阅读 / Item=测试）。
 * topic（阅读流）不进主动复习流；item（复习流）进默认牌组。
 * 拼进 deck card / 子集过滤器，如 `[all[...]tidme.kind[item]] <ITEM_FILTER>`。
 * 注：无 kind 的手动卡由默认牌组 card 过滤器的兜底分支收录（has[state]has[due]），不在此处。
 */
export const ITEM_FILTER = `[tidme.kind[item]]`;

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

/**
 * 评分 → 优先级调整量（G1 优先级动态化，对标 SM "pass grades automatically decrease priority"）。
 * 0 = 最高优先；数值增大 = 降优先。SM 语义：及格评分（Good/Easy）自动降低 item 优先级；
 * Again/Hard 不动优先级（遗忘靠 FSRS 间隔重学，不升优先——优先级是重要性，间隔是记忆状态）。
 * cfg 可选（{again, hard, good, easy} 或 {enable:false} 关闭）；默认 0/0/+5/+10。
 */
export function priorityDeltaForRating(rating: string | number, cfg?: Record<string, any>): number {
	if (cfg && cfg.enable === false) return 0;
	const c = cfg || {};
	const r = String(rating).toLowerCase();
	if (r === "again" || r === "1") return Number(c.again) || 0;
	if (r === "hard" || r === "2") return Number(c.hard) || 0;
	if (r === "good" || r === "3") return Number(c.good) || 5;
	if (r === "easy" || r === "4") return Number(c.easy) || 10;
	return 0;
}

/** 应用优先级调整（G1）：clamp 0-100，返回字符串字段值 */
export function adjustPriority(priority: unknown, delta: number): string {
	return String(Math.max(0, Math.min(100, normalizePriority(priority) + delta)));
}

/** 优先级快速增减（G2/G3）：步长默认 5，clamp 0-100 */
export function shiftPriority(priority: unknown, step = 5): string {
	return adjustPriority(priority, step);
}

/**
 * TW 日期串（YYYY0MM0DD0hh0mm0ss0XXX，UTC 语义，与 $tw.utils.parseDate 一致）→ Date。
 * 注意：TW 的日期字符串是 UTC 编码（stringifyDate 用 getUTC*），此前按本地时区解析
 * 会造成 8 小时（=时区偏移）的系统性偏差（如评分间隔显示"8 hours from now"）。
 */
export function parseTwDate(v: unknown, fallback = new Date()): Date {
	const s = String(v || "");
	if (/^\d{17}$/.test(s)) {
		const d = new Date(Date.UTC(
			Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)),
			Number(s.slice(8, 10)), Number(s.slice(10, 12)), Number(s.slice(12, 14)), Number(s.slice(14, 17))
		));
		return Number.isNaN(d.getTime()) ? fallback : d;
	}
	const p = Date.parse(s);
	return Number.isNaN(p) ? fallback : new Date(p);
}

function addDays(d: Date, days: number): Date {
	return new Date(d.getTime() + days * 86400000);
}

/** Date → TW 日期串（UTC 语义，与 $tw.utils.stringifyDate 一致） */
function twDate(d: Date): string {
	const p = (n: number, l: number) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}${p(d.getUTCMilliseconds(), 3)}`;
}

export interface CardLike { title: string; fields: Record<string, any> }
export interface Patch { title: string; fields: Record<string, any> }

/** 顺延：due 推后 byDays 天（相对当前 due 或 now） */
export function postponeCard(fields: Record<string, any>, byDays = 7): Record<string, any> {
	const base = parseTwDate(fields.due);
	return { due: twDate(addDays(base, byDays)) };
}

/** 提前：due = 今天（强制复习） */
export function advanceCard(): Record<string, any> {
	return { due: twDate(new Date()) };
}

/**
 * 忽略：移出所属队列，保留内容（可经 restoreCard 恢复）。
 * 分类对齐 SuperMemo Bury：kind 决定归属，忽略 = 置 tidme.ignored（出队标记），不依赖标签。
 * 返回完整字段（调用方直接 addTiddler 覆盖写库）。
 */
export function ignoreCard(fields: Record<string, any>): Record<string, any> {
	return { ...fields, "tidme.ignored": "yes" };
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

/** 统一已读 / 完成判定：done（已读/完成）或 ignored（忽略）都视为已出队 */
export function isCardDone(fields: Record<string, any>): boolean {
	if (!fields) return false;
	return fields["tidme.done"] === "yes" || fields["tidme.ignored"] === "yes";
}

/**
 * Done（已读/完成）：移出学习队列 = 置 tidme.done 标记（kind 决定队列归属，无需标签）。
 * kind 决定队列归属，同样出队。完全可逆（restoreCard）。
 */
export function doneCard(fields: Record<string, any>): Record<string, any> {
	return { ...fields, "tidme.done": "yes" };
}

/**
 * 恢复队列（Done/Ignore 的可逆反操作）：清除 done/ignored/suspended 标记。
 * 队列归属由 kind 决定（topic 回阅读流 / item 回复习流），无需补标签。
 */
export function restoreCard(fields: Record<string, any>): Record<string, any> {
	const out: Record<string, any> = { ...fields };
	delete out["tidme.done"];
	delete out["tidme.ignored"];
	delete out["tidme.suspended"];
	return out;
}

export type QueueSortMode = "priority-first" | "due-first" | "hybrid";

/**
 * 优先级混合队列排序：
 * - priority-first（SM 优先级优先）：优先级数值小（高优先）在前面，相同时按 due 升序。
 * - due-first（到期优先）：due 越早越在前面，相同时按优先级升序。
 * - hybrid（混合加权得分）：score = priority - overdueDays * weight * 10（逾期越久加权越优先），综合排序。
 */
export function sortPriorityMixedQueue<T extends CardLike>(
	cards: T[],
	mode: QueueSortMode = "hybrid",
	overdueWeight = 0.5
): T[] {
	const now = Date.now();
	return [...cards].sort((a, b) => {
		const pa = normalizePriority(a.fields["tidme.priority"]);
		const pb = normalizePriority(b.fields["tidme.priority"]);
		const da = parseTwDate(a.fields.due, new Date(0)).getTime();
		const db = parseTwDate(b.fields.due, new Date(0)).getTime();

		if (mode === "priority-first") {
			if (pa !== pb) return pa - pb;
			return da - db;
		}

		if (mode === "due-first") {
			if (da !== db) return da - db;
			return pa - pb;
		}

		// hybrid 模式：逾期天数抵扣 priority（使高逾期的低优先卡也能被调度，但不打破整体优先级框架）
		const daysA = Math.max(0, (now - da) / 86400000);
		const daysB = Math.max(0, (now - db) / 86400000);
		const scoreA = pa - daysA * overdueWeight * 10;
		const scoreB = pb - daysB * overdueWeight * 10;
		if (Math.abs(scoreA - scoreB) > 0.001) return scoreA - scoreB;
		return pa - pb || da - db;
	});
}

export interface AutoPostponeOptions {
	/** 逾期卡中超过该优先级（数值更大=更低优先）的才顺延 */
	maxPriority?: number;
	/** 顺延天数 */
	postponeDays?: number;
	/** 始终保留的高优先级卡数（按优先级升序取前 N） */
	keepTop?: number;
	/** 触发顺延的逾期阈值：只有逾期卡总数 > maxOverdueThreshold 时才触发过载顺延（默认 0 表示无门槛） */
	maxOverdueThreshold?: number;
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
	const maxOverdueThreshold = opts.maxOverdueThreshold ?? 0;
	const now = Date.now();

	const overdue = cards
		.filter((c) => {
			const f = c.fields;
			if (f["tidme.suspended"] === "yes") return false;
			if (isCardDone(f)) return false; // 已出队（done/ignored）
			if (f["tidme.kind"] === "topic") return false; // 阅读流不参与复习顺延
			return parseTwDate(f.due, new Date(0)).getTime() < now;
		})
		.sort((a, b) => {
			const pa = normalizePriority(a.fields["tidme.priority"]);
			const pb = normalizePriority(b.fields["tidme.priority"]);
			if (pa !== pb) return pa - pb; // 0（高）在前
			return parseTwDate(a.fields.due).getTime() - parseTwDate(b.fields.due).getTime();
		});

	if (overdue.length <= maxOverdueThreshold) {
		return {
			patches: [],
			stats: { overdue: overdue.length, postponed: 0, kept: overdue.length }
		};
	}

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
