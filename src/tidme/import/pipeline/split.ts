/*
split.ts — 通用切分器（M2 核心）

对任意 markdown / wikitext / HTML / TXT 文本执行：
  格式识别 → Block 流 → 大纲树切分 → 确定性 ID → tiddler 落库（含自动 deck）
产物即标准 TW 导入格式；节卡带 kind=topic（阅读材料）。

docId 由源标题派生（同一 tiddler 重切分 ID 稳定；标题唯一性由 TW 保证）。
G1 干预：runSplit 接受 overrides（按 trail key 强制合并/拆分），预览微调后落库。
*/

import { makeDocId, makeSectionId, contentFingerprint, normalizeText } from "$:/plugins/keepone/tidme/core/ids";
import type { BookMeta } from "$:/plugins/keepone/tidme/core/ids";
import { bookRoot, joinPath, sectionLeaf } from "$:/plugins/keepone/tidme/core/paths";
import { initialFsrsFields, twDateString } from "$:/plugins/keepone/tidme/core/schema";
import { normalizePriority, PRIORITY_DEFAULT, afactorForText } from "$:/plugins/keepone/tidme/core/scheduler";
import { chunkBook, applyOverrides } from "./chunker";
import type { ChunkOptions, RawSection, SplitOverrides } from "./chunker";
import { blocksFromMarkdown, blocksFromWikitext, blocksFromHtml, blocksFromPlainText, sniffFormat, guessTitle, formatLabel } from "./ingest-text";
import type { TextFormat } from "./ingest-text";

/**
 * 提炼短标题：智能剔除副标题（冒号/破折号后内容）及括号内营销/描述说明
 * 例如："批判性思维与说服性写作：独立思考者的精进技巧（通过25种思维练习...）" -> "批判性思维与说服性写作"
 */
export function cleanTitle(title: string): string {
	let t = String(title || "").trim();
	if (!t) return t;
	// 1. 剔除全角/半角括号及内部补充描述
	t = t.replace(/[（(【\[][^））】\]]*[）)】\]]/g, "").trim();
	// 2. 剔除冒号、破折号及后面的副标题说明
	t = t.split(/[:：——–]/)[0].trim();
	return t || title;
}

export interface SplitInput {
	/** 正文文本 */
	text: string;
	/** 源 tiddler 标题（docId 派生 + 文档页标题）；缺省取探测标题 */
	title?: string;
	/** 显式格式：text/markdown | text/vnd.tiddlywiki | text/html | 空（自动探测） */
	type?: string;
	/** 溯源字段（url/author/date 等）→ Document */
	sourceFields?: Record<string, string>;
	bag?: string;
	maxChars?: number;
	minChars?: number;
	/** 是否自动创建按文档 deck（默认 true；分类重构后 topic 不走牌组，此参数已无实际作用，保留兼容） */
	autoDeck?: boolean;
	/** 卡片优先级 0–100（0 最高；默认 50；M4） */
	priority?: number;
	/** G1 干预：按 trail key 强制合并/拆分（预览微调后落库用） */
	overrides?: SplitOverrides;
	/**
	 * 命名空间冲突探测：给定候选 book folder（Tidme/Books/<slug>），返回占用它的 docId（无占用返回 null）。
	 * 同名书（不同 docId）导入时据此加 ~docId 后缀，避免文档页互相覆盖；同一 docId 重导入幂等复用。
	 * 纯管线无 wiki 时不传（视为无冲突）。
	 */
	folderOccupied?: (baseFolder: string) => string | null;
}

/**
 * 解析最终文档根路径：folder 被其它 docId 占用 → bookRoot + "~" + docId 短哈希；否则原样。
 * 重导入（占用者为同一 docId）不加后缀 —— 幂等。
 * （paths 纯函数不带 docId 后缀；占用的判定与追加都在此导入期完成）
 */
function resolveDocRoot(bookTitle: string, docId: string, folderOccupied?: (baseFolder: string) => string | null): string {
	const base = bookRoot(bookTitle, docId);
	const owner = folderOccupied ? folderOccupied(base) : null;
	if (owner && String(owner) !== String(docId)) {
		return base + "~" + String(docId).replace(/^d/, "").slice(0, 6);
	}
	return base;
}

