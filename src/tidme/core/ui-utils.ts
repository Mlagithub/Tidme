/*
core/ui-utils.ts — 跨 Widget 共享 DOM 构建与卡片视觉呈现工具库
*/

declare function require(module: string): any;
const sched = require("$:/plugins/keepone/tidme/core/scheduler.js");

export function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

export function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
	const sub = String(fields["tidme.subkind"] || "");
	if (sub === "extract") return "摘";
	if (sub === "cloze") return "挖";
	if (sub === "qa") return "问";
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
/** 某 book folder（Tidme/Books/<slug>）下第一张带 tidme.doc 的卡所属 docId（无占用返回 null）——同名书冲突探测 */
export function docFolderOwner(wiki: any, baseFolder: string): string | null {
	if (!wiki || typeof wiki.filterTiddlers !== "function") return null;
	const first = wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${baseFolder}]has[tidme.doc]]`)[0];
	if (!first) return null;
	const doc = wiki.getTiddler(first)?.fields?.["tidme.doc"];
	return doc !== undefined && doc !== null && doc !== "" ? String(doc) : null;
}

/** 按 docId 查真实文档页 title（folder 含 ~docId 后缀时亦准确）；找不到返回 "" */
export function docPageOfDoc(wiki: any, docId: string): string {
	if (!wiki || typeof wiki.filterTiddlers !== "function") return "";
	return wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${docId}]]`)[0] || "";
}

const SESSION_STATE = "$:/state/tidme/learning-session";
const READPOINT_PREFIX = "$:/state/tidme-import/readpoint/";

/** 文档页判定：带 tidme-import-doc 标签 */
function isDocPage(f: Record<string, any>): boolean {
	return Array.isArray(f.tags) && f.tags.includes("tidme-import-doc");
}

/** 续读点目标 title（readpoint tiddler text：JSON {t,s} 或旧版纯标题） */
function readpointTarget(raw: string | undefined): string {
	const s = String(raw || "").trim();
	if (!s) return "";
	try {
		const o = JSON.parse(s);
		if (o && o.t) return String(o.t);
	} catch { /* 旧格式 */ }
	return s;
}

/**
 * 删除一本书的"阅读材料"，保留全部"知识产物"：
 * 删除：文档页 + 全部 topic/subkind=section 节卡（导入切分节 + 大纲手动插入的"新节"；含 obsolete 归档）
 * 保留：摘录（topic/extract）、挖空/问答（item）、无 kind 手动散卡、子集牌组外的知识对象
 * 附带：删除本书子集牌组（tidme.subset-doc）；续读点仅当其指向被删内容时清除；
 *       学习会话列表剔除被删卡（保留其余队列语义）。
 * 一律按 docId 字段筛选（不依赖 title 结构，folder 后缀/历史格式均覆盖）。
 * @returns 删除的 tiddler 数
 */
export function deleteDocContent(wiki: any, docId: string): number {
	if (!wiki || typeof wiki.filterTiddlers !== "function" || !docId) return 0;
	const owned = wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.doc[${docId}]]`);
	const targets = new Set<string>();
	for (const t of owned) {
		const f = wiki.getTiddler(t)?.fields || {};
		// 阅读材料：文档页 + topic 节卡（subkind!==extract → 摘录保留；kind=item/无 kind 保留）
		if (isDocPage(f)) { targets.add(t); continue; }
		if (f["tidme.kind"] === "topic" && String(f["tidme.subkind"] || "section") !== "extract") targets.add(t);
	}
	// 子集牌组是临时复习脚手架（引用保留的知识卡），随本书清理
	const decks = wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.subset-doc[${docId}]]`);
	for (const d of decks) targets.add(d);

	// 学习会话：剔除被删卡（保留其余卡与队列语义）
	const sess = wiki.getTiddler(SESSION_STATE);
	if (sess && Array.isArray(sess.fields.list)) {
		const keep = sess.fields.list.filter((t: string) => !targets.has(t));
		if (keep.length !== sess.fields.list.length) {
			wiki.addTiddler({ ...sess.fields, title: SESSION_STATE, list: keep });
		}
	}
	// 续读点：仅当指向被删内容时清除（指向保留的摘录/卡则保留）
	const rpTiddler = wiki.getTiddler(READPOINT_PREFIX + docId);
	if (rpTiddler && targets.has(readpointTarget(String(rpTiddler.fields.text)))) {
		wiki.deleteTiddler(READPOINT_PREFIX + docId);
	}
	const g = wiki.getTiddler(READPOINT_PREFIX + "global");
	if (g && targets.has(readpointTarget(String(g.fields.text)))) {
		wiki.deleteTiddler(READPOINT_PREFIX + "global");
	}

	let n = 0;
	for (const t of targets) {
		if (wiki.getTiddler(t)) { wiki.deleteTiddler(t); n++; }
	}
	return n;
}

/** 某文档全部正文章节（阅读进度口径，与文档页一致；topic 卡中排除摘录） */
export function sectionsOfDoc(wiki: any, docId: string): string[] {
	return wiki
		.filterTiddlers("[has[tidme.doc]nsort[tidme.order]]")
		.filter((t: string) => {
			const f = wiki.getTiddler(t)?.fields;
			if (!f) return false;
			return String(f["tidme.doc"]) === docId &&
				f["tidme.kind"] === "topic" &&
				String(f["tidme.subkind"] || "") !== "extract";
		});
}
