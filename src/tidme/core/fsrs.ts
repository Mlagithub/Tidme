/*
fsrs.ts — FSRS 复习服务（提取自 fsrs4tw filters/fsrs.js，行为一致）

- repeat(twCard, opts)：对单张卡计算四档评分结果，返回与 `[fsrs[p]]` 过滤器输出一致的 JSON 字符串
- 缺 FSRS 字段的卡按新卡处理（与原始过滤器一致）
- p 参数校验：缺 key 或 w 长度不符时回退默认参数（与原始一致）
*/

declare function require(module: string): any;

let _lib: any = null;
function lib(): any {
	if (!_lib) _lib = require("$:/plugins/keepone/tidme/core/fsrs/fsrs.js");
	return _lib;
}

/** TW 日期串 → Date（UTC 语义，与 $tw.utils.parseDate 一致）；非 17 位串交给 Date 构造 */
function parseTwDateStr(s: string): Date {
	if (/^\d{17}$/.test(s)) {
		return new Date(Date.UTC(
			Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)),
			Number(s.slice(8, 10)) || 0, Number(s.slice(10, 12)) || 0, Number(s.slice(12, 14)) || 0, Number(s.slice(14, 17)) || 0
		));
	}
	return new Date(s);
}

/** TW 字段 → FSRS 日期（due/last_review/review 转 Date；递归处理 review_log 等嵌套对象） */
function tw2fsrsDate(obj: Record<string, any>): Record<string, any> {
	for (const key of Object.keys(obj)) {
		if (key === "due" || key === "last_review" || key === "review") {
			obj[key] = parseTwDateStr(String(obj[key]));
		} else if (typeof obj[key] === "object" && obj[key] !== null) {
			tw2fsrsDate(obj[key]);
		}
	}
	return obj;
}

/** TW 日期字符串（UTC 语义，YYYY0MM0DD0hh0mm0ss0XXX）——与 $tw.utils.stringifyDate 一致 */
function twDateString(d: Date): string {
	const p = (n: number, l: number) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}${p(d.getUTCMilliseconds(), 3)}`;
}

/** FSRS 日期 → TW 日期字符串 */
function fsrs2twDate(obj: Record<string, any>): Record<string, any> {
	for (const key of Object.keys(obj)) {
		if (key === "due" || key === "last_review" || key === "review") {
			obj[key] = obj[key] instanceof Date ? twDateString(obj[key]) : obj[key];
		} else if (typeof obj[key] === "object" && obj[key] !== null) {
			fsrs2twDate(obj[key]);
		}
	}
	return obj;
}

/** 校验并应用 p 参数（与原始过滤器一致：缺 key 或 w 长度不符则忽略） */
function applyParams(Fsrs: any, p: unknown): void {
	if (typeof p !== "string" || !p) return;
	try {
		const parsed = JSON.parse(p);
		if (parsed && typeof parsed === "object") {
			const pKeys = Object.keys(parsed);
			if (Object.keys(Fsrs.p).every((key) => pKeys.includes(key)) && parsed.w && parsed.w.length === Fsrs.p.w.length) {
				Fsrs.p = parsed;
			}
		}
	} catch (e) {
		/* 非法 JSON 忽略 */
	}
}

/**
 * 对单张卡计算四档评分结果。
 * @param twCard tiddler 字段（含或不含 FSRS 字段；缺字段按新卡）
 * @param opts.p deck 的 FSRS 参数 JSON 字符串（可选）
 * @param opts.now 计算时刻（默认 new Date()）
 * @returns 与 `[fsrs[p]]` 过滤器输出一致的 JSON 字符串（含 Rating/State/P/Cards）
 */
export function repeat(twCard: Record<string, any>, opts: { p?: string; now?: Date } = {}): string {
	const fsrsJs = lib();
	const Fsrs = new fsrsJs.FSRS();
	applyParams(Fsrs, opts.p);

	const Card = new fsrsJs.Card();
	try {
		if (twCard && Object.keys(Card).every((key) => Object.keys(twCard).includes(key))) {
			const result: Record<string, any> = {};
			for (const key of Object.keys(Card)) result[key] = Number(twCard[key]);
			tw2fsrsDate(result);
			// Card 各字段赋值
			for (const key of Object.keys(result)) Card[key] = result[key];
		}
	} catch (e) {
		/* 解析失败按新卡 */
	}

	const cards = Fsrs.repeat(Card, opts.now || new Date());
	const result = {
		Rating: fsrsJs.Rating,
		State: fsrsJs.State,
		P: Fsrs.p,
		Cards: fsrs2twDate(cards)
	};
	return JSON.stringify(result);
}

/** FSRS 默认参数（与 fsrs 库一致，供 deck 创建时预填） */
export function defaultParams(): Record<string, unknown> {
	const Fsrs = new (lib().FSRS)();
	return Fsrs.p;
}
