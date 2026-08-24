/*
widgets/section.ts — M3 阅读闭环组件 v3.2（Phase B）

条栏两行布局（信息与按钮分离，全部按钮统一 tm-sec-btn 风格）：
- 第一行（信息）：面包屑 · 位置 X/Y · 本书剩 N 张待学 · 已读状态
- 第二行（按钮）：◀ ▶ ｜ 续读点 ⏸⏮✕ ｜ 生命周期 ✔已读/↩重新加入 ⏩稍后 ｜ 制卡 摘录 挖空 ｜ ？
即时刷新：refresh 检测本文档任何卡 / 本卡 / 续读点变化 → 重建条栏。
全局快捷键：Alt+X 摘录 · Alt+Z 挖空 · Ctrl+F7 设续读点 · Alt+F7 跳转 · Shift+Ctrl+F7 清除
衍生卡（摘录/挖空）显示迷你生命周期条（✔完成 / 🗑删除）。
<$doc-resume> 文档页「继续阅读」（同样即时刷新）。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/tidme/import/pipeline.js");
const sched = require("$:/plugins/tidme/core/scheduler.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const READPOINT_PREFIX = "$:/state/tidme-import/readpoint/";

interface ReadPoint { t: string; s: string }

// 跨渲染共享的上下文（模块作用域，勿挂 global）
const CTX: { widget: any; lastDoc: string } = { widget: null, lastDoc: "" };

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function twDateString(d: Date): string {
	return pipeline.twDateString(d);
}

/** 某文档的全部正文章节（排除摘录/挖空等衍生卡；兼容无 kind 的历史导入） */
function sectionsOfDoc(wiki: any, doc: string): string[] {
	return wiki
		.filterTiddlers("[has[tidme.doc]nsort[tidme.order]]")
		.filter((t: string) => {
			const f = wiki.getTiddler(t)?.fields;
			if (!f) return false;
			const kind = f["tidme.kind"];
			return kind === "section" || (kind === undefined && f["tidme.order"] !== undefined);
		});
}

function isDone(f: any): boolean {
	if (!f) return false;
	if (f["tidme.done"] === "yes") return true;
	const tags = f?.tags;
	return !tags || !tags.includes("?");
}

function parseReadPoint(wiki: any, doc: string): ReadPoint | null {
	const raw = wiki.getTiddlerText(READPOINT_PREFIX + doc, "").trim();
	if (!raw) return null;
	try {
		const o = JSON.parse(raw);
		if (o && o.t) return { t: String(o.t), s: String(o.s || "") };
	} catch { /* 旧格式：纯标题 */ }
	return { t: raw, s: "" };
}

function saveReadPoint(wiki: any, doc: string, rp: ReadPoint) {
	wiki.addTiddler({ title: READPOINT_PREFIX + doc, type: "application/json", text: JSON.stringify(rp) });
}

function clearReadPoint(wiki: any, doc: string) {
	wiki.deleteTiddler(READPOINT_PREFIX + doc);
}

/** 解析 tidme.anchor（{section, snippet}） */
function parseAnchor(raw: any): { section: string; snippet: string } | null {
	if (!raw) return null;
	try {
		const o = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (o && o.section) return { section: String(o.section), snippet: String(o.snippet || "") };
	} catch { /* 忽略非法 anchor */ }
	return null;
}

function frameTitleOfSelection(win: any): string | null {
	const sel = win?.getSelection?.();
	if (!sel || sel.isCollapsed || !sel.anchorNode) return null;
	let node: any = sel.anchorNode;
	while (node) {
		if (node.getAttribute) {
			const t = node.getAttribute("data-tiddler-title");
			if (t) return t;
		}
		node = node.parentNode;
	}
	return null;
}

function currentDocId(win: any): string | null {
	const title = frameTitleOfSelection(win);
	if (title) {
		const f = CTX.widget?.wiki.getTiddler(title)?.fields;
		if (f?.["tidme.doc"]) return String(f["tidme.doc"]);
	}
	return CTX.lastDoc || null;
}

