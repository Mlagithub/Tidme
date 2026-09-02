/*
widgets/split.ts — M2 切分入口组件（M4 加优先级三档；G1 加预览干预）

- <$paste-split/> 粘贴切分：textarea → runSplit → 写库
- <$inbox-split/> 剪藏收件箱：列出 tidme-inbox tiddler，逐条/批量切分
切分后源 tiddler 被文档页覆盖（保留 url/author/date 等溯源字段，移除 tidme-inbox 标签）。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/keepone/tidme/import/pipeline.js");
const events = require("$:/plugins/keepone/tidme/core/events.js");
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;
// 共享 DOM 工具（实现收敛于 core/ui-utils）
const el = uiUtils.el;

/** 从源 tiddler 提取溯源字段（切分后保留到文档页） */
function provenanceOf(wiki: any, title: string): Record<string, string> {
	const f = wiki.getTiddler(title)?.fields || {};
	const out: Record<string, string> = {};
	for (const k of ["url", "author", "date", "canonical", "license", "created", "modified"]) {
		const v = f[k];
		if (typeof v === "string" && v) out[k] = v;
	}
	return out;
}

/** 执行切分并写库：源 tiddler 被文档页覆盖（合并溯源字段、移除 inbox 标签）。
 * G2 对齐：若同 docId 已存在旧 Section 卡（重切分），走 alignCards 增量修补
 * （未变保 SRS 进度 / 修改重挂接 / 新增建卡 / 删除归档），而非全量重建。 */
