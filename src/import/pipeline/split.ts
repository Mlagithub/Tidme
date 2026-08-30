/*
split.ts — 通用切分器（M2 核心）

对任意 markdown / wikitext / HTML / TXT 文本执行：
  格式识别 → Block 流 → 大纲树切分 → 确定性 ID → tiddler 落库（含自动 deck）
产物即标准 TW 导入格式；卡片带 ? 标签。

docId 由源标题派生（同一 tiddler 重切分 ID 稳定；标题唯一性由 TW 保证）。
G1 干预：runSplit 接受 overrides（按 trail key 强制合并/拆分），预览微调后落库。
*/

import { makeDocId, makeSectionId, contentFingerprint, normalizeText } from "$:/plugins/tidme/core/ids";
import type { BookMeta } from "$:/plugins/tidme/core/ids";
import { initialFsrsFields, twDateString } from "$:/plugins/tidme/core/schema";
import { normalizePriority, PRIORITY_DEFAULT } from "$:/plugins/tidme/core/scheduler";
import { chunkBook } from "./chunker";
import type { ChunkOptions, RawSection, SplitOverrides } from "./chunker";
import { blocksFromMarkdown, blocksFromWikitext, blocksFromHtml, blocksFromPlainText, sniffFormat, guessTitle, formatLabel } from "./ingest-text";
import type { TextFormat } from "./ingest-text";

export interface CustomSectionInput {
	title: string;
	text: string;
	insertAfterKey?: string;
}

/** 干预指令（按 trail key = trail.join(" › ") 匹配，重切分后稳定不漂移） */
export interface SplitOverrides {
	/** 强制并入上一节的 trail key */
	merge?: string[];
	/** 强制拆分（容器内第一个带标题的并入子节拆为独立卡）的 trail key */
	split?: string[];
	/** 标题修改/改短（trailKey -> 自定义短标题） */
	titles?: Record<string, string>;
	/** 移除/删除节的 trailKey */
	delete?: string[];
	/** 手动新增节 */
	customSections?: CustomSectionInput[];
}

export interface SectionPart { html: string; text: string; chars: number; title?: string }

