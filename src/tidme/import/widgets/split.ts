/*
widgets/split.ts — M2 切分入口组件（M4 加优先级三档；G1 加预览干预）

- <$paste-split/> 粘贴切分：textarea → runSplit → 写库
- <$inbox-split/> 剪藏收件箱：列出 tidme-inbox tiddler，逐条/批量切分
切分后源 tiddler 被文档页覆盖（保留 url/author/date 等溯源字段，移除 tidme-inbox 标签）。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/keepone/tidme/import/pipeline.js");
const dom = require("$:/plugins/keepone/tidme/core/dom.js");
const docOps = require("$:/plugins/keepone/tidme/core/doc-ops.js");
const commitMod = require("$:/plugins/keepone/tidme/core/import-commit.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;
// 共享 DOM 工具（实现收敛于 core/dom）
const el = dom.el;

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
 * 对齐写库统一走 core/import-commit（G2：未变保 SRS 进度 / 修改重挂接 / 新增建卡 / 删除归档）。 */
async function commitSplit(wiki: any, widget: any, title: string, extraSourceFields: Record<string, string> = {}, priority?: number) {
	const t = wiki.getTiddler(title);
	if (!t) throw new Error("源 tiddler 不存在");
	const r = await pipeline.runSplit({
		text: String(t.fields.text || ""),
		title,
		type: t.fields.type,
		sourceFields: { ...provenanceOf(wiki, title), ...extraSourceFields },
		priority,
		folderOccupied: (base: string) => docOps.docFolderOwner(wiki, base)
	});
	const [doc, ...cards] = r.tiddlers;
	if (!cards.length) throw new Error("未切分出任何节（内容过短或无可识别结构）");

	// 源 tiddler → 文档页：合并溯源字段、标签合并（去 tidme-inbox）；
	// 卡片 tidme.docpage 须指向合并后真实存在的文档页 title（源 tiddler title 优先于管线 docRoot）
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
	await commitMod.commitImportToWiki(wiki, {
		docId: r.docId,
		docTiddler: mergedDoc,
		docTitle: title,
		cards,
		rewriteDocPage: true
	});
	// 无自动阅读牌组：topic 由阅读列表管理，item 进默认牌组
	// 事件总线：切分完成（paste-split / inbox-split 共用此出口）
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
			const btn = el(doc, "button", "tm-btn tm-btn--primary", "切分文本并入库");
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
						bag: this.wiki.getTiddlerText(pipeline.IMPORT_BAG_TITLE, "") || "default",
						folderOccupied: (base: string) => docOps.docFolderOwner(this.wiki, base)
					});
					if (!r.tiddlers.some((x: any) => x["tidme.kind"] === "topic")) throw new Error("未切分出任何节");
					for (const tdl of r.tiddlers) this.wiki.addTiddler(tdl);
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
					const btn = el(doc, "button", "tm-btn tm-btn--primary", "切分并入库");
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