async function commitSplit(wiki: any, widget: any, title: string, extraSourceFields: Record<string, string> = {}, priority?: number, overrides?: any) {
	const t = wiki.getTiddler(title);
	if (!t) throw new Error("源 tiddler 不存在");
	const r = await pipeline.runSplit({
		text: String(t.fields.text || ""),
		title,
		type: t.fields.type,
		sourceFields: { ...provenanceOf(wiki, title), ...extraSourceFields },
		priority,
		overrides,
		folderOccupied: (base: string) => uiUtils.docFolderOwner(wiki, base)
	});
	const [doc, ...cards] = r.tiddlers;
	if (!cards.length) throw new Error("未切分出任何节（内容过短或无可识别结构）");
	const sectionCards = cards.filter((x: any) => x["tidme.kind"] === "topic");

	// G2 对齐：重切分已有文档时增量修补
	const align = require("$:/plugins/keepone/tidme/core/align.js");
	const docPage = wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${r.docId}]]`)[0] || "";
	const oldCards = wiki.filterTiddlers(`[tidme.doc[${r.docId}]tidme.kind[topic]!is[draft]]`)
		.map((ot: string) => ({ title: ot, fields: wiki.getTiddler(ot)?.fields || {} }));
	let aligned: any = null;
	if (oldCards.length) {
		aligned = await align.alignCards(oldCards, docPage || title, sectionCards.map((c: any) => ({ title: c.title, fields: c })));
		// 保留的新卡（新增节）写库
		for (const k of aligned.keep) wiki.addTiddler({ ...k.fields });
		// 更新补丁（内容变 / 顺序变）：保留旧 ID 与 SRS 进度
		for (const p of aligned.patches) {
			const existing = wiki.getTiddler(p.title);
			if (existing) wiki.addTiddler({ ...existing.fields, ...p.fields });
		}
		// 归档：标记 obsolete + done（出队，不硬删；分类重构后无 ? 标签，靠 done 出队）
		for (const at of aligned.archives) {
			const existing = wiki.getTiddler(at);
			if (!existing) continue;
			wiki.addTiddler({ ...existing.fields, "tidme.obsolete": "yes", "tidme.done": "yes" });
		}
	}

	// 源 tiddler → 文档页：合并溯源字段、标签合并（去 tidme-inbox）
	const srcFields = t.fields;
	const srcTags = Array.isArray(srcFields.tags) ? srcFields.tags.filter((x: string) => x !== "tidme-inbox") : [];
	const mergedDoc: Record<string, any> = {
		...doc,
		title,
		tags: [...new Set([...(Array.isArray(doc.tags) ? doc.tags : []), ...srcTags])],
		...(srcFields.bag ? { bag: srcFields.bag } : {}),
		...(srcFields["tidme.url"] ? { "tidme.url": srcFields["tidme.url"] } : {}),
		...(srcFields["tidme.author"] ? { "tidme.author": srcFields["tidme.author"] } : {}),
		...(srcFields["tidme.date"] ? { "tidme.date": srcFields["tidme.date"] } : {})
	};
	wiki.addTiddler(mergedDoc);
	if (!aligned) {
		// 首次切分：全量写库
		for (const c of cards) wiki.addTiddler(c);
	} else {
		// 对齐模式：非新增卡不重复写（keep 已写；同 key 旧卡已在库）
		for (const c of cards) {
			if (aligned.keep.some((k: any) => k.title === c.title)) continue;
			// 该新卡与旧卡同 key 被丢弃（保留旧卡）；仅当其标题不在库中时才写（防御）
			if (!wiki.getTiddler(c.title)) wiki.addTiddler(c);
		}
	}
	// 无自动阅读牌组：topic 由阅读列表管理，item 进默认牌组
	// 事件总线：切分完成（paste-split / inbox-split 共用此出口）
	events.dispatch(widget, events.EVENTS.IMPORT_DONE, { docId: r.docId, bookTitle: title });
	return r;
}


function makePasteSplit(): WidgetCtor {
	class PasteSplitWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wrap = el(doc, "div", "tm-dashboard-card");
			wrap.appendChild(el(doc, "div", "tm-dashboard-card-title", "粘贴文本"));
			const inner = el(doc, "div", "tm-paste-split");
			const ta = doc.createElement("textarea");
			ta.className = "tm-paste-textarea";
			ta.placeholder = "粘贴 markdown / HTML / 纯文本…";
			ta.rows = 8;
			inner.appendChild(ta);
			const btn = el(doc, "button", "tm-btn tm-btn-primary", "切分文本并入库");
			const status = el(doc, "div", "tm-import-muted", "");
			btn.addEventListener("click", async () => {
				const text = String(ta.value || "").trim();
				if (!text) { status.textContent = "内容为空"; return; }
				const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").replace(/^!\s*/, "").slice(0, 40) || "粘贴内容";
				btn.setAttribute("disabled", "true");
				status.textContent = "解析中…";
				try {
					const r = await pipeline.runSplit({
						text, title: firstLine,
						bag: this.wiki.getTiddlerText("$:/temp/tidme-import/bag", "") || "default",
						folderOccupied: (base: string) => uiUtils.docFolderOwner(this.wiki, base)
					});
					if (!r.tiddlers.some((x: any) => x["tidme.kind"] === "topic")) throw new Error("未切分出任何节");
					for (const tdl of r.tiddlers) this.wiki.addTiddler(tdl);
					events.dispatch(this, events.EVENTS.IMPORT_DONE, { docId: r.docId, bookTitle: firstLine });
					this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/keepone/tidme/import/ui/notify-done" });
					this.dispatchEvent({ type: "tm-navigate", navigateTo: r.tiddlers[0].title });
				} catch (e: any) {
					status.textContent = "切分失败：" + String(e.message || e);
					btn.removeAttribute("disabled");
				}
			});
			inner.appendChild(btn);
			inner.appendChild(status);
			wrap.appendChild(inner);
			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return PasteSplitWidget as any;
}

function makeInboxSplit(): WidgetCtor {
	class InboxSplitWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wrap = el(doc, "div", "tm-dashboard-card");
			wrap.appendChild(el(doc, "div", "tm-dashboard-card-title", "剪藏收件箱 (tidme-inbox)"));
			const inner = el(doc, "div", "tm-inbox-split");
			const listBox = el(doc, "div", "");
			const refresh = () => {
				listBox.textContent = "";
				const items = this.wiki.filterTiddlers("[tag[tidme-inbox]!is[draft]]");
				if (!items.length) {
					listBox.appendChild(el(doc, "div", "tm-import-muted", "收件箱为空——支持使用浏览器剪藏插件自动捕获内容入库。"));
					return;
				}
				for (const item of items) {
					const row = el(doc, "div", "tm-import-row");
					row.appendChild(el(doc, "strong", "", item));
					const btn = el(doc, "button", "tm-btn tm-btn-primary", "切分并入库");
					btn.addEventListener("click", async () => {
						btn.setAttribute("disabled", "true");
						btn.textContent = "…";
						try {
							await commitSplit(this.wiki, this, item);
							this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/keepone/tidme/import/ui/notify-done" });
							refresh();
						} catch (e: any) {
							btn.textContent = "失败：" + String((e as any).message || e);
						}
					});
					row.appendChild(btn);
					listBox.appendChild(row);
				}
			};
			inner.appendChild(listBox);
			wrap.appendChild(inner);
			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
			refresh();
		}
		refresh() { return false; }
	}
	return InboxSplitWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["paste-split"] = makePasteSplit();
exports["inbox-split"] = makeInboxSplit();