export interface SplitResult {
	bookTitle: string;
	docId: string;
	meta: BookMeta;
	format: TextFormat;
	sectionCount: number;
	stats: { sections: number; hardSplitCount: number };
	tiddlers: Record<string, any>[];
	warnings: string[];
	/** 最终节明细（含 parts 子节边界与 merged 标记），供预览/干预 UI 使用 */
	sections: RawSection[];
}

function formatFromType(type: string | undefined, text: string): TextFormat {
	const t = String(type || "").toLowerCase();
	if (t.includes("markdown")) return "markdown";
	if (t.includes("tiddlywiki") || t === "text/x-tiddlywiki") return "wikitext";
	if (t.includes("html")) return "html";
	if (t === "text/plain") return "txt";
	return sniffFormat(text);
}

function blocksFor(format: TextFormat, text: string) {
	if (format === "markdown") return blocksFromMarkdown(text);
	if (format === "wikitext") return blocksFromWikitext(text);
	if (format === "html") return blocksFromHtml(text);
	return blocksFromPlainText(text);
}

/**
 * 生成 tiddler 落库产物（文档页 + 节卡）。
 * 卡片：caption(正面=节标题) + text(背面 HTML) + kind=topic/subkind=section + FSRS 九件套 + tidme.* 溯源。
 * 无 ?/. 学习标签、无自动牌组：topic（阅读材料）由阅读列表/文档页统一管理，不走 deck/牌组体系；
 * item（测试卡）进默认牌组复习流。
 */
export async function emitTiddlers(
	docId: string,
	meta: BookMeta & { __format?: string },
	bookTitle: string,
	sections: RawSection[],
	bag: string,
	autoDeck = true,
	priority = PRIORITY_DEFAULT,
	folderOccupied?: (baseFolder: string) => string | null
): Promise<{ tiddlers: Record<string, any>[]; warnings: string[] }> {
	const warnings: string[] = [];
	const format = meta.__format || "epub";
	const nowFields = initialFsrsFields(new Date());
	const syncFields = { bag, revision: "0" };

	// 文档根路径（A1：同名不同 docId 的 folder 冲突 → 加 ~docId 短哈希，幂等）：
	// docRoot 是"每卡可读的真实文档页 title"，落库成 tidme.docpage，UI 导航不再重算。
	const bookT = bookTitle || "未命名导入";
	const docRoot = resolveDocRoot(bookT, docId, folderOccupied);
	const docTitle = bookT; // 面包屑/显示用可读名（保持 align.ts 的 cardKey 匹配逻辑）

	const cards: Record<string, any>[] = [];
	for (const s of sections) {
		if (!s.text.trim()) continue; // 丢弃零字节空节（NCX 锚点产物）
		const trail = [docTitle, ...s.trail].map((t) => String(t || "").trim()).filter(Boolean);
		const id = await makeSectionId(docId, trail, s.ordinal as number);
		const hash = await contentFingerprint(s.text);
		const joined = trail.join(" › ");
		// 叶段 = 可读 caption slug + "-" + 稳定 id（A2：搜索/最近/反向链接可读；唯一性由 id 保证）
		const capText = s.title || trail[trail.length - 1] || "";
		const title = joinPath(docRoot, sectionLeaf(capText, id));
		cards.push({
			title,
			type: "text/vnd.tiddlywiki",
			caption: capText, // 卡片正面：学习模式折叠态只渲染 caption
			text: s.html,
			...nowFields,
			...syncFields,
			"tidme.doc": docId,
			"tidme.docpage": docRoot, // 文档页真实 title（含 ~docId 后缀时亦准确）
			"tidme.id": id,
			"tidme.hash": hash,
			"tidme.order": String(s.ordinal).padStart(6, "0"), // 零填充：字符串排序=阅读顺序
			"tidme.level": String(s.level),
			"tidme.kind": "topic", // 阅读材料（阅读视图，阅读列表管理）
			"tidme.subkind": "section", // 子类型：正文节
			"tidme.chars": String(s.chars),
			"tidme.priority": String(normalizePriority(priority)),
			// SM 对齐：A-Factor 按文本长度启发式设定（短材料快速展期、长材料平缓长尾）
			"tidme.afactor": String(afactorForText(s.chars)),
			"tidme.path": joined,
			"tidme.breadcrumb": joined, // 兼容旧字段名（保持 alignCards 匹配）
			"tidme.source": meta.title || "",
			"tidme.author": meta.creator || "",
			"tidme.format": format,
			...(s.merged ? { "tidme.merged": "yes" } : {}),
			...(s.file ? { "tidme.file": s.file } : {})
		});
	}

	const links = cards.map((t) => `* [[${t.caption || t.title}|${t.title}]]`).join("\n");
	const docLines = [`//${formatLabel(format)}//`];
	if (meta.creator) docLines.push("作者：" + meta.creator);
	if (meta.language) docLines.push("语言：" + meta.language);
	if (meta.date) docLines.push("原文日期：" + meta.date);
	docLines.push("文档 ID：" + docId);
	docLines.push(`共 ${cards.length} 节：`, "", links);

	const docTiddler: Record<string, any> = {
		title: docRoot, // 文档页落 Tidme/Books/<书名>[/~docId] 命名空间
		caption: docTitle, // 可读名：标题模板/列表显示用（title 是路径）
		type: "text/vnd.tiddlywiki",
		tags: ["tidme-import-doc"],
		text: docLines.join("\n"),
		bag,
		revision: "0",
		"tidme.doc": docId,
		"tidme.docpage": docRoot,
		...(meta.title ? { "tidme.source": meta.title } : {}),
		...(meta.author || meta.creator ? { "tidme.author": meta.author || meta.creator } : {}),
		...(meta.language ? { "tidme.language": meta.language } : {}),
		...(meta.url ? { "tidme.url": meta.url } : {}),
		...(meta.date ? { "tidme.date": meta.date } : {}),
		...(meta.license ? { "tidme.license": meta.license } : {})
	};

	// 无自动牌组：topic（阅读材料）由阅读列表/文档页管理，不走 deck/牌组体系
	const tiddlers = [docTiddler, ...cards];
	return { tiddlers, warnings };
}