function notify(kind: "extract" | "cloze" | "readpoint" | "select-first" | "done" | "later") {
	const map = {
		extract: "$:/plugins/tidme/import/ui/notify-extract",
		cloze: "$:/plugins/tidme/import/ui/notify-cloze",
		readpoint: "$:/plugins/tidme/import/ui/notify-readpoint",
		"select-first": "$:/plugins/tidme/import/ui/notify-select-first",
		done: "$:/plugins/tidme/import/ui/notify-section-done",
		later: "$:/plugins/tidme/import/ui/notify-later"
	} as const;
	try { CTX.widget?.dispatchEvent({ type: "tm-notify", param: map[kind] }); } catch { /* ignore */ }
}

function navigate(target: string) {
	try { CTX.widget?.dispatchEvent({ type: "tm-navigate", navigateTo: target }); } catch { /* ignore */ }
}

/** 关闭当前卡并跳转（避免故事流堆积；评分路径 fsrs4tw repeat 已有关闭） */
function navigateClose(target: string) {
	try {
		CTX.widget?.dispatchEvent({ type: "tm-close-tiddler" });
		CTX.widget?.dispatchEvent({ type: "tm-navigate", navigateTo: target });
	} catch { /* ignore */ }
}

/** 在目标节的已渲染 DOM 中查找片段并临时包一层 <mark> */
function highlightSnippetLater(doc: Document, targetTitle: string, snippet: string) {
	if (!snippet) return;
	let tries = 0;
	const tick = () => {
		tries++;
		const escFn = (window as any).CSS?.escape ?? ((s: string) => s);
		const frame = doc.querySelector(`[data-tiddler-title="${escFn(targetTitle)}"]`);
		if (!frame) { if (tries < 30) setTimeout(tick, 120); return; }
		frame.querySelectorAll("mark.tm-readpoint").forEach((m: any) => {
			const p = m.parentNode!;
			while (m.firstChild) p.insertBefore(m.firstChild, m);
			p.removeChild(m);
		});
		const walker = doc.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
		const nodes: Text[] = [];
		const hay: string[] = [];
		let n: any;
		while ((n = walker.nextNode())) { nodes.push(n as Text); hay.push(n.nodeValue || ""); }
		const all = hay.join("\u0000");
		const needle = snippet.slice(0, Math.min(snippet.length, 80));
		const at = all.indexOf(needle);
		if (at === -1) return;
		let acc = 0, startNode: Text | null = null, startPos = 0;
		for (let i = 0; i < nodes.length; i++) {
			const len = hay[i].length;
			if (at < acc + len) { startNode = nodes[i]; startPos = at - acc; break; }
			acc += len + 1;
		}
		if (!startNode) return;
		try {
			const r = doc.createRange();
			r.setStart(startNode, startPos);
			r.setEnd(startNode, startPos + needle.length);
			const mark = doc.createElement("mark");
			mark.className = "tm-readpoint";
			r.surroundContents(mark);
			mark.scrollIntoView({ block: "center" });
		} catch { /* 跨复杂边界时放弃高亮 */ }
	};
	setTimeout(tick, 150);
}

/** 摘录卡字段（Alt+X）。tidme.anchor = 原文定位（跳回 Section 高亮用） */
function buildExtract(wiki: any, parentTitle: string, selection: string): Record<string, any> {
	const pf = wiki.getTiddler(parentTitle)?.fields || {};
	const fsrs = pipeline.initialFsrsFields(new Date());
	const base = `${parentTitle} › 摘录`;
	let title = base;
	let i = 2;
	while (wiki.getTiddler(title)) title = `${base} ${i++}`;
	const crumbTail = String(pf["tidme.breadcrumb"] || parentTitle);
	const preview = selection.replace(/\s+/g, " ").trim().slice(0, 30);
	return {
		title,
		type: "text/vnd.tiddlywiki",
		tags: ["?"],
		caption: preview + (selection.length > preview.length ? "…" : ""),
		text: `<blockquote>\n${escapeHtml(selection.trim())}\n</blockquote>\n\n<p class="tm-import-muted">—— 摘自 [[${parentTitle}]]</p>`,
		...fsrs,
		...(pf.bag ? { bag: pf.bag } : {}),
		revision: "0",
		"tidme.doc": pf["tidme.doc"] || "",
		"tidme.parent": parentTitle,
		"tidme.kind": "extract",
		"tidme.anchor": JSON.stringify({ section: parentTitle, snippet: selection.replace(/\s+/g, " ").trim().slice(0, 80) }),
		"tidme.breadcrumb": `${crumbTail} › 摘录`,
		"tidme.source": pf["tidme.source"] || "",
		"tidme.author": pf["tidme.author"] || "",
		"tidme.format": pf["tidme.format"] || ""
	};
}

