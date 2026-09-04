/*
core/doc-ops.ts — 文档/卡片运维操作（文档查询、删除阅读材料、折叠态，从 ui-utils 拆分，M1）
只依赖 wiki 对象与 core/session（常量），不渲染 DOM。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const session = require("$:/plugins/keepone/tidme/core/session.js");
const deckMod = require("$:/plugins/keepone/tidme/core/deck.js");

const READPOINT_PREFIX = "$:/state/tidme-import/readpoint/";

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
	const sess = wiki.getTiddler(session.SESSION_TIDDLER);
	if (sess && Array.isArray(sess.fields.list)) {
		const keep = sess.fields.list.filter((t: string) => !targets.has(t));
		if (keep.length !== sess.fields.list.length) {
			wiki.addTiddler({ ...sess.fields, title: session.SESSION_TIDDLER, list: keep });
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

/**
 * 跳转复习卡（item）前设置折叠态：$:/state/folded/<title> = "hide"（折叠，先看问题）
 * 除非该卡命中其所属 deck 的 card_unfold（"show"）。与 startstudy.tid / fsrs4tw
 * 折叠语义一致——否则 state 缺失时 reveal 默认展开（答案直接显示）。
 * 非 item 卡（阅读/文档页）不设（不影响阅读界面）。
 */
export function prepareCardFold(wiki: any, title: string): void {
	if (!wiki || typeof wiki.filterTiddlers !== "function" || !title) return;
	const f = wiki.getTiddler(title)?.fields;
	if (!f || f["tidme.kind"] !== "item") return;
	// 卡所属 deck（同复习帧 decktiddler 语义：card 收录它的第一个 deck）；取该 deck 的 card_unfold
	const decks = deckMod.listDecks(wiki);
	for (const d of decks) {
		if (!deckMod.deckCards(wiki, d).includes(title)) continue;
		const f = deckMod.getDeck(wiki, d)?.fields || {};
		const unfoldFilter = String(f.card_unfold || "");
		const unfold = unfoldFilter && wiki.filterTiddlers(`[subfilter{${d}!!card_unfold}]`).includes(title);
		wiki.addTiddler({ title: "$:/state/folded/" + title, text: unfold ? "show" : "hide" });
		return;
	}
	// 兜底：默认折叠
	wiki.addTiddler({ title: "$:/state/folded/" + title, text: "hide" })
}
