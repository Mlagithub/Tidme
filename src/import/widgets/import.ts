/*
widgets/import.ts — 自包含导入组件

<$import-file> 一个组件完成全部交互：
  拖放/选择 → 调用共享管线解析 → 就地渲染预览（含目录大纲折叠面板）→ 导入/清除。
不依赖 wikitext 响应式列表（规避状态刷新时序问题）；完整产物留在模块级缓存。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/tidme/import/pipeline.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

interface ImportResult {
	bookTitle: string;
	docId: string;
	format: string;
	sectionCount: number;
	stats: { hardSplitCount: number };
	tiddlers: Record<string, any>[];
	warnings: string[];
}

// 模块级结果缓存：token → 完整产物
const results = new Map<string, { result: ImportResult; at: number }>();
function cacheResult(result: ImportResult): string {
	const token = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	results.set(token, { result, at: Date.now() });
	for (const [k, v] of results) if (Date.now() - v.at > RESULT_TTL_MS) results.delete(k);
	return token;
}
const RESULT_TTL_MS = 30 * 60 * 1000;

function getOptions(wiki: any): { maxChars?: number; minChars?: number; bag: string } {
	const num = (t: string) => {
		const v = parseInt(wiki.getTiddlerText(t, "").trim(), 10);
		return Number.isFinite(v) && v > 0 ? v : undefined;
	};
	const bag = (wiki.getTiddlerText("$:/temp/tidme-import/bag", "") || "").trim();
	return {
		maxChars: num("$:/temp/tidme-import/max"),
		minChars: num("$:/temp/tidme-import/min"),
		bag: bag || "default" // TiddlyWeb server 版同步目标桶
	};
}

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

/** 单本书的预览行：✔/✘、统计、可展开的目录大纲 */
function buildRow(doc: Document, token: string, resultOrErr: { result?: ImportResult; error?: string; fileName: string; duplicate?: boolean }): HTMLElement {
	const row = el(doc, "div", "tm-import-row");
	const err = resultOrErr.error;
	if (err) {
		row.classList.add("tm-import-error");
		row.appendChild(el(doc, "span", "", "✘ " + resultOrErr.fileName + " — " + err));
		return row;
	}
	const r = resultOrErr.result!;
	const head = el(doc, "div", "");
	const mark = el(doc, "strong", "", "✔ " + r.bookTitle);
	head.appendChild(mark);
	head.appendChild(el(doc, "span", "tm-import-muted",
		`　(${r.format} · ${r.sectionCount} 节 · 硬切 ${r.stats.hardSplitCount} 块${r.warnings.length ? " · 标题去重 " + r.warnings.length : ""})`));
	row.appendChild(head);

	if (resultOrErr.duplicate) {
		row.appendChild(el(doc, "div", "tm-import-dup", "⚠ 本书已在库中 —— 再次导入将以相同内容覆盖同名卡片（进度字段保留）"));
	}

	// 目录大纲（前 20 条，按层级缩进；标注合并/续切）
	const crumbs = r.tiddlers
		.filter((t) => Array.isArray(t.tags) && t.tags.includes("?"))
		.map((t) => {
			const bc = String(t["tidme.breadcrumb"] || "");
			const segs = bc.split(" › ");
			let line = "　".repeat(Math.max(0, segs.length - 2)) + segs[segs.length - 1];
			if (t["tidme.merged"]) line += " ⟵已并入上一节";
			return line;
		});
	if (crumbs.length) {
		const details = el(doc, "details", "tm-import-outline");
		details.appendChild(el(doc, "summary", "tm-import-muted", `目录大纲（前 ${Math.min(20, crumbs.length)} / ${crumbs.length} 条）`));
		const pre = el(doc, "pre", "tm-import-outline-pre", crumbs.slice(0, 20).join("\n"));
		details.appendChild(pre);
		row.appendChild(details);
	}
	row.dataset.token = token;
	return row;
}

