/*
widgets/split.ts — M2 切分入口组件

- <$split-tool/>  切分页：解析源 tiddler（$:/temp/tidme/split/source）→ 大纲预览 → 确认写库
- <$paste-split/> 粘贴切分：textarea → runSplit → 写库
- <$inbox-split/> 剪藏收件箱：列出 tidme-inbox tiddler，逐条/批量切分
切分后源 tiddler 被文档页覆盖（保留 url/author/date 等溯源字段，移除 tidme-inbox 标签）。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/tidme/import/pipeline.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const SOURCE_TIDDLER = "$:/temp/tidme/split/source";

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

/** 执行切分并写库：源 tiddler 被文档页覆盖（合并溯源字段、移除 inbox 标签） */
async function commitSplit(wiki: any, widget: any, title: string, extraSourceFields: Record<string, string> = {}) {
	const t = wiki.getTiddler(title);
	if (!t) throw new Error("源 tiddler 不存在");
	const r = await pipeline.runSplit({
		text: String(t.fields.text || ""),
		title,
		type: t.fields.type,
		sourceFields: { ...provenanceOf(wiki, title), ...extraSourceFields }
	});
	const [doc, ...cards] = r.tiddlers;
	if (!cards.length) throw new Error("未切分出任何节（内容过短或无可识别结构）");
	// 源 tiddler → 文档页：合并溯源字段、标签合并（去 tidme-inbox）、保留 FSRS 无关字段
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
	for (const c of cards) wiki.addTiddler(c);
	// 自动 deck 已包含在 r.tiddlers（若 emit 生成）；这里显式补写以防 doc 覆盖时丢失
	const deck = r.tiddlers.find((x: any) => String(x.title).startsWith("$:/Deck/read/"));
	if (deck) wiki.addTiddler(deck);
	return r;
}

function makeSplitTool(): WidgetCtor {
	class SplitToolWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const title = wiki.getTiddlerText(SOURCE_TIDDLER, "").trim() || this.getVariable("currentTiddler");
			const t = title && wiki.getTiddler(title);
			if (!t) {
				parent.insertBefore(el(doc, "div", "tm-import-muted", "未指定要切分的 tiddler。"), nextSibling);
				return;
			}

			const wrap = el(doc, "div", "tm-split-tool");
			const head = el(doc, "h2", "", `切分：${title}`);
			wrap.appendChild(head);

			let parsed: any = null;
			let busy = false;
			const status = el(doc, "div", "tm-import-muted", "解析中…");
			const outlineBox = el(doc, "div", "");
			const actions = el(doc, "div", "tm-import-actions", "");

			const renderPreview = async () => {
				try {
					parsed = await pipeline.runSplit({
						text: String(t.fields.text || ""),
						title,
						type: t.fields.type,
						sourceFields: provenanceOf(wiki, title)
					});
					const cards = parsed.tiddlers.filter((x: any) => Array.isArray(x.tags) && x.tags.includes("?"));
					status.textContent = `${cards.length} 节 · 硬切 ${parsed.stats.hardSplitCount} 块 · 文档 ID ${parsed.docId}`;
					outlineBox.textContent = "";
					const details = el(doc, "details", "");
					details.open = true;
					const summary = el(doc, "summary", "tm-import-muted", `目录大纲（${Math.min(20, cards.length)}/${cards.length} 条）`);
					details.appendChild(summary);
					const pre = el(doc, "pre", "tm-import-outline-pre", "");
					pre.textContent = cards.slice(0, 20).map((c: any) => {
						const bc = String(c["tidme.path"] || "");
						const segs = bc.split(" › ");
						let line = "　".repeat(Math.max(0, segs.length - 2)) + segs[segs.length - 1];
						if (c["tidme.merged"]) line += " ⟵已并入上一节";
						return line;
					}).join("\n");
					details.appendChild(pre);
					outlineBox.appendChild(details);
					actions.textContent = "";
					const btn = el(doc, "button", "tc-btn-primary", "✔ 切分并入库");
					btn.addEventListener("click", async () => {
						if (busy || !parsed) return;
						busy = true;
						btn.setAttribute("disabled", "true");
						btn.textContent = "写入中…";
						try {
							await commitSplit(wiki, this, title);
							const docTitle = parsed.tiddlers[0].title;
							this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/tidme/import/ui/notify-done" });
							this.dispatchEvent({ type: "tm-navigate", navigateTo: docTitle });
						} catch (e: any) {
							status.textContent = "切分失败：" + String(e.message || e);
							btn.removeAttribute("disabled");
							btn.textContent = "✔ 切分并入库";
						}
						busy = false;
					});
					actions.appendChild(btn);
					for (const w of parsed.warnings) {
						actions.appendChild(el(doc, "div", "tm-import-muted", "⚠ " + w));
					}
				} catch (e: any) {
					status.textContent = "解析失败：" + String(e.message || e);
				}
			};

			wrap.appendChild(status);
			wrap.appendChild(outlineBox);
			wrap.appendChild(actions);
			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
			renderPreview();
		}
		refresh() { return false; }
	}
	return SplitToolWidget as any;
}

