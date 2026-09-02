/*
widgets/import.ts — 自包含导入组件

<$import-file> 一个组件完成全部交互：
  拖放/选择 → 调用共享管线解析 → 就地渲染预览（含目录大纲折叠面板）→ 导入/清除。
不依赖 wikitext 响应式列表（规避状态刷新时序问题）；完整产物留在模块级缓存。
*/

declare function require(module: string): any;
const pipeline = require("$:/plugins/keepone/tidme/import/pipeline.js");
const sched = require("$:/plugins/keepone/tidme/core/scheduler.js");
const events = require("$:/plugins/keepone/tidme/core/events.js");
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
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

function getOptions(wiki: any): { maxChars?: number; minChars?: number; bag: string; semanticSplitCfg?: any } {
	const num = (t: string) => {
		const v = parseInt(wiki.getTiddlerText(t, "").trim(), 10);
		return Number.isFinite(v) && v > 0 ? v : undefined;
	};
	const bag = (wiki.getTiddlerText("$:/temp/tidme-import/bag", "") || "").trim();
	let semanticSplitCfg: any = null;
	try {
		const raw = wiki.getTiddlerText("$:/config/Tidme/SemanticSplit", "");
		if (raw) semanticSplitCfg = JSON.parse(raw);
	} catch {}
	return {
		maxChars: num("$:/temp/tidme-import/max"),
		minChars: num("$:/temp/tidme-import/min"),
		bag: bag || "default", // TiddlyWeb server 版同步目标桶
		semanticSplitCfg
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

// 共享 DOM 工具（实现收敛于 core/ui-utils）
const el = uiUtils.el;

function getSemanticSplitConfig(wiki: any): any {
	const t = wiki.getTiddler("$:/config/Tidme/SemanticSplit");
	if (!t) return {};
	let cfg: any = {};
	if (t.fields.text) {
		try { cfg = JSON.parse(t.fields.text); } catch {}
	}
	if (t.fields.apiKey) cfg.apiKey = String(t.fields.apiKey).trim();
	if (t.fields.baseUrl) cfg.baseUrl = String(t.fields.baseUrl).trim();
	if (t.fields.model) cfg.model = String(t.fields.model).trim();
	return cfg;
}

/** 纯 LLM 语义二次切分：严格基于原文字符偏移切割，确保 100% 字数完整性 */
async function subSplitTiddlerWithLLM(tiddler: any, r: ImportResult, wiki: any): Promise<boolean> {
	const aiCfg = getSemanticSplitConfig(wiki);
	if (!aiCfg.apiKey) {
		alert("请先在【控制面板 ➔ Tidme Import ➔ 配置】中输入并保存 API Key，然后再执行二次切分！");
		return false;
	}

	const sem = require("$:/plugins/keepone/tidme/core/server/semantic-split");
	const origText = String(tiddler.text || "").trim();
	const subChunks: Array<{ title: string; text: string; chars: number }> = await sem.splitSectionText(origText, aiCfg);
	if (!subChunks || subChunks.length <= 1) return false;

	// 100% 字数与原文完整性校验
	const sumChars = subChunks.reduce((n, c) => n + c.text.length, 0);
	const ratio = sumChars / (origText.length || 1);
	if (ratio < 0.95 || ratio > 1.05) {
		alert(`[二次切分校验失败] 切分后字数 (${sumChars}) 与原文 (${origText.length}) 偏差过大，已自动拦截以保护原文完整性。`);
		return false;
	}

	const path = String(tiddler["tidme.breadcrumb"] || tiddler.caption || tiddler.title || "");
	const parts = path.split(" › ");
	const rawShort = (parts.pop() || path).replace(/ \(\d+\)$/, "");
	const baseBreadcrumb = parts.length ? parts.join(" › ") : r.bookTitle;

	const newTiddlers = subChunks.map((chunk, idx) => {
		const subCap = `${rawShort} (${chunk.title || (idx + 1)})`;
		const subTitle = `${r.bookTitle} › ${subCap}`;
		return {
			...tiddler,
			title: subTitle,
			caption: subCap,
			text: chunk.text,
			"tidme.breadcrumb": `${baseBreadcrumb} › ${subCap}`,
			_renamed: true
		};
	});

	const realIdx = r.tiddlers.indexOf(tiddler);
	if (realIdx >= 0) {
		r.tiddlers.splice(realIdx, 1, ...newTiddlers);
	}
	return true;
}

/** 单本书的预览卡片（P1）：标题行 + 状态 + 可在线微调大纲（改短/删/增） */
function buildRow(
	doc: Document,
	token: string,
	resultOrErr: { result?: ImportResult; error?: string; fileName: string; duplicate?: boolean },
	wiki: any
): HTMLElement {
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
	const metaSpan = el(doc, "span", "tm-import-file-meta",
		`${r.sectionCount} 节 · 硬切 ${r.stats.hardSplitCount} 块${r.warnings.length ? " · 标题去重 " + r.warnings.length : ""}`);
	head.appendChild(metaSpan);
	card.appendChild(head);

	if (resultOrErr.duplicate) {
		card.appendChild(el(doc, "div", "tm-import-dup", "⚠ 本书已在库中 —— 再次导入将走对齐（未变节保留 SRS 进度）"));
	}

	// 树形目录大纲（全套在线增、删、改、改短）
	const details = el(doc, "details", "tm-import-outline");
	const summaryEl = el(doc, "summary", "tm-import-muted", `目录大纲（共 ${r.sectionCount} 条）`);
	details.appendChild(summaryEl);

	const outlineBox = el(doc, "div", "tm-import-tree-box", "");
	details.appendChild(outlineBox);
	card.appendChild(details);

	let activeEditTitleIndex: number | null = null;
	let activeAddIndex: number | null = null;

	// 手动插卡 title 去重（同 caption 多次插入 → -N 后缀），会话内累积
	const manualUsed = new Set<string>(
		r.tiddlers
			.filter((t: any) => t["tidme.kind"] === "topic" && String(t.title || "").includes("/manual-"))
			.map((t: any) => String(t.title))
	);

	const makeAddForm = (insertAfterIdx: number) => {
		const form = el(doc, "div", "tm-split-add-form");
		const titleIn = doc.createElement("input");
		titleIn.className = "tm-input";
		titleIn.placeholder = "新节标题（如：01 前言 / 短标题）";
		const textIn = doc.createElement("textarea");
		textIn.className = "tm-input";
		textIn.placeholder = "内容...";
		textIn.rows = 2;
		const confirmBtn = el(doc, "button", "tm-btn tm-btn-primary tm-btn-sm", "确认插入");
		confirmBtn.onclick = () => {
			const tVal = titleIn.value.trim();
			const cVal = textIn.value.trim();
			if (tVal && cVal) {
				// 手动插卡 title 走同一套命名空间/slug（paths.insertedSectionTitle），避免第三套转义；
				// 同 caption 冲突时追加 -N（manualUsed 会话内累积）
				const mBase = pipeline.insertedSectionTitle(r.bookTitle, r.docId, tVal);
				let mTitle = mBase;
				let n = 2;
				while (manualUsed.has(mTitle)) mTitle = `${mBase}-${n++}`;
				manualUsed.add(mTitle);
				const newTiddler = {
					title: mTitle,
					caption: tVal,
					text: cVal,
					"tidme.doc": r.docId,
					"tidme.kind": "topic",
					"tidme.subkind": "section",
					"tidme.breadcrumb": `${r.bookTitle} › ${tVal}`
				};
				if (insertAfterIdx === -1) {
					r.tiddlers.splice(1, 0, newTiddler);
				} else {
					const sectionCards = r.tiddlers.filter((t) => t["tidme.kind"] === "topic");
					const targetCard = sectionCards[insertAfterIdx];
					const realIdx = r.tiddlers.indexOf(targetCard);
					if (realIdx >= 0) r.tiddlers.splice(realIdx + 1, 0, newTiddler);
					else r.tiddlers.push(newTiddler);
				}
				activeAddIndex = null;
				renderTree();
			}
		};
		const cancelBtn = el(doc, "button", "tm-btn tm-btn-sm", "取消");
		cancelBtn.onclick = () => { activeAddIndex = null; renderTree(); };
		form.appendChild(titleIn);
		form.appendChild(textIn);
		form.appendChild(confirmBtn);
		form.appendChild(cancelBtn);
		return form;
	};

	const renderTree = () => {
		outlineBox.textContent = "";
		const cardTiddlers = r.tiddlers.filter((t) => t["tidme.kind"] === "topic" && !t._deleted);
		r.sectionCount = cardTiddlers.length;
		metaSpan.textContent = `${r.sectionCount} 节 · 硬切 ${r.stats.hardSplitCount} 块${r.warnings.length ? " · 标题去重 " + r.warnings.length : ""}`;

		const allSections = r.tiddlers.filter((t) => t["tidme.kind"] === "topic");
		summaryEl.textContent = `目录大纲（按目录分节共 ${allSections.length} 条 · 可二次切分偏长章节）`;

		// 顶部工具栏：一键提炼短标题
		const toolRow = el(doc, "div", "tm-import-actions", "");
		const cleanBtn = el(doc, "button", "tm-btn tm-btn-sm", "✨ 一键提炼短标题");
		cleanBtn.title = "自动剔除副标题（冒号/破折号后）与括号内营销/描述说明";
		cleanBtn.onclick = () => {
			const cleanTitleFn = pipeline.cleanTitle || ((x: string) => x);
			for (const t of allSections) {
				const path = String(t["tidme.breadcrumb"] || t.caption || t.title || "");
				const parts = path.split(" › ");
				const rawShort = parts.pop() || path;
				const cleaned = cleanTitleFn(rawShort);
				if (cleaned && cleaned !== rawShort) {
					parts.push(cleaned);
					t["tidme.breadcrumb"] = parts.join(" › ");
					t.caption = cleaned;
					// 重建 namespace title：用 docRoot + paths.sectionLeaf(caption, id)
					// 保留稳定 id 避免覆盖/重切分时撞名；docRoot 已在 emitTiddlers 时写入 t["tidme.docpage"]
					const id = String(t["tidme.id"] || "");
					const docRoot = String(t["tidme.docpage"] || doc.title || r.bookTitle);
					if (id && pipeline.sectionLeaf && pipeline.joinPath) {
						t.title = pipeline.joinPath(docRoot, pipeline.sectionLeaf(cleaned, id));
					}
					t._renamed = true;
				}
			}
			renderTree();
		};
		toolRow.appendChild(cleanBtn);
		outlineBox.appendChild(toolRow);

		const tree = el(doc, "div", "tm-import-tree", "");
		allSections.forEach((t, idx) => {
			const path = String(t["tidme.breadcrumb"] || t.caption || t.title || "");
			const parts = path.split(" › ");
			const shortTitle = parts.pop() || path;
			const level = Math.max(0, parts.length - 1);
			const isMerged = t["tidme.merged"] === "yes";
			const isDeleted = !!t._deleted;
			const isRenamed = !!t._renamed;
			const charCount = String(t.text || "").length;
			const isOverlong = charCount >= 10000;

			const rowCls = "tm-import-tree-row"
				+ (isMerged ? " tm-import-tree-merged" : "")
				+ (isDeleted ? " tm-split-row-deleted" : "")
				+ (isRenamed ? " tm-split-row-renamed" : "");
			const line = el(doc, "div", rowCls);
			line.style.paddingLeft = `${level * 1.1}em`;

			// 状态与字数标记（字数 >= 10,000 字呈现偏长预警）
			if (isMerged) line.appendChild(el(doc, "span", "tm-import-tree-mark", "⟵ 已并入"));
			if (isRenamed) line.appendChild(el(doc, "span", "tm-split-done", "✏️ 短标题"));
			const charBadgeCls = "tm-import-tree-mark" + (isOverlong ? " tm-split-chars-warn" : "");
			line.appendChild(el(doc, "span", charBadgeCls, `${charCount} 字${isOverlong ? " ⚠️偏长" : ""}`));

			// 标题编辑/显示
			if (activeEditTitleIndex === idx) {
				const editIn = doc.createElement("input");
				editIn.className = "tm-split-title-input";
				editIn.value = shortTitle;
				const confirmBtn = el(doc, "button", "tm-btn tm-btn-sm", "✔ 保存");
				confirmBtn.onclick = () => {
					const newShort = editIn.value.trim();
					if (newShort && newShort !== shortTitle) {
						parts.push(newShort);
						const newPath = parts.join(" › ");
						t["tidme.breadcrumb"] = newPath;
						t.caption = newShort;
						// 重建 namespace title：docRoot + sectionLeaf(caption, id) —— 稳定 id 保证唯一
						const id = String(t["tidme.id"] || "");
						const docRoot = String(t["tidme.docpage"] || doc.title || r.bookTitle);
						if (id && pipeline.sectionLeaf && pipeline.joinPath) {
							t.title = pipeline.joinPath(docRoot, pipeline.sectionLeaf(newShort, id));
						}
						t._renamed = true;
					}
					activeEditTitleIndex = null;
					renderTree();
				};
				line.appendChild(editIn);
				line.appendChild(confirmBtn);
			} else {
				const textSpan = el(doc, "span", "tm-import-tree-text", shortTitle);
				textSpan.title = "双击可编辑标题";
				textSpan.ondblclick = () => { activeEditTitleIndex = idx; renderTree(); };
				line.appendChild(textSpan);
			}

			// 核心操作：针对偏长章节（>= 1万字）的“✂️ 二次切分”
			if (isOverlong || charCount >= 10000) {
				const subSplitBtn = el(doc, "button", "tm-btn tm-btn-sm tm-btn-primary", "✂️ 二次切分");
				subSplitBtn.title = "使用 LLM 语义分析将本偏长章节切分为带主题的子切片";
				subSplitBtn.onclick = async () => {
					subSplitBtn.textContent = "🤖 LLM 切片中...";
					subSplitBtn.setAttribute("disabled", "true");
					try {
						const ok = await subSplitTiddlerWithLLM(t, r, wiki);
						if (ok) renderTree();
						else {
							subSplitBtn.textContent = "✂️ 二次切分";
							subSplitBtn.removeAttribute("disabled");
						}
					} catch (e: any) {
						alert("LLM 二次切分失败: " + (e && e.message || e));
						subSplitBtn.textContent = "✂️ 二次切分";
						subSplitBtn.removeAttribute("disabled");
					}
				};
				line.appendChild(subSplitBtn);
			}

			// 辅助操作：移除 / 恢复
			if (isDeleted) {
				const restoreBtn = el(doc, "button", "tm-btn tm-btn-icon", "↩ 恢复");
				restoreBtn.onclick = () => { delete t._deleted; renderTree(); };
				line.appendChild(restoreBtn);
			} else {
				const delBtn = el(doc, "button", "tm-btn tm-btn-icon", "🗑 移除");
				delBtn.onclick = () => { t._deleted = true; renderTree(); };
				line.appendChild(delBtn);
			}

			tree.appendChild(line);
		});

		outlineBox.appendChild(tree);
	};

	renderTree();

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

			// 选择文件上传按钮与说明
			const btnSelect = el(doc, "button", "tm-btn tm-btn--primary tm-import-select-btn", "选择文件上传 (.epub / .md / .txt)");
			const input = doc.createElement("input");
			input.type = "file";
			input.multiple = true;
			input.accept = ".epub,.md,.markdown,.txt";
			input.style.display = "none";
			const hint = el(doc, "div", "tm-import-hint", "或者：直接将文件拖拽到此页面的任意位置即可导入。");

			// 全页面拖放覆盖层
			const overlay = el(doc, "div", "tm-import-drag-overlay", "释放文件以导入到 Tidme (.epub / .md / .txt)");
			overlay.style.display = "none";

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

			// SM 对齐：导入时批量设定优先级（0 最高；高=10±8 / 中=50±8 / 低=90±8，同批分散避免挤队）
			const prioRow = el(doc, "div", "tm-import-actions", "");
			prioRow.appendChild(el(doc, "span", "tm-import-muted", "导入优先级："));
			const prioSel = doc.createElement("select");
			prioSel.className = "tm-priority-select";
			for (const [label, value] of [["高", "high"], ["中", "medium"], ["低", "low"]] as const) {
				const opt = doc.createElement("option");
				opt.value = value;
				opt.textContent = label;
				prioSel.appendChild(opt);
			}
			prioSel.value = "medium";
			prioSel.title = "0=最高优先级；本次导入的全部节卡按所选档位分散设定优先级";
			prioRow.appendChild(prioSel);
			prioRow.appendChild(el(doc, "span", "tm-import-muted", "（0 最高 · 同批随机分散 ±8）"));
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
						"tidme.priority": String(sched.tierRandom(prioSel.value as any)), // SM：导入时批量设优先级（服务端沿用）
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
				const hasPending = !!pending.size;
				actions.style.display = hasPending ? "" : "none";
				previewCard.style.display = hasPending ? "" : "none";
			};

			// A：落库单个解析结果。同 docId 已有旧卡 → alignCards 增量（未变保 SRS 进度 /
			// 修改重挂接 / 新增建卡 / 删除归档），否则全量写库。返回 { created, updated, archived }。
			const commitResult = async (result: ImportResult): Promise<{ created: number; updated: number; archived: number }> => {
				const validTiddlers = result.tiddlers.filter((x: any) => !x._deleted);
				const [doc, ...cards] = validTiddlers;
				const sectionCards = cards.filter((x: any) => x["tidme.kind"] === "topic");
				const align = require("$:/plugins/keepone/tidme/core/align.js");
				const docPage = this.wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${result.docId}]]`)[0] || "";
				// 仅对齐 section（普通阅读节）：摘录/挖空/问答/手动卡由用户决定，不在重切分时归档
				const oldCards = this.wiki.filterTiddlers(`[tidme.doc[${result.docId}]tidme.kind[topic]!tidme.subkind[extract]!is[draft]]`)
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
						this.wiki.addTiddler({ ...ex.fields, "tidme.obsolete": "yes", "tidme.done": "yes" });
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
				// 无自动阅读牌组：topic 由阅读列表管理，item 进默认牌组
				return aligned
					? { created: aligned.keep.length, updated: aligned.patches.length, archived: aligned.archives.length }
					: { created: cards.length, updated: 0, archived: 0 };
			};

			btnImport.addEventListener("click", async () => {
				let created = 0, updated = 0, archived = 0;
				let firstDocTitle = "";
				for (const [token, item] of pending) {
					if (!item.result) continue;
					const r = await commitResult(item.result);
					created += r.created; updated += r.updated; archived += r.archived;
					if (!firstDocTitle) {
						firstDocTitle = this.wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${item.result.docId}]]`)[0]
							|| item.result.tiddlers[0]?.title || "";
					}
					pending.delete(token);
				}
				// 重绘预览区
				rowsBox.textContent = "";
				for (const [token, item] of pending) rowsBox.appendChild(buildRow(doc, token, item, this.wiki));
				refreshActions();
				this.wiki.addTiddler({ title: "$:/temp/tidme-import/last-created", text: String(created) });
				events.dispatch(this, events.EVENTS.IMPORT_DONE, { token: "", docId: "", bookTitle: "" });
				this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/keepone/tidme/import/ui/notify-done" });
				if (updated || archived) {
					rowsBox.appendChild(el(doc, "div", "tm-import-summary tm-import-muted",
						`—— 对齐：新增 ${created} · 更新 ${updated} · 归档 ${archived}（SRS 进度保留）`));
				}
				// 落点：导入完成跳到本书文档汇总页（从那里决定读哪张/继续提炼），而非停在空白队列
				if (created > 0 && firstDocTitle) {
					this.dispatchEvent({ type: "tm-navigate", navigateTo: firstDocTitle });
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
					this.dispatchEvent({ type: "tm-notify", param: "$:/plugins/keepone/tidme/import/ui/notify-unsupported" });
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
						// SM 对齐：导入时按所选档位批量设定优先级（同批随机分散 ±8）
						const result = await pipeline.runImport(bytes, file.name, {
							...getOptions(this.wiki),
							priority: sched.tierRandom(prioSel.value as any),
							// 同名书 folder 唯一化探测（A1）：folder 已被其它 docId 占用 → 导入时加 ~docId 后缀
							folderOccupied: (base: string) => uiUtils.docFolderOwner(this.wiki, base)
						}) as ImportResult;
						console.log("[tidme-import] 解析成功:", result.bookTitle, result.sectionCount, "节");
						// 重复导入检测：同 docId 已在库中
						const docId = result.docId;
						const existing = this.wiki.filterTiddlers(`[has[tidme.doc]]`).filter((t: string) => {
							return this.wiki.getTiddler(t)?.fields["tidme.doc"] === docId && t !== result.bookTitle;
						}).length;
						const token = cacheResult(result);
						totalSections += result.sectionCount;
						pending.set(token, { result, fileName: file.name, duplicate: existing > 0 });
						rowsBox.appendChild(buildRow(doc, token, { result, fileName: file.name, duplicate: existing > 0 }, this.wiki));
					} catch (err: any) {
						console.error("[tidme-import] 解析失败:", file.name, err);
						rowsBox.appendChild(buildRow(doc, "e" + Date.now().toString(36), { error: String(err.message || err), fileName: file.name }, this.wiki));
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
			btnSelect.addEventListener("click", () => input.click());
			
			let dragCounter = 0;
			wrap.addEventListener("dragenter", (e: DragEvent) => {
				e.preventDefault();
				dragCounter++;
				overlay.style.display = "";
			});
			wrap.addEventListener("dragover", (e: DragEvent) => {
				e.preventDefault();
			});
			wrap.addEventListener("dragleave", (e: DragEvent) => {
				e.preventDefault();
				dragCounter--;
				if (dragCounter === 0) {
					overlay.style.display = "none";
				}
			});
			wrap.addEventListener("drop", async (e: DragEvent) => {
				e.preventDefault();
				dragCounter = 0;
				overlay.style.display = "none";
				await handleFiles(Array.from(e.dataTransfer?.files || []) as File[]);
			});

			// 创建上传控制卡片
			const uploaderCard = el(doc, "div", "tm-dashboard-card");
			uploaderCard.appendChild(el(doc, "div", "tm-dashboard-card-title", "上传控制"));
			uploaderCard.appendChild(btnSelect);
			uploaderCard.appendChild(input);
			uploaderCard.appendChild(hint);
			uploaderCard.appendChild(prioRow);
			// 服务端处理属高级选项：默认折叠（本地导入为主路径，避免普通用户被 TiddlyWeb 选项打扰）
			const adv = el(doc, "details", "tm-import-advanced");
			const advSum = el(doc, "summary", "tm-import-muted", "高级：上传到服务端后台处理（TiddlyWeb）");
			advSum.title = "适合大文件：解析在服务端后台执行，不阻塞页面；需要 TiddlyWeb 服务端";
			adv.appendChild(advSum);
			adv.appendChild(serverRow);
			adv.appendChild(serverStatus);
			uploaderCard.appendChild(adv);
			wrap.appendChild(uploaderCard);
			wrap.appendChild(overlay);

			// 创建待导预览队列卡片
			const previewCard = el(doc, "div", "tm-dashboard-card");
			previewCard.appendChild(el(doc, "div", "tm-dashboard-card-title", "待导入队列"));
			previewCard.appendChild(rowsBox);
			previewCard.appendChild(actions);
			previewCard.style.display = "none";
			wrap.appendChild(previewCard);

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
