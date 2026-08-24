/*
split.ts — 通用切分器（M2 核心）

对任意 markdown / wikitext / HTML / TXT 文本执行：
  格式识别 → Block 流 → 大纲树切分 → 确定性 ID → tiddler 落库（含自动 deck）
产物即标准 TW 导入格式；卡片带 ? 标签。

docId 由源标题派生（同一 tiddler 重切分 ID 稳定；标题唯一性由 TW 保证）。
*/

import { makeDocId, makeSectionId, contentFingerprint, normalizeText } from "$:/plugins/tidme/core/ids";
import type { BookMeta } from "$:/plugins/tidme/core/ids";
import { initialFsrsFields, twDateString } from "$:/plugins/tidme/core/schema";
import { normalizePriority, PRIORITY_DEFAULT } from "$:/plugins/tidme/core/scheduler";
import { chunkBook } from "./chunker";
import type { ChunkOptions, RawSection } from "./chunker";
import { blocksFromMarkdown, blocksFromWikitext, blocksFromHtml, blocksFromPlainText, sniffFormat, guessTitle, formatLabel } from "./ingest-text";
import type { TextFormat } from "./ingest-text";

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
	/** 是否自动创建按文档 deck（默认 true） */
	autoDeck?: boolean;
	/** 卡片优先级 0–100（0 最高；默认 50；M4） */
	priority?: number;
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
}

function uniqueTitleFactory() {
	const used = new Map<string, number>();
	return (base: string) => {
		const n = (used.get(base) || 0) + 1;
		used.set(base, n);
		return n === 1 ? base : `${base} ~${n}`;
	};
}

/** FSRS 默认参数（与 fsrs4tw decks/default.tid 一致） */
const DEFAULT_FSRS_P = JSON.stringify({
	request_retention: 0.9,
	maximum_interval: 36500,
	w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]
});

/** 按文档自动 deck（M2-T4）：card 过滤器按 tidme.doc 限定；M4 起新卡按优先级排序 */
function buildAutoDeck(bookTitle: string, docId: string): Record<string, any> {
	return {
		title: `$:/Deck/read/${bookTitle}`,
		tags: ["$:/tags/TidmeDeck"],
		caption: bookTitle,
		description: `按文档自动创建的阅读牌组（${docId}）`,
		card: `[all[shadows+tiddlers]tidme.doc[${docId}]tag[?]!has[tidme.suspended]]`,
		card_unfold: "[tag[.]]",
		card_exclude: "[tag[!]]",
		order: "due-new",
		order_learn: "[sort[due]]",
		order_new: "[sort[priority]sortan[title]]",
		order_due: "[sort[priority]sort[due]]",
		state_learn: "[state[1]] [state[3]] :filter[{!!due}compare:date:lt<now [UTC]YYYY0MMDD0hh0mm0ss0XXX>]",
		state_due: "[state[2]has[due]] -[!days:due[1]]",
		state_new: "[!has[state]] [state[0]]",
		p: DEFAULT_FSRS_P
	};
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
 * 生成 tiddler 落库产物（文档页 + Section 卡 + 自动 deck）。
 * 卡片：caption(正面=节标题) + text(背面 HTML) + tags:["?","."] + FSRS 九件套 + tidme.* 溯源。
 */
export async function emitTiddlers(
	docId: string,
	meta: BookMeta & { __format?: string },
	bookTitle: string,
	sections: RawSection[],
	bag: string,
	autoDeck = true,
	priority = PRIORITY_DEFAULT
): Promise<{ tiddlers: Record<string, any>[]; warnings: string[] }> {
	const warnings: string[] = [];
	const unique = uniqueTitleFactory();
	const docTitle = unique(bookTitle || "未命名导入");
	const format = meta.__format || "epub";
	const nowFields = initialFsrsFields(new Date());
	const syncFields = { bag, revision: "0" };

	const cards: Record<string, any>[] = [];
	for (const s of sections) {
		if (!s.text.trim()) continue; // 丢弃零字节空节（NCX 锚点产物）
		const trail = [docTitle, ...s.trail].map((t) => String(t || "").trim()).filter(Boolean);
		const id = await makeSectionId(docId, trail, s.ordinal as number);
		const hash = await contentFingerprint(s.text);
		const joined = trail.join(" › ");
		const title = unique(joined);
		if (title !== joined) warnings.push(`标题去重：${joined}`);
		cards.push({
			title,
			type: "text/vnd.tiddlywiki",
			tags: ["?", "."], // ? 进牌堆；. 表示阅读卡默认展开（startstudy 不折叠）
			caption: s.title || trail[trail.length - 1] || "", // 卡片正面：学习模式折叠态只渲染 caption
			text: s.html,
			...nowFields,
			...syncFields,
			"tidme.doc": docId,
			"tidme.id": id,
			"tidme.hash": hash,
			"tidme.order": String(s.ordinal).padStart(6, "0"), // 零填充：字符串排序=阅读顺序
			"tidme.level": String(s.level),
			"tidme.kind": "section",
			"tidme.chars": String(s.chars),
			"tidme.priority": String(normalizePriority(priority)),
			"tidme.path": joined,
			"tidme.breadcrumb": joined, // 兼容旧字段名
			"tidme.source": meta.title || "",
			"tidme.author": meta.creator || "",
			"tidme.format": format,
			...(s.merged ? { "tidme.merged": "yes" } : {}),
			...(s.file ? { "tidme.file": s.file } : {})
		});
	}

	const links = cards.map((t) => `* [[${t.title}]]`).join("\n");
	const docLines = [`//${formatLabel(format)}//`];
	if (meta.creator) docLines.push("作者：" + meta.creator);
	if (meta.language) docLines.push("语言：" + meta.language);
	if (meta.date) docLines.push("原文日期：" + meta.date);
	docLines.push("文档 ID：" + docId);
	docLines.push(`共 ${cards.length} 节：`, "", links);

	const docTiddler: Record<string, any> = {
		title: docTitle,
		type: "text/vnd.tiddlywiki",
		tags: ["tidme-import-doc"],
		text: docLines.join("\n"),
		bag,
		revision: "0",
		"tidme.doc": docId,
		...(meta.title ? { "tidme.source": meta.title } : {}),
		...(meta.author || meta.creator ? { "tidme.author": meta.author || meta.creator } : {}),
		...(meta.language ? { "tidme.language": meta.language } : {}),
		...(meta.url ? { "tidme.url": meta.url } : {}),
		...(meta.date ? { "tidme.date": meta.date } : {}),
		...(meta.license ? { "tidme.license": meta.license } : {})
	};

	const tiddlers = [docTiddler, ...cards];
	if (autoDeck) tiddlers.push(buildAutoDeck(bookTitle || docTitle, docId));
	return { tiddlers, warnings };
}

/**
 * 通用切分：任意 markdown / wikitext / HTML / TXT 文本 → 文档页 + Section 卡 + 自动 deck。
 * 同一输入（title + text 不变）重切分产物确定（ID 稳定）。
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
		{ maxChars: input.maxChars, minChars: input.minChars }
	);
	const metaWithFormat = { ...meta, __format: format };
	const { tiddlers, warnings } = await emitTiddlers(docId, metaWithFormat, bookTitle, sections, input.bag || "default", input.autoDeck !== false, input.priority);
	return {
		bookTitle,
		docId,
		meta,
		format,
		sectionCount: stats.sections,
		stats,
		tiddlers,
		warnings
	};
}

export { twDateString, initialFsrsFields };