/**
 * 通用切分：任意 markdown / wikitext / HTML / TXT 文本 → 文档页 + Section 卡 + 自动 deck。
 * 同一输入（title + text 不变）重切分产物确定（ID 稳定）。
 * overrides 按 trail key 干预（合并/拆分），重切分后 key 稳定不漂移。
 */
export async function runSplit(input: SplitInput): Promise<SplitResult> {
	const text = String(input.text || "");
	if (!text.trim()) throw new Error("内容为空");
	const format = formatFromType(input.type, text);
	const blocks = blocksFor(format, text);
	if (!blocks.length) throw new Error("无法解析出任何内容块");

	const meta: BookMeta & Record<string, string> = {
		title: input.title || guessTitle(text, format) || "未命名导入",
		...(input.sourceFields || {})
	};
	const bookTitle = meta.title;
	const docId = await makeDocId({ title: bookTitle, creator: meta.creator || "", language: meta.language || "" });

	const { sections, stats } = chunkBook(
		[{ fileName: bookTitle, fileBreadcrumb: [], blocks }],
		{ maxChars: input.maxChars, minChars: input.minChars },
		input.overrides
	);
	const metaWithFormat = { ...meta, __format: format };
	const { tiddlers, warnings } = await emitTiddlers(docId, metaWithFormat, bookTitle, sections, input.bag || "default", input.autoDeck !== false, input.priority, input.folderOccupied);
	return {
		bookTitle,
		docId,
		meta,
		format,
		sectionCount: stats.sections,
		stats,
		tiddlers,
		warnings,
		sections
	};
}

export { twDateString, initialFsrsFields };
// 干预指令（G1）实现收敛于 chunker.ts（chunkBook 内部同源使用），此处仅转发保 API 兼容
export { applyOverrides } from "./chunker";
