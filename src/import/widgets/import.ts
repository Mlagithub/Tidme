/*
widgets/import.ts — 自包含导入组件

<$import-file> 一个组件完成全部交互：
  拖放/选择 → 调用共享管线解析 → 就地渲染预览（含目录大纲折叠面板）→ 导入/清除。
不依赖 wikitext 响应式列表（规避状态刷新时序问题）；完整产物留在模块级缓存。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/tidme/import/pipeline.js");
const events = require("$:/plugins/tidme/core/events.js");
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

/** Uint8Array → base64（浏览器 btoa；分块避免栈溢出） */
function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
	}
	if (typeof btoa === "function") return btoa(bin);
	return bin; // 兜底（无 btoa 环境由服务端容错）
}

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

/** 单本书的预览卡片（P1）：标题行 + 状态 + 树形目录大纲 */
function buildRow(doc: Document, token: string, resultOrErr: { result?: ImportResult; error?: string; fileName: string; duplicate?: boolean }): HTMLElement {
	const card = el(doc, "div", "tm-import-file-card");
	const err = resultOrErr.error;
	if (err) {
		card.classList.add("tm-import-file-card-err");
		card.appendChild(el(doc, "div", "tm-import-file-head",
			`✘ ${resultOrErr.fileName} — ${err}`));
		card.dataset.token = token;
		return card;
	}
	const r = resultOrErr.result!;
	// 标题行：书名 + 格式徽章 + 统计
	const head = el(doc, "div", "tm-import-file-head");
	const title = el(doc, "span", "tm-import-file-title", r.bookTitle);
	head.appendChild(title);
	head.appendChild(el(doc, "span", "tm-import-file-badge", r.format));
	head.appendChild(el(doc, "span", "tm-import-file-meta",
		`${r.sectionCount} 节 · 硬切 ${r.stats.hardSplitCount} 块${r.warnings.length ? " · 标题去重 " + r.warnings.length : ""}`));
	card.appendChild(head);

	if (resultOrErr.duplicate) {
		card.appendChild(el(doc, "div", "tm-import-dup", "⚠ 本书已在库中 —— 再次导入将走对齐（未变节保留 SRS 进度）"));
	}

	// 树形目录大纲（P1：缩进引导线替代 <pre>）
	const crumbs = r.tiddlers
		.filter((t) => Array.isArray(t.tags) && t.tags.includes("?"))
		.map((t) => ({
			path: String(t["tidme.breadcrumb"] || ""),
			merged: t["tidme.merged"] === "yes",
			level: Math.max(0, String(t["tidme.breadcrumb"] || "").split(" › ").length - 2)
		}));
	if (crumbs.length) {
		const details = el(doc, "details", "tm-import-outline");
		details.appendChild(el(doc, "summary", "tm-import-muted",
			`目录大纲（前 ${Math.min(20, crumbs.length)} / ${crumbs.length} 条）`));
		const tree = el(doc, "div", "tm-import-tree", "");
		for (const c of crumbs.slice(0, 20)) {
			const line = el(doc, "div", "tm-import-tree-row" + (c.merged ? " tm-import-tree-merged" : ""));
			line.style.paddingLeft = `${c.level * 1.1}em`;
			line.appendChild(el(doc, "span", "tm-import-tree-text", c.path.split(" › ").pop() || c.path));
			if (c.merged) line.appendChild(el(doc, "span", "tm-import-tree-mark", "⟵ 已并入"));
			tree.appendChild(line);
		}
		details.appendChild(tree);
		card.appendChild(details);
	}
	card.dataset.token = token;
	return card;
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
			const btnClear = el(doc, "button", "tm-btn", "清除");

			// G10 服务端处理选项（TiddlyWeb）：大文件上传 → 服务端后台解析，不阻塞页面
			const serverRow = el(doc, "div", "tm-import-server-row", "");
			const serverCheck = doc.createElement("input");
			serverCheck.type = "checkbox";
			serverCheck.id = "tm-import-server-mode";
			serverRow.appendChild(serverCheck);
			serverRow.appendChild(el(doc, "label", "tm-import-muted",
				"上传到服务端后台处理（适合大文件，解析不阻塞页面；需要 TiddlyWeb 服务端）"));
			const serverStatus = el(doc, "div", "tm-import-muted", "");

			const pending = new Map<string, { result?: ImportResult; error?: string; fileName: string; duplicate?: boolean }>();

			// G10 服务端上传：建 pending tiddler（server importer 契约）→ 轮询状态
			const serverUpload = (file: File) => {
				const row = el(doc, "div", "tm-import-row", "");
				row.appendChild(el(doc, "strong", "", file.name));
				const statusEl = el(doc, "span", "tm-import-muted", "排队中…");
				row.appendChild(statusEl);
				rowsBox.appendChild(row);
				file.arrayBuffer().then((buf) => {
					const b64 = bytesToBase64(new Uint8Array(buf));
					const title = `$:/temp/tidme-import/pending/${Date.now()}-${file.name.replace(/[\\/:*?"<>|]/g, "_")}`;
					this.wiki.addTiddler({
						title,
						tags: ["tidme-pending-import"],
						"tidme.file-name": file.name,
						"tidme.pending": "yes",
						text: b64,
						bag: getOptions(this.wiki).bag
					});
					statusEl.textContent = `已上传（${Math.round(b64.length / 1024)} KB base64），等待服务端处理…`;
					const timer = setInterval(() => {
						const t = this.wiki.getTiddler(title);
						if (!t) { clearInterval(timer); statusEl.textContent = "⚠ 任务 tiddler 丢失"; return; }
						if (t.fields["tidme.import-done"]) {
							clearInterval(timer);
							const secs = t.fields["tidme.import-sections"];
							statusEl.textContent = `✓ 导入完成（docId ${t.fields["tidme.import-docId"] || "?"}${secs ? "，" + secs + " 节" : ""}）`;
							events.dispatch(this, events.EVENTS.IMPORT_DONE, { docId: t.fields["tidme.import-docId"] });
						} else if (t.fields["tidme.import-error"]) {
							clearInterval(timer);
							statusEl.textContent = `✕ 失败：${t.fields["tidme.import-error"]}`;
						}
					}, 2000);
					setTimeout(() => clearInterval(timer), 20 * 60 * 1000); // 兜底超时
				}).catch((e) => { statusEl.textContent = "✕ 读取文件失败：" + String(e.message || e); });
			};

			const refreshActions = () => {
				actions.style.display = pending.size ? "" : "none";
			};

			// A：落库单个解析结果。同 docId 已有旧卡 → alignCards 增量（未变保 SRS 进度 /
			// 修改重挂接 / 新增建卡 / 删除归档），否则全量写库。返回 { created, updated, archived }。
			const commitResult = async (result: ImportResult): Promise<{ created: number; updated: number; archived: number }> => {
				const [doc, ...cards] = result.tiddlers;
				const sectionCards = cards.filter((x: any) => Array.isArray(x.tags) && x.tags.includes("?"));
				const align = require("$:/plugins/tidme/core/align.js");
				const docPage = this.wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${result.docId}]]`)[0] || "";
				const oldCards = this.wiki.filterTiddlers(`[tidme.doc[${result.docId}]tidme.kind[section]!is[draft]]`)
					.map((ot: string) => ({ title: ot, fields: this.wiki.getTiddler(ot)?.fields || {} }));

				let aligned: any = null;
				if (oldCards.length) {
					aligned = await align.alignCards(oldCards, docPage || result.bookTitle,
						sectionCards.map((c: any) => ({ title: c.title, fields: c })));
					for (const k of aligned.keep) this.wiki.addTiddler({ ...k.fields });
					for (const p of aligned.patches) {
						const ex = this.wiki.getTiddler(p.title);
						if (ex) this.wiki.addTiddler({ ...ex.fields, ...p.fields });
					}
					for (const at of aligned.archives) {
						const ex = this.wiki.getTiddler(at);
						if (!ex) continue;
						const tags = Array.isArray(ex.fields.tags) ? ex.fields.tags.filter((x: string) => x !== "?") : [];
						this.wiki.addTiddler({ ...ex.fields, tags, "tidme.obsolete": "yes" });
					}
				}
				// 文档页：复用旧标题（引用稳定），更新索引内容
				const docTitle = docPage || doc.title;
				this.wiki.addTiddler({ ...doc, title: docTitle, "tidme.doc": result.docId });
				if (docPage && docTitle !== doc.title) this.wiki.deleteTiddler(doc.title);
				// 非对齐模式：全量写卡；对齐模式：keep 已写，其余同 key 旧卡已在库
				if (!aligned) {
					for (const c of cards) this.wiki.addTiddler({ ...c });
				}
				// 自动 deck 更新（按 docId 过滤，覆盖字段无 SRS 影响）
				const deck = result.tiddlers.find((x: any) => String(x.title).startsWith("$:/Deck/read/"));
				if (deck) this.wiki.addTiddler({ ...deck });
				return aligned
					? { created: aligned.keep.length, updated: aligned.patches.length, archived: aligned.archives.length }
					: { created: cards.length, updated: 0, archived: 0 };
			};

			btnImport.addEventListener("click", async () => {
				let created = 0, updated = 0, archived = 0;
				for (const [token, item] of pending) {
					if (!item.result) continue;
					const r = await commitResult(item.result);
					created += r.created; updated += r.updated; archived += r.archived;
					pending.delete(token);
				}
				// 重绘预览区
				rowsBox.textContent = "";
				for (const [token, item] of pending) rowsBox.appendChild(buildRow(doc, token, item));
				refreshActions();
				this.wiki.addTiddler({ title: "$:/temp/tidme-import/last-created", text: String(created) });
				events.dispatch(this, events.EVENTS.IMPORT_DONE, { token: "", docId: "", bookTitle: "" });
				this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/tidme/import/ui/notify-done" });
				if (updated || archived) {
					rowsBox.appendChild(el(doc, "div", "tm-import-summary tm-import-muted",
						`—— 对齐：新增 ${created} · 更新 ${updated} · 归档 ${archived}（SRS 进度保留）`));
				}
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
				// G10 服务端处理模式：上传 → 后台解析（不预览、不阻塞）
				if (serverCheck.checked) {
					for (const file of accepted) serverUpload(file);
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
			wrap.appendChild(serverRow);
			wrap.appendChild(serverStatus);
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