/** 挖空卡字段（Alt+Z） */
function buildCloze(wiki: any, parentTitle: string, block: string, selected: string): Record<string, any> | null {
	const at = block.indexOf(selected);
	if (at === -1) return null;
	const safeSel = selected.replace(/"/g, "”");
	const clozeLine = `${block.slice(0, at)}<<C "${safeSel}" "c1" "">>${block.slice(at + selected.length)}`;
	const pf = wiki.getTiddler(parentTitle)?.fields || {};
	const fsrs = pipeline.initialFsrsFields(new Date());
	const base = `${parentTitle} › 挖空`;
	let title = base;
	let i = 2;
	while (wiki.getTiddler(title)) title = `${base} ${i++}`;
	const crumbTail = String(pf["tidme.breadcrumb"] || parentTitle);
	return {
		title,
		type: "text/vnd.tiddlywiki",
		tags: ["?"],
		caption: clozeLine,
		text: "",
		...fsrs,
		...(pf.bag ? { bag: pf.bag } : {}),
		revision: "0",
		"tidme.doc": pf["tidme.doc"] || "",
		"tidme.parent": parentTitle,
		"tidme.kind": "cloze",
		"tidme.anchor": JSON.stringify({ section: parentTitle, snippet: selected.replace(/\s+/g, " ").trim().slice(0, 80) }),
		"tidme.breadcrumb": `${crumbTail} › 挖空`,
		"tidme.source": pf["tidme.source"] || "",
		"tidme.author": pf["tidme.author"] || "",
		"tidme.format": pf["tidme.format"] || ""
	};
}

// ---------- 动作 ----------
function actionExtract(win: any) {
	const tt = frameTitleOfSelection(win);
	if (!tt) { notify("select-first"); return; }
	const sel = win.getSelection?.();
	const selection = String(sel ?? "").trim();
	if (selection.length < 2) { notify("select-first"); return; }
	CTX.widget.wiki.addTiddler(buildExtract(CTX.widget.wiki, tt, selection));
	sel!.removeAllRanges();
	navigate(tt);
	notify("extract");
}

function actionCloze(win: any) {
	const tt = frameTitleOfSelection(win);
	if (!tt) { notify("select-first"); return; }
	const sel = win.getSelection?.();
	if (!sel || sel.isCollapsed || sel.rangeCount === 0) { notify("select-first"); return; }
	const BLOCK = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);
	let node: any = sel.getRangeAt(0).startContainer;
	while (node && !(node.tagName && BLOCK.has(String(node.tagName)))) node = node.parentNode;
	if (!node) { notify("select-first"); return; }
	const block = String(node.textContent || "").replace(/\s+/g, " ").trim();
	const selected = String(sel).trim();
	const fields = buildCloze(CTX.widget.wiki, tt, block, selected);
	if (!fields) { notify("select-first"); return; }
	CTX.widget.wiki.addTiddler(fields);
	sel.removeAllRanges();
	navigate(tt);
	notify("cloze");
}