function escapeHtml(text: string) {
	return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

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

function deriveSection(sec: RawSection): RawSection {
	if (sec.parts && sec.parts.length) {
		sec.html = sec.parts
			.map((p) => (p.title ? `<p><strong>${escapeHtml(p.title)}</strong></p>\n` : "") + p.html)
			.join("\n");
		sec.text = sec.parts.map((p) => (p.title ? "【" + p.title + "】" : "") + p.text).join("\n");
		sec.chars = sec.parts.reduce((n, p) => n + p.chars, 0);
	}
	return sec;
}

/**
 * 应用干预指令（G1）：按 trail key 拆分合并容器 / 合并独立节，重排 ordinal。
 * 拆分依赖 parts 里的子节边界（parts[1..] 中第一个带 title 的段），无 parts 信息时跳过。
 */
export function applyOverrides(sections: RawSection[], overrides?: SplitOverrides): RawSection[] {
	const o = overrides || {};
	const mergeKeys = new Set(o.merge || []);
	const splitKeys = new Set(o.split || []);
	const deleteKeys = new Set(o.delete || []);
	const titleMap = o.titles || {};
	const customList = o.customSections || [];
	const keyOf = (s: RawSection) => s.trail.join(" › ");

	// 0. 过滤删除节并应用重命名/改短
	const filtered: RawSection[] = [];
	for (const s of sections) {
		const k = keyOf(s);
		if (deleteKeys.has(k)) continue;
		const sec = { ...s, trail: [...s.trail] };
		if (titleMap[k]) {
			sec.title = titleMap[k];
			if (sec.trail.length) sec.trail[sec.trail.length - 1] = titleMap[k];
		}
		filtered.push(sec);
	}

	// 第一遍：拆分（拆分增加节数，先处理；结果顺序保持）
	const out: RawSection[] = [];
	for (const sec of filtered) {
		out.push(sec);
		if (splitKeys.has(keyOf(sec))) {
			const parts = sec.parts || [];
			const idx = parts.findIndex((p, i) => i > 0 && p.title);
			if (idx > 0) {
				const sub = parts[idx];
				sec.parts = [parts[0], ...parts.slice(idx + 1)];
				sec.merged = sec.parts.length > 1;
				const newSec: RawSection = {
					level: sec.level,
					title: sub.title || "",
					trail: [...sec.trail, sub.title || ""].filter(Boolean),
					html: sub.html,
					text: sub.text,
					chars: sub.chars,
					parts: [{ html: sub.html, text: sub.text, chars: sub.chars }]
				};
				out.push(newSec);
			}
		}
	}

	// 第二遍：合并（并入前一节）
	const result: RawSection[] = [];
	for (const sec of out) {
		if (mergeKeys.has(keyOf(sec)) && result.length) {
			const prev = result[result.length - 1];
			const parts = sec.parts || [{ html: sec.html, text: sec.text, chars: sec.chars }];
			prev.parts = prev.parts || [{ html: prev.html, text: prev.text, chars: prev.chars }];
			prev.parts.push({ title: sec.title || undefined, html: parts[0].html, text: parts[0].text, chars: parts[0].chars });
			for (const p of parts.slice(1)) prev.parts.push(p);
			prev.merged = true;
			prev.level = Math.min(prev.level, sec.level);
			continue;
		}
		result.push(sec);
	}

	// 第三遍：新增自定义节
	for (const cs of customList) {
		if (!cs.title || !cs.text) continue;
		const newSec: RawSection = {
			level: 1,
			title: cs.title,
			trail: [cs.title],
			html: `<p>${escapeHtml(cs.text)}</p>`,
			text: cs.text,
			chars: cs.text.length,
			parts: [{ html: `<p>${escapeHtml(cs.text)}</p>`, text: cs.text, chars: cs.text.length }]
		};
		if (cs.insertAfterKey) {
			const idx = result.findIndex((s) => keyOf(s) === cs.insertAfterKey);
			if (idx >= 0) result.splice(idx + 1, 0, newSec);
			else result.push(newSec);
		} else {
			result.push(newSec);
		}
	}

	// 派生 html/text/chars + ordinal 重排
	result.forEach((sec, i) => {
		deriveSection(sec);
		sec.ordinal = i + 1;
	});
	return result;
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
	/** 是否自动创建按文档 deck（默认 true） */
	autoDeck?: boolean;
	/** 卡片优先级 0–100（0 最高；默认 50；M4） */
	priority?: number;
	/** G1 干预：按 trail key 强制合并/拆分（预览微调后落库用） */
	overrides?: SplitOverrides;
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

/**
 * 按文档自动 deck（M2-T4）：card 按 tidme.doc + tag[.] 限定 → 本书阅读牌组。
 * W1 双轨分流：自动牌组只装 topic（节卡 ?. / 摘录 .），按 due 被动重读（card_unfold 展开）；
 * 主动复习流（item）走默认牌组 / 「复习本书」临时牌组。
 */
function buildAutoDeck(bookTitle: string, docId: string): Record<string, any> {
	return {
		title: `$:/Deck/read/${bookTitle}`,
		tags: ["$:/tags/TidmeDeck"],
		caption: bookTitle,
		description: `按文档自动创建的阅读牌组（${docId}）——节卡/摘录按 due 被动重读`,
		card: `[all[shadows+tiddlers]tidme.doc[${docId}]tag[.]!has[tidme.suspended]!field:tidme.done[yes]]`,
		card_unfold: "[tag[.]]",
		card_exclude: "[tag[!]] [field:tidme.done[yes]]",
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
	const { tiddlers, warnings } = await emitTiddlers(docId, metaWithFormat, bookTitle, sections, input.bag || "default", input.autoDeck !== false, input.priority);
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