function makePasteSplit(): WidgetCtor {
	class PasteSplitWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wrap = el(doc, "div", "tm-paste-split");
			const ta = doc.createElement("textarea");
			ta.className = "tm-paste-textarea";
			ta.placeholder = "粘贴 markdown / HTML / 纯文本…";
			ta.rows = 8;
			wrap.appendChild(ta);
			const btn = el(doc, "button", "tc-btn-primary", "切分文本");
			const status = el(doc, "div", "tm-import-muted", "");
			btn.addEventListener("click", async () => {
				const text = String(ta.value || "").trim();
				if (!text) { status.textContent = "内容为空"; return; }
				const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").replace(/^!\s*/, "").slice(0, 40) || "粘贴内容";
				btn.setAttribute("disabled", "true");
				status.textContent = "解析中…";
				try {
					const r = await pipeline.runSplit({ text, title: firstLine, bag: this.wiki.getTiddlerText("$:/temp/tidme-import/bag", "") || "default" });
					if (!r.tiddlers.some((x: any) => Array.isArray(x.tags) && x.tags.includes("?"))) throw new Error("未切分出任何节");
					for (const tdl of r.tiddlers) this.wiki.addTiddler(tdl);
					this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/tidme/import/ui/notify-done" });
					this.dispatchEvent({ type: "tm-navigate", navigateTo: r.tiddlers[0].title });
				} catch (e: any) {
					status.textContent = "切分失败：" + String(e.message || e);
					btn.removeAttribute("disabled");
				}
			});
			wrap.appendChild(btn);
			wrap.appendChild(status);
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
			const wrap = el(doc, "div", "tm-inbox-split");
			const listBox = el(doc, "div", "");
			const refresh = () => {
				listBox.textContent = "";
				const items = this.wiki.filterTiddlers("[tag[tidme-inbox]!is[draft]]");
				if (!items.length) {
					listBox.appendChild(el(doc, "div", "tm-import-muted", "收件箱为空——用 TW-WebClipper 剪藏时会带上 tidme-inbox 标签。"));
					return;
				}
				for (const item of items) {
					const row = el(doc, "div", "tm-import-row");
					const head = el(doc, "strong", "", item);
					row.appendChild(head);
					const btn = el(doc, "button", "tc-btn-primary", "切分");
					btn.addEventListener("click", async () => {
						btn.setAttribute("disabled", "true");
						btn.textContent = "…";
						try {
							await commitSplit(this.wiki, this, item);
							this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/tidme/import/ui/notify-done" });
							refresh();
						} catch (e: any) {
							btn.textContent = "失败：" + String((e as any).message || e);
						}
					});
					row.appendChild(btn);
					listBox.appendChild(row);
				}
			};
			wrap.appendChild(el(doc, "h3", "", "剪藏收件箱（tidme-inbox）"));
			wrap.appendChild(listBox);
			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
			refresh();
		}
		refresh() { return false; }
	}
	return InboxSplitWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["split-tool"] = makeSplitTool();
exports["paste-split"] = makePasteSplit();
exports["inbox-split"] = makeInboxSplit();