function actionSetReadPoint(win: any) {
	const tt = frameTitleOfSelection(win);
	const docId = currentDocId(win);
	if (!docId) return;
	const sel = win.getSelection?.();
	const snippet = sel && !sel.isCollapsed ? String(sel).trim().slice(0, 200) : "";
	const target = tt || parseReadPoint(CTX.widget.wiki, docId)?.t || sectionsOfDoc(CTX.widget.wiki, docId)[0];
	if (!target) return;
	saveReadPoint(CTX.widget.wiki, docId, { t: target, s: snippet });
	highlightSnippetLater(document, target, snippet);
	notify("readpoint");
}

function actionGotoReadPoint(win: any) {
	const docId = currentDocId(win);
	if (!docId) return;
	const rp = parseReadPoint(CTX.widget.wiki, docId);
	if (!rp) return;
	highlightSnippetLater(document, rp.t, rp.s);
	navigateClose(rp.t);
}

function actionClearReadPoint(win: any) {
	const docId = currentDocId(win);
	if (!docId) return;
	clearReadPoint(CTX.widget.wiki, docId);
	document.querySelectorAll("mark.tm-readpoint").forEach((m: any) => {
		const pp = m.parentNode!;
		while (m.firstChild) pp.insertBefore(m.firstChild, m);
		pp.removeChild(m);
	});
}

// ---------- 全局快捷键（模块级只注册一次；仅浏览器环境） ----------
let keysBound = false;
if (typeof document !== "undefined" && !keysBound) {
	keysBound = true;
	const KEYMAP: Record<string, (e: KeyboardEvent) => boolean> = {
		"alt+x": (e) => e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "x",
		"alt+z": (e) => e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z",
		"ctrl+f7": (e) => e.ctrlKey && !e.shiftKey && e.key === "F7",
		"alt+f7": (e) => e.altKey && !e.ctrlKey && !e.shiftKey && e.key === "F7",
		"shift+ctrl+f7": (e) => e.ctrlKey && e.shiftKey && e.key === "F7"
	};
	const ACTIONS: Record<string, () => void> = {
		"alt+x": () => actionExtract(document.defaultView || globalThis),
		"alt+z": () => actionCloze(document.defaultView || globalThis),
		"ctrl+f7": () => actionSetReadPoint(document.defaultView || globalThis),
		"alt+f7": () => actionGotoReadPoint(document.defaultView || globalThis),
		"shift+ctrl+f7": () => actionClearReadPoint(document.defaultView || globalThis)
	};
	document.addEventListener("keydown", (e: KeyboardEvent) => {
		const tag = String((e.target as any)?.tagName || "").toLowerCase();
		if (tag === "input" || tag === "textarea" || (e.target as any)?.isContentEditable) return;
		for (const key of Object.keys(KEYMAP)) {
			if (KEYMAP[key](e)) { e.preventDefault(); ACTIONS[key](); return; }
		}
	}, true);
}

// ---------- Widgets ----------

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

