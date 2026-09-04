/*
core/display.ts — 展示层纯函数（徽章/标签/标题/日期，从 ui-utils 拆分，M1）
仅把字段渲染为可读文本；不写库、不查询文档树。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const sched = require("$:/plugins/keepone/tidme/core/scheduler.js");

export function badgeOf(fields: Record<string, any>): { text: string; cls: string } {
	if (fields["tidme.suspended"] === "yes") return { text: "⏸", cls: "tm-badge-suspended" };
	if (sched.isCardDone(fields)) return { text: "✓", cls: "tm-badge-done" };
	const state = String(fields.state || "0");
	if (state === "1" || state === "3") return { text: "学", cls: "tm-badge-learn" };
	if (state === "2") {
		const overdue = sched.parseTwDate(fields.due).getTime() < Date.now();
		return overdue ? { text: "逾", cls: "tm-badge-overdue" } : { text: "到", cls: "tm-badge-due" };
	}
	return { text: "新", cls: "tm-badge-new" };
}

export function kindMark(fields: Record<string, any>): string {
	const sub = String(fields["tidme.subkind"] || "");
	if (sub === "extract") return "摘";
	if (sub === "cloze") return "挖";
	if (sub === "qa") return "问";
	return "";
}

export function stateLabel(fields: Record<string, any>): string {
	const b = badgeOf(fields);
	// 出队语义优先（done/ignored/suspended）—— 否则 done 卡仍显示 "到期/已逾期" 误导
	if (b.text === "✓") return "已读";
	if (b.text === "⏸") return "搁置";
	const state = String(fields.state || "0");
	if (state === "1" || state === "3") return "学习中";
	if (state === "2") {
		const overdue = sched.parseTwDate(fields.due).getTime() < Date.now();
		return overdue ? "已逾期" : "到期";
	}
	return "新卡";
}

export function dueLabel(fields: Record<string, any>): string {
	if (String(fields.state || "0") !== "2") return "—";
	const d = sched.parseTwDate(fields.due);
	return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export function intervalLabel(fields: Record<string, any>): string {
	const s = Number(fields.scheduled_days);
	return Number.isFinite(s) && s > 0 ? `${Math.round(s)}天` : "—";
}

export function repsLabel(fields: Record<string, any>): string {
	return fields.reps !== undefined && fields.reps !== "" ? String(fields.reps) : "—";
}

export function lapsesLabel(fields: Record<string, any>): string {
	return fields.lapses !== undefined && fields.lapses !== "" ? String(fields.lapses) : "—";
}

export function diffLabel(fields: Record<string, any>): string {
	const d = Number(fields.difficulty);
	return Number.isFinite(d) && d > 0 ? `${Math.round(d * 100)}%` : "—";
}

export function dateLabel(raw: any): string {
	if (raw === undefined || raw === null || raw === "") return "—";
	const d = sched.parseTwDate(raw);
	return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/**
 * 显示名（命名空间 title 可读化）：caption ?? breadcrumb 末段 ?? title 末段。
 * title=路径（Tidme/Books/<slug>/<hash>）后，所有列表/表格显示一律经此，禁止裸显 title。
 */
export function displayTitle(fields: Record<string, any> | null | undefined, title?: string): string {
	const cap = fields && fields.caption !== undefined && fields.caption !== "" ? String(fields.caption).trim() : "";
	if (cap) return cap;
	const br = fields && fields["tidme.breadcrumb"]
		? String(fields["tidme.breadcrumb"]).split(" › ").pop()?.trim() || ""
		: "";
	if (br) return br;
	const t = String(title ?? "");
	const i = t.lastIndexOf("/");
	return (i >= 0 ? t.slice(i + 1) : t).trim() || t;
}

/**
 * caption 字段的可读文本：有些 caption 是 wikitext 转义（如牌组 caption = {{$:/language/tidme/default}}），
 * 不能直接当纯文本 textContent。含转义时用 renderText 解析为纯文本；否则原样返回（避免无谓开销）。
 */
export function captionText(wiki: any, caption: unknown, widget?: any): string {
	const raw = String(caption ?? "").trim();
	if (!raw) return raw;
	if (!/\{\{|<<|\$\([^)]*\)/.test(raw)) return raw;
	try {
		return wiki.renderText("text/plain", "text/vnd.tiddlywiki", raw, { parentWidget: widget });
	} catch {
		// 解析失败：剥掉明显未决的 {{...}} 转义，退回可读形式
		const stripped = raw.replace(/\{\{[^}]+\}\}/g, "").trim();
		return stripped || raw;
	}
}
