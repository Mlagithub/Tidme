/*
schema.ts — 实体字段规范与校验（规格 doc/research/data-model.md §2）

- 常量：实体 kind、来源格式、FSRS 字段族、缺省值
- 校验：isSection / isCard 等 + assertFields（返回缺失字段列表）
- 校验策略：对旧数据（缺字段）宽容（返回缺失清单由调用方补默认），对新数据严格（assertKind 抛错）
*/

export const FORMATS = ["epub", "markdown", "html", "txt", "clip", "paste"] as const;
export type Format = (typeof FORMATS)[number];

export const KINDS = ["document", "section", "extract", "qa", "cloze"] as const;
export type Kind = (typeof KINDS)[number];

/** FSRS 字段族（卡实体必填，见 data-model §3） */
export const FSRS_FIELDS = [
	"due", "state", "reps", "lapses", "stability", "difficulty",
	"elapsed_days", "scheduled_days", "last_review"
] as const;

/** 溯源继承字段（Document 上维护，派生实体经 parent 链动态显示，不复制） */
export const PROVENANCE_FIELDS = [
	"tidme.source", "tidme.author", "tidme.language", "tidme.url", "tidme.date", "tidme.license", "tidme.format"
] as const;

export interface SectionRequired {
	"tidme.doc": string;
	"tidme.id": string;
	"tidme.parent": string;
	"tidme.path": string;
	"tidme.order": string;
	"tidme.level": string;
	"tidme.kind": "section";
	"tidme.hash": string;
	"tidme.format": string;
	caption: string;
	text: string;
	tags: string[];
}

export interface CardRequired extends SectionRequired {
	"tidme.kind": "extract" | "qa" | "cloze";
}

/** TW 日期字符串（本地时区，YYYY0MM0DD0hh0mm0ss0XXX） */
export function twDateString(d: Date): string {
	const p = (n: number, l: number) => String(n).padStart(l, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1, 2)}${p(d.getDate(), 2)}${p(d.getHours(), 2)}${p(d.getMinutes(), 2)}${p(d.getSeconds(), 2)}${p(d.getMilliseconds(), 3)}`;
}

/**
 * FSRS 初始字段集。
 * 关键修复：fsrs4tw 的过滤器要求卡片已含全部 FSRS 字段才走评分写入路径；
 * 缺字段的卡评分静默失败 → 队列首位永不变（表现为"无法切换下一张"）。
 */
export function initialFsrsFields(now: Date): Record<string, string> {
	const t = twDateString(now);
	return {
		due: t,
		state: "0",
		reps: "0",
		lapses: "0",
		stability: "0",
		difficulty: "0",
		elapsed_days: "0",
		scheduled_days: "0",
		last_review: t
	};
}

/** 返回 tiddler 字段中缺失的 FSRS 字段（空数组 = 齐全） */
export function missingFsrsFields(fields: Record<string, unknown>): string[] {
	return FSRS_FIELDS.filter((f) => fields[f] === undefined || fields[f] === null || fields[f] === "");
}

/** kind 判断（宽容：缺 kind 的历史数据按 fields 特征推断） */
export function inferKind(fields: Record<string, unknown>): Kind | null {
	const kind = fields["tidme.kind"];
	if (typeof kind === "string" && (KINDS as readonly string[]).includes(kind)) return kind as Kind;
	if (fields["tidme.order"] !== undefined) return "section";
	if (fields["tidme.parent"] !== undefined && typeof fields.text === "string") return "extract";
	return null;
}

/** 返回必填字段缺失清单（宽容模式：不抛错，由调用方补默认） */
export function missingRequired(fields: Record<string, unknown>, kind: Kind): string[] {
	const base = ["tidme.doc", "tidme.id", "tidme.parent", "tidme.path", "caption"];
	const extra =
		kind === "section" ? ["tidme.order", "tidme.kind", "text"]
		: kind === "extract" || kind === "qa" || kind === "cloze" ? ["tidme.kind", "text"]
		: [];
	return [...base, ...extra].filter((f) => fields[f] === undefined || fields[f] === null || fields[f] === "");
}

/** 严格校验（写入前调用）：缺失即抛错 */
export function assertKind(fields: Record<string, unknown>, kind: Kind): void {
	const missing = missingRequired(fields, kind);
	if (missing.length) {
		throw new Error(`[tidme/core] ${kind} 实体缺字段: ${missing.join(", ")}`);
	}
	const fsrsMissing = missingFsrsFields(fields);
	if (fsrsMissing.length) {
		throw new Error(`[tidme/core] ${kind} 实体缺 FSRS 字段: ${fsrsMissing.join(", ")}`);
	}
}