function makeSectionBar(): WidgetCtor {
	class SectionBarWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const title = this.getVariable("currentTiddler");
			const t = title && this.wiki.getTiddler(title);
			if (!t || !t.fields["tidme.doc"]) return;

			CTX.widget = this;
			const docId = String(t.fields["tidme.doc"]);
			CTX.lastDoc = docId;

			// 响应式：保存身份与根节点，refresh 时按需重建（信息即时更新）
			this._title = title;
			this._docId = docId;
			const root = el(doc, "div", "tm-section-bar");
			this._root = root;

			this.build();

			parent.insertBefore(root, nextSibling);
			this.domNodes.push(root);
		}

		build() {
			const doc = this.document;
			const win = (doc as any).defaultView || globalThis; // 服务器/无头环境兜底
			const wiki = this.wiki;
			const title = this._title;
			const docId = this._docId;
			const t = wiki.getTiddler(title);
			if (!t) return;
			const fields = t.fields;
			const root = this._root;
			root.textContent = "";

			const mkBtn = (label: string, variant: string, tip: string, disabled = false, onClick?: () => void) => {
				const b = el(doc, "button", variant ? `tm-sec-btn tm-sec-btn--${variant}` : "tm-sec-btn", label);
				b.title = tip;
				if (disabled) b.setAttribute("disabled", "true");
				else if (onClick) b.addEventListener("click", onClick);
				return b;
			};

			// 两行布局：第一行信息，第二行按钮
			const infoRow = el(doc, "div", "tm-section-row tm-section-info");
			const btnRow = el(doc, "div", "tm-section-row tm-section-btns");
			const sep = () => btnRow.appendChild(el(doc, "span", "tm-bar-sep"));
			const gotoSection = (target: string) => {
				saveReadPoint(wiki, docId, { t: target, s: "" });
				this.dispatchEvent({ type: "tm-close-tiddler" }); // 关闭当前卡，避免故事流堆积
				this.dispatchEvent({ type: "tm-navigate", navigateTo: target });
			};

			// 衍生卡（摘录/挖空）：信息行（来源）+ 按钮行（回原文/完成/删除）
			const kind = fields["tidme.kind"];
			if (kind === "extract" || kind === "cloze") {
				const kindName = kind === "cloze" ? "挖空卡" : "摘录卡";
				const span = el(doc, "span", "tm-import-muted");
				span.appendChild(doc.createTextNode(`${kindName} · 源自 `));
				const link = el(doc, "a", "tc-tiddlylink", String(fields["tidme.parent"] || ""));
				link.href = "#";
				link.addEventListener("click", (e: Event) => {
					e.preventDefault();
					this.dispatchEvent({ type: "tm-close-tiddler" });
					this.dispatchEvent({ type: "tm-navigate", navigateTo: String(fields["tidme.parent"]) });
				});
				span.appendChild(link);
				infoRow.appendChild(span);
				root.appendChild(infoRow);

				const anchor = parseAnchor(fields["tidme.anchor"]);
				if (anchor) {
					btnRow.appendChild(mkBtn("↩ 回原文", "rp", "跳回原文并高亮此片段", false, () => {
						this.dispatchEvent({ type: "tm-close-tiddler" });
						this.dispatchEvent({ type: "tm-navigate", navigateTo: anchor.section });
						highlightSnippetLater(doc, anchor.section, anchor.snippet);
					}));
				}
				btnRow.appendChild(mkBtn("✔ 完成", "done", "读完此卡：移出学习队列", false, () => {
					wiki.addTiddler(sched.doneCard(fields));
					notify("done");
				}));
				btnRow.appendChild(mkBtn("🗑 删除", "del", "彻底删除此卡", false, () => {
					wiki.deleteTiddler(title);
				}));
				root.appendChild(btnRow);
				return;
			}

			// 普通阅读节
			const list = sectionsOfDoc(wiki, docId);
			const { prev, next, index } = pipeline.neighborsOf(list, title);
			const rp = parseReadPoint(wiki, docId);
			const left = list.filter((x) => !isDone(wiki.getTiddler(x)?.fields)).length;

			// 第一行：面包屑 · 位置 · 本书剩余 · 已读状态
			const crumb = el(doc, "span", "tm-section-crumb tm-import-muted", String(fields["tidme.breadcrumb"] || ""));
			crumb.title = "点击打开本书汇总页";
			crumb.addEventListener("click", () => {
				this.dispatchEvent({ type: "tm-close-tiddler" });
				this.dispatchEvent({ type: "tm-navigate", navigateTo: String(fields["tidme.breadcrumb"] || "").split(" › ")[0] });
			});
			infoRow.appendChild(crumb);
			infoRow.appendChild(el(doc, "span", "tm-section-pos tm-import-muted", `　${index + 1} / ${list.length}`));
			infoRow.appendChild(el(doc, "span", "tm-section-load tm-import-muted", `· 本书剩 ${left} 张待学`));
			if (isDone(fields)) {
				infoRow.appendChild(el(doc, "span", "tm-section-state", "✓ 已读"));
			}
			root.appendChild(infoRow);

			// 第二行：全部按钮（统一 tm-sec-btn 风格）
			btnRow.appendChild(mkBtn("◀", "nav", "上一节", !prev, () => { if (prev) gotoSection(prev); }));
			btnRow.appendChild(mkBtn("▶", "nav", "下一节", !next, () => { if (next) gotoSection(next); }));

			sep();

			// 续读点三连（Ctrl+F7 / Alt+F7 / Ctrl+Shift+F7）
			btnRow.appendChild(mkBtn("⏸", "rp", "设续读点 (Ctrl+F7)：以当前选中文字为锚", false, () => actionSetReadPoint(win)));
			if (rp) {
				if (rp.t !== title) {
					btnRow.appendChild(mkBtn("⏮ " + (rp.s ? "「" + rp.s.slice(0, 10) + "…」" : rp.t.slice(0, 14)), "rp", "转到续读点 (Alt+F7)", false, () => actionGotoReadPoint(win)));
				}
				btnRow.appendChild(mkBtn("✕", "rpclear", "清除续读点 (Ctrl+Shift+F7)", false, () => actionClearReadPoint(win)));
			}

			sep();

			// 生命周期：一记忆一动作 —— 要么 Done，要么明确顺延
			if (isDone(fields)) {
				btnRow.appendChild(mkBtn("↩ 重新加入", "undo", "恢复到学习队列", false, () => {
					wiki.addTiddler(sched.restoreCard(fields));
				}));
			} else {
				btnRow.appendChild(mkBtn("✔ 已读", "done", "Done！读完此节，移出学习队列", false, () => {
					// Done 语义：出队 = 去 ?（默认牌组）与 .（阅读牌组）+ tidme.done 标记
					wiki.addTiddler(sched.doneCard(fields));
					// 撤销芯片：8 秒内可反悔（防止误触批量已读）；刷新后自动消失
					const undo = mkBtn("↩ 撤销已读", "undo", "恢复到学习队列", false, () => {
						wiki.addTiddler(sched.restoreCard(fields));
						undo.parentNode?.removeChild(undo);
					});
					btnRow.insertBefore(undo, btnRow.querySelector(".tm-bar-sep"));
					setTimeout(() => { undo.parentNode?.removeChild(undo); }, 8000);
					const nxt = list.find((x) => x !== title && !isDone(wiki.getTiddler(x)?.fields));
					if (nxt) {
						saveReadPoint(wiki, docId, { t: nxt, s: "" });
						this.dispatchEvent({ type: "tm-close-tiddler" });
						this.dispatchEvent({ type: "tm-navigate", navigateTo: nxt });
					}
					notify("done");
				}));
				btnRow.appendChild(mkBtn("⏩", "later", "稍后再看：明确顺延 333 天（不是拖延，是排程）", false, () => {
					const due = twDateString(new Date(Date.now() + 333 * 86400000));
					wiki.addTiddler({ ...fields, due });
					const nxt = list.find((x) => x !== title && !isDone(wiki.getTiddler(x)?.fields));
					if (nxt) {
						this.dispatchEvent({ type: "tm-close-tiddler" });
						this.dispatchEvent({ type: "tm-navigate", navigateTo: nxt });
					}
					notify("later");
				}));
			}

			sep();

			// 制卡
			btnRow.appendChild(mkBtn("摘录", "extract", "摘录制卡 (Alt+X)", false, () => actionExtract(win)));
			btnRow.appendChild(mkBtn("挖空", "cloze", "挖空制卡 (Alt+Z)", false, () => actionCloze(win)));

			// 帮助
			btnRow.appendChild(mkBtn("？", "help", "快捷键与用法帮助", false, () => {
				this.dispatchEvent({ type: "tm-navigate", navigateTo: "$:/plugins/tidme/import/ui/help-shortcuts" });
			}));

			root.appendChild(btnRow);
		}

		refresh(changedTiddlers: Record<string, any>) {
			// 即时刷新：本文档任何卡 / 本卡 / 续读点 变化 → 重建条栏（信息与按钮保持最新）
			if (!this._root || !this._title || !this._docId) return false;
			let need = false;
			for (const title of Object.keys(changedTiddlers || {})) {
				if (title === this._title || title === READPOINT_PREFIX + this._docId) { need = true; break; }
				const f = this.wiki.getTiddler(title)?.fields;
				if (f && (f["tidme.doc"] === this._docId || f["tidme.parent"] === this._title)) { need = true; break; }
			}
			if (need) { this.build(); return true; }
			return false;
		}
	}
	return SectionBarWidget as any;
}

