/*
core/ui-utils.ts — 跨 Widget 共享 DOM 构建与卡片视觉呈现工具库
*/

declare function require(module: string): any;
const sched = require("$:/plugins/tidme/core/scheduler.js");

export function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

export function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function badgeOf(fields: Record<string, any>): { text: string; cls: string } {
	const tags = Array.isArray(fields.tags) ? fields.tags : typeof fields.tags === "string" ? String(fields.tags).split(/\s+/) : [];
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
	const kind = String(fields["tidme.kind"] || "");
	if (kind === "extract") return "摘";
	if (kind === "cloze") return "挖";
	if (kind === "qa") return "问";
	return "";
}

export function stateLabel(fields: Record<string, any>): string {
	const b = badgeOf(fields);
	const state = String(fields.state || "0");
	if (state === "1" || state === "3") return "学习中";
	if (state === "2") {
		const overdue = sched.parseTwDate(fields.due).getTime() < Date.now();
		return overdue ? "已逾期" : "到期";
	}
	if (b.text === "✓") return "已读";
	if (b.text === "⏸") return "搁置";
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

/** 某文档全部节卡（阅读进度口径，与文档页一致） */
export function sectionsOfDoc(wiki: any, docId: string): string[] {
	return wiki
		.filterTiddlers("[has[tidme.doc]nsort[tidme.order]]")
		.filter((t: string) => {
			const f = wiki.getTiddler(t)?.fields;
			if (!f) return false;
			const kind = f["tidme.kind"];
			return String(f["tidme.doc"]) === docId &&
				(kind === "section" || (kind === undefined && f["tidme.order"] !== undefined));
		});
}
