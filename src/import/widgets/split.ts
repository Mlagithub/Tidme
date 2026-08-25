/*
widgets/split.ts — M2 切分入口组件（M4 加优先级三档；G1 加预览干预）

- <$split-tool/>  切分页：解析源 tiddler（$:/temp/tidme/split/source）→ 大纲预览（可干预：并入上一节 / 从此拆分）→ 确认写库
- <$paste-split/> 粘贴切分：textarea → runSplit → 写库
- <$inbox-split/> 剪藏收件箱：列出 tidme-inbox tiddler，逐条/批量切分
切分后源 tiddler 被文档页覆盖（保留 url/author/date 等溯源字段，移除 tidme-inbox 标签）。

干预模型（G1）：预览按节列出，每节以 trail key（breadcrumb）为稳定标识；
"并入上一节"→ overrides.merge 加该 key；"从此拆分"→ overrides.split 加该 key；
每次操作重新 runSplit（overrides 生效）→ 预览刷新；落库用最终结果。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/tidme/import/pipeline.js");
const events = require("$:/plugins/tidme/core/events.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const SOURCE_TIDDLER = "$:/temp/tidme/split/source";

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
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
		overrides
	});
	const [doc, ...cards] = r.tiddlers;
	if (!cards.length) throw new Error("未切分出任何节（内容过短或无可识别结构）");
	const sectionCards = cards.filter((x: any) => Array.isArray(x.tags) && x.tags.includes("?"));

	// G2 对齐：重切分已有文档时增量修补
	const align = require("$:/plugins/tidme/core/align.js");
	const docPage = wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${r.docId}]]`)[0] || "";
	const oldCards = wiki.filterTiddlers(`[tidme.doc[${r.docId}]tidme.kind[section]!is[draft]]`)
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
		// 归档：标记 obsolete + 出队（不硬删）
		for (const at of aligned.archives) {
			const existing = wiki.getTiddler(at);
			if (!existing) continue;
			const tags = Array.isArray(existing.fields.tags) ? existing.fields.tags.filter((x: string) => x !== "?") : [];
			wiki.addTiddler({ ...existing.fields, tags, "tidme.obsolete": "yes" });
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
	const deck = r.tiddlers.find((x: any) => String(x.title).startsWith("$:/Deck/read/"));
	if (deck) wiki.addTiddler(deck);
	// 事件总线：切分完成（split-tool / paste-split / inbox-split 共用此出口）
	events.dispatch(widget, events.EVENTS.IMPORT_DONE, { docId: r.docId, bookTitle: title });
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
			let priorityTier: "high" | "medium" | "low" = "medium";
			// G1 干预指令（trail key 集合；重切分后 key 稳定不漂移）
			const overrides = { merge: new Set<string>(), split: new Set<string>() };
			const status = el(doc, "div", "tm-import-muted", "解析中…");
			const previewBox = el(doc, "div", "tm-split-preview", "");
			const actions = el(doc, "div", "tm-import-actions", "");

			// 优先级三档（M4）：高/中/低 → tierRandom 区间随机分散
			const prioRow = el(doc, "div", "tm-import-actions", "");
			prioRow.appendChild(el(doc, "span", "tm-import-muted", "优先级："));
			const prioSel = doc.createElement("select");
			prioSel.className = "tm-priority-select";
			for (const [label, value] of [["高", "high"], ["中", "medium"], ["低", "low"]] as const) {
				const opt = doc.createElement("option");
				opt.value = value;
				opt.textContent = label;
				prioSel.appendChild(opt);
			}
			prioSel.value = "medium";
			prioSel.addEventListener("change", () => {
				priorityTier = prioSel.value as any;
				renderPreview();
			});
			prioRow.appendChild(prioSel);
			wrap.appendChild(prioRow);

			const toOverrides = () => ({
				merge: [...overrides.merge],
				split: [...overrides.split]
			});
			const keyOf = (s: any) => String((s.trail || []).join(" › "));

			const renderPreview = async () => {
				try {
					const sched = require("$:/plugins/tidme/core/scheduler.js");
					parsed = await pipeline.runSplit({
						text: String(t.fields.text || ""),
						title,
						type: t.fields.type,
						sourceFields: provenanceOf(wiki, title),
						priority: sched.tierRandom(priorityTier),
						overrides: toOverrides()
					});
					const sections = parsed.sections || [];
					const cards = parsed.tiddlers.filter((x: any) => Array.isArray(x.tags) && x.tags.includes("?"));
					status.textContent = `${cards.length} 节 · 硬切 ${parsed.stats.hardSplitCount} 块 · 文档 ID ${parsed.docId}` +
						(overrides.merge.size || overrides.split.size ? " · 已应用干预" : "");
					previewBox.textContent = "";

					// 逐节可操作预览（G1）
					const listBox = el(doc, "div", "tm-split-list", "");
					sections.forEach((s: any, idx: number) => {
						const key = keyOf(s);
						const parts: any[] = s.parts || [];
						const isContainer = s.merged === true && parts.length > 1;
						const splittable = parts.findIndex((p, i) => i > 0 && p.title) > 0;
						const row = el(doc, "div", "tm-split-row" + (isContainer ? " tm-split-row-merged" : ""));
						const depth = Math.max(0, (s.trail || []).length - 1);
						row.style.paddingLeft = `${depth * 1.1}em`;
						// 状态徽章
						const mark = isContainer ? "⟵ 并入" : s.isContinuation ? "续" : "新";
						row.appendChild(el(doc, "span", "tm-split-mark", mark));
						// 干预状态
						if (overrides.merge.has(key)) row.appendChild(el(doc, "span", "tm-split-done", "⇈ 已并入"));
						if (overrides.split.has(key)) row.appendChild(el(doc, "span", "tm-split-done", "⇊ 已拆分"));
						// 标题
						row.appendChild(el(doc, "span", "tm-split-title",
							String(s.title || (s.trail || []).slice(-1)[0] || "") + (s.chars ? `（${s.chars} 字）` : "")));
						// 干预按钮
						if (idx > 0) {
							if (overrides.merge.has(key)) {
								row.appendChild(opBtn("↩ 撤销合并", () => { overrides.merge.delete(key); renderPreview(); }));
							} else {
								row.appendChild(opBtn("⇈ 并入上一节", () => { overrides.merge.add(key); renderPreview(); }));
							}
						}
						if (isContainer && splittable) {
							if (overrides.split.has(key)) {
								row.appendChild(opBtn("↩ 撤销拆分", () => { overrides.split.delete(key); renderPreview(); }));
							} else {
								row.appendChild(opBtn("⇊ 从此拆分", () => { overrides.split.add(key); renderPreview(); }));
							}
						}
						listBox.appendChild(row);
					});
					previewBox.appendChild(listBox);
					for (const w of parsed.warnings) {
						previewBox.appendChild(el(doc, "div", "tm-import-muted", "⚠ " + w));
					}

					actions.textContent = "";
					const btn = el(doc, "button", "tc-btn-primary", "✔ 切分并入库");
					btn.addEventListener("click", async () => {
						if (busy || !parsed) return;
						busy = true;
						btn.setAttribute("disabled", "true");
						btn.textContent = "写入中…";
						try {
							const sched = require("$:/plugins/tidme/core/scheduler.js");
							await commitSplit(wiki, this, title, {}, sched.tierRandom(priorityTier), toOverrides());
							this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/tidme/import/ui/notify-done" });
							this.dispatchEvent({ type: "tm-navigate", navigateTo: parsed.tiddlers[0].title });
						} catch (e: any) {
							status.textContent = "切分失败：" + String(e.message || e);
							btn.removeAttribute("disabled");
							btn.textContent = "✔ 切分并入库";
						}
						busy = false;
					});
					actions.appendChild(btn);
				} catch (e: any) {
					status.textContent = "解析失败：" + String(e.message || e);
				}
			};

			const opBtn = (label: string, onClick: () => void) => {
				const b = el(doc, "button", "tm-split-op", label);
				b.addEventListener("click", onClick);
				return b;
			};

			wrap.appendChild(status);
			wrap.appendChild(previewBox);
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
					events.dispatch(this, events.EVENTS.IMPORT_DONE, { docId: r.docId, bookTitle: firstLine });
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
					row.appendChild(el(doc, "strong", "", item));
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