function makeDocResume(): WidgetCtor {
	class DocResumeWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const title = this.getVariable("currentTiddler");
			const t = title && this.wiki.getTiddler(title);
			if (!t || !t.fields["tidme.doc"]) return;
			CTX.widget = this;
			const docId = String(t.fields["tidme.doc"]);

			this._title = title;
			this._docId = docId;
			const wrap = el(doc, "div", "tm-doc-resume");
			this._root = wrap;

			this.build();

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}

		build() {
			const doc = this.document;
			const wiki = this.wiki;
			const title = this._title;
			const docId = this._docId;
			const wrap = this._root;
			wrap.textContent = "";

			// 进度聚合（M3-T5）：已读 / 总数 / 剩余待学
			const all = sectionsOfDoc(wiki, docId);
			const done = all.filter((x) => isDone(wiki.getTiddler(x)?.fields)).length;
			const left = all.length - done;
			const btn = el(doc, "button", "tc-btn-primary", "▶ 继续阅读");
			btn.addEventListener("click", () => {
				const rp = parseReadPoint(wiki, docId);
				const list = all.filter((x) => !isDone(wiki.getTiddler(x)?.fields));
				const target = rp && list.includes(rp.t) ? rp.t : list[0];
				if (target) {
					this.dispatchEvent({ type: "tm-close-tiddler" }); // 关闭文档页，进入阅读
					this.dispatchEvent({ type: "tm-navigate", navigateTo: target });
				}
			});
			wrap.appendChild(btn);
			wrap.appendChild(el(doc, "span", "tm-import-muted",
				`　已读 ${done} / ${all.length} · 剩余 ${left} 节待学`));

			// 已读区：列出已读节，可"重新加入"队列（恢复可逆性，替代 8 秒撤销窗口）
			const doneTitles = all.filter((x) => isDone(wiki.getTiddler(x)?.fields));
			if (doneTitles.length) {
				const doneBox = el(doc, "details", "tm-doc-done");
				const summary = el(doc, "summary", "tm-import-muted", `已读卡（${doneTitles.length}）—— 可重新加入`);
				doneBox.appendChild(summary);
				for (const dt of doneTitles) {
					const row = el(doc, "div", "tm-doc-done-row");
					const label = el(doc, "span", "tm-import-muted",
						String(wiki.getTiddler(dt)?.fields["tidme.breadcrumb"] || dt).split(" › ").pop() || dt);
					row.appendChild(label);
					const back = el(doc, "button", "tm-cm-op", "重新加入");
					back.title = "恢复到学习队列";
					back.addEventListener("click", () => {
						const f = wiki.getTiddler(dt)?.fields;
						if (f) wiki.addTiddler(sched.restoreCard(f));
						row.parentNode?.removeChild(row);
					});
					row.appendChild(back);
					doneBox.appendChild(row);
				}
				wrap.appendChild(doneBox);
			}
		}

		refresh(changedTiddlers: Record<string, any>) {
			// 即时刷新：本文档任何卡变化 → 重建进度与已读区
			if (!this._root || !this._title || !this._docId) return false;
			let need = false;
			for (const title of Object.keys(changedTiddlers || {})) {
				if (title === READPOINT_PREFIX + this._docId) { need = true; break; }
				const f = this.wiki.getTiddler(title)?.fields;
				if (f && f["tidme.doc"] === this._docId) { need = true; break; }
			}
			if (need) { this.build(); return true; }
			return false;
		}
	}
	return DocResumeWidget as any;
}

exports["section-bar"] = makeSectionBar();
exports["doc-resume"] = makeDocResume();

// 供单元测试/复用：纯字段构建器与锚点解析
exports.buildExtract = buildExtract;
exports.buildCloze = buildCloze;
exports.parseAnchor = parseAnchor;