function makeFileWidget(): WidgetCtor {
	class ImportFileWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();

			const doc = this.document;
			const wrap = el(doc, "div", "tm-import-widget");

			// 拖放区
			const drop = el(doc, "div", "tm-import-dropzone", this.getAttribute("caption", "点击选择或拖入 .epub / .md / .txt"));
			const input = doc.createElement("input");
			input.type = "file";
			input.multiple = true;
			input.accept = ".epub,.md,.markdown,.txt";
			input.style.display = "none";

			// 预览容器 + 操作按钮
			const rowsBox = el(doc, "div", "tm-import-rows");
			const actions = el(doc, "div", "tm-import-actions");
			actions.style.display = "none";
			const btnImport = el(doc, "button", "tc-btn-primary", "✔ 全部导入");
			const btnClear = el(doc, "button", "", "清除");

			const pending = new Map<string, { result?: ImportResult; error?: string; fileName: string; duplicate?: boolean }>();

			const refreshActions = () => {
				actions.style.display = pending.size ? "" : "none";
			};

			btnImport.addEventListener("click", () => {
				let created = 0;
				for (const [token, item] of pending) {
					if (!item.result) continue;
					for (const t of item.result.tiddlers) this.wiki.addTiddler({ ...t });
					created += item.result.tiddlers.length;
					pending.delete(token);
				}
				// 重绘预览区
				rowsBox.textContent = "";
				for (const [token, item] of pending) rowsBox.appendChild(buildRow(doc, token, item));
				refreshActions();
				this.wiki.addTiddler({ title: "$:/temp/tidme-import/last-created", text: String(created) });
				this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/tidme/import/ui/notify-done" });
			});
			btnClear.addEventListener("click", () => {
				pending.clear();
				results.clear();
				rowsBox.textContent = "";
				refreshActions();
			});

			const handleFiles = async (files: File[]) => {
				console.log("[tidme-import] 收到文件:", files.map((f) => f.name));
				const accepted = files.filter((f) => /\.(epub|md|markdown|txt)$/i.test(f.name));
				if (!accepted.length) {
					this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/tidme/import/ui/notify-unsupported" });
					return;
				}
				let totalSections = 0;
				for (const file of accepted) {
					try {
						const bytes = new Uint8Array(await file.arrayBuffer());
						console.log("[tidme-import] 开始解析:", file.name, bytes.length, "bytes");
						const result = await pipeline.runImport(bytes, file.name, getOptions(this.wiki)) as ImportResult;
						console.log("[tidme-import] 解析成功:", result.bookTitle, result.sectionCount, "节");
						// 重复导入检测：同 docId 已在库中
						const docId = result.docId;
						const existing = this.wiki.filterTiddlers(`[has[tidme.doc]]`).filter((t: string) => {
							return this.wiki.getTiddler(t)?.fields["tidme.doc"] === docId && t !== result.bookTitle;
						}).length;
						const token = cacheResult(result);
						totalSections += result.sectionCount;
						pending.set(token, { result, fileName: file.name, duplicate: existing > 0 });
						rowsBox.appendChild(buildRow(doc, token, { result, fileName: file.name, duplicate: existing > 0 }));
					} catch (err: any) {
						console.error("[tidme-import] 解析失败:", file.name, err);
						rowsBox.appendChild(buildRow(doc, "e" + Date.now().toString(36), { error: String(err.message || err), fileName: file.name }));
					}
				}
				// 漏斗摘要（P1 措辞：已安全存档，随时可学）
				if (totalSections > 0) {
					rowsBox.appendChild(el(doc, "div", "tm-import-summary tm-import-muted",
						`—— 本次共入库 ${totalSections} 节，已安全存档并进入默认牌堆，随时可学。`));
				}
				refreshActions();
			};

			input.addEventListener("change", async () => {
				const files = Array.from(input.files || []) as File[];
				input.value = "";
				await handleFiles(files);
			});
			drop.addEventListener("click", () => input.click());
			drop.addEventListener("dragover", (e: DragEvent) => { e.preventDefault(); drop.classList.add("tm-import-over"); });
			drop.addEventListener("dragleave", () => drop.classList.remove("tm-import-over"));
			drop.addEventListener("drop", async (e: DragEvent) => {
				e.preventDefault();
				drop.classList.remove("tm-import-over");
				await handleFiles(Array.from(e.dataTransfer?.files || []) as File[]);
			});

			drop.appendChild(input);
			wrap.appendChild(drop);
			wrap.appendChild(rowsBox);
			wrap.appendChild(actions);
			actions.appendChild(btnImport);
			actions.appendChild(btnClear);
			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return ImportFileWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["import-file"] = makeFileWidget();
