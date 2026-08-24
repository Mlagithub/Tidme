/*
main.ts — 导入管线入口（浏览器版）

对外暴露 runImport(bytes, fileName, options)：
  EPUB/MD/TXT bytes → 解析 → 归一化 → 大纲树切分 → 确定性 ID → tiddler JSON 数组
产物即标准 TW 导入格式；卡片带 ? 标签。
*/

import { makeDocId, makeSectionId, contentFingerprint } from "./ids";
import type { BookMeta } from "./ids";
import { readEpubBytes, extractNcxTree, makeBreadcrumbResolver, collectBlocks, flattenNcx, anchorBoundaries } from "./epub";
import type { Block } from "./epub";
import { smartMergeParagraphs } from "./smart-merge";
import { chunkBook } from "./chunker";
import type { ChunkOptions, RawSection } from "./chunker";
import { blocksFromMarkdown, blocksFromPlainText, decodeBytes, guessTitleFromMarkdown } from "./ingest-text";

export interface ImportResult {
	bookTitle: string;
	docId: string;
	meta: BookMeta;
	format: "epub" | "markdown" | "txt";
	sectionCount: number;
	stats: { sections: number; hardSplitCount: number };
	tiddlers: Record<string, any>[];
	warnings: string[];
}

type MetaWithFormat = BookMeta & { __format?: string };

function uniqueTitleFactory() {
	const used = new Map<string, number>();
	return (base: string) => {
		const n = (used.get(base) || 0) + 1;
		used.set(base, n);
		return n === 1 ? base : `${base} ~${n}`;
	};
}

/** TW 日期字符串（与 $tw.utils.stringifyDate 一致：YYYY0MM0DD0hh0mm0ss0XXX，本地时区） */
export function twDateString(d: Date): string {
	const p = (n: number, l: number) => String(n).padStart(l, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1, 2)}${p(d.getDate(), 2)}${p(d.getHours(), 2)}${p(d.getMinutes(), 2)}${p(d.getSeconds(), 2)}${p(d.getMilliseconds(), 3)}`;
}

/**
 * FSRS 初始字段集。
 * 关键修复：fsrs4tw 的过滤器要求卡片已含全部 FSRS 字段才走评分写入路径；
 * 缺字段的卡评分静默失败 → 队列首位永不变（表现为"无法切换下一张"）。
 */
export function initialFsrsFields(now: Date): Record<string, string> {
	return {
		due: twDateString(now),
		state: "0",
		reps: "0",
		lapses: "0",
		stability: "0",
		difficulty: "0",
		elapsed_days: "0",
		scheduled_days: "0",
		last_review: twDateString(now)
	};
}

async function emitTiddlers(docId: string, meta: MetaWithFormat, bookTitle: string, sections: RawSection[], bag: string): Promise<{ tiddlers: Record<string, any>[]; warnings: string[] }> {
	const warnings: string[] = [];
	const unique = uniqueTitleFactory();
	const docTitle = unique(bookTitle || "未命名导入");
	const format = meta.__format || "epub";
	const nowFields = initialFsrsFields(new Date());
	// TiddlyWeb server 版同步字段：bag 定位存储桶，revision=0 表示尚未与服务端同步
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
			"tidme.breadcrumb": joined,
			"tidme.source": meta.title || "",
			"tidme.author": meta.creator || "",
			"tidme.format": format,
			...(s.merged ? { "tidme.merged": "yes" } : {}),
			...(s.file ? { "tidme.file": s.file } : {})
		});
	}

	const links = cards.map((t) => `* [[${t.title}]]`).join("\n");
	const formatLabel = ({ epub: "导入自 EPUB", markdown: "导入自 Markdown", txt: "导入自 TXT" } as const)[format];
	const docLines = [`//${formatLabel}//`];
	if (meta.creator) docLines.push("作者：" + meta.creator);
	if (meta.language) docLines.push("语言：" + meta.language);
	docLines.push("文档 ID：" + docId);
	docLines.push(`共 ${cards.length} 节：`, "", links);

	const docTiddler = {
		title: docTitle,
		type: "text/vnd.tiddlywiki",
		tags: ["tidme-import-doc"],
		text: docLines.join("\n"),
		bag,
		revision: "0",
		"tidme.doc": docId,
		...(meta.title ? { "tidme.source": meta.title } : {}),
		...(meta.creator ? { "tidme.author": meta.creator } : {})
	};

	return { tiddlers: [docTiddler, ...cards], warnings };
}

export interface ImportOptions extends ChunkOptions { bag?: string }

async function finalize(sections: RawSection[], stats: { sections: number; hardSplitCount: number }, meta: MetaWithFormat, format: ImportResult["format"], fileName: string, bag: string): Promise<ImportResult> {
	meta.__format = format;
	const cleanMeta: BookMeta = { ...meta };
	const docId = await makeDocId(cleanMeta);
	const bookTitle = (cleanMeta.title || fileName.replace(/.*\//, "") || "未命名导入").trim();
	const { tiddlers, warnings } = await emitTiddlers(docId, meta, bookTitle, sections, bag);
	return {
		bookTitle,
		docId,
		meta: cleanMeta,
		format,
		sectionCount: stats.sections,
		stats,
		tiddlers,
		warnings
	};
}

/** EPUB 主流程 */
async function importEpubBytes(bytes: Uint8Array, fileName: string, options: ImportOptions): Promise<ImportResult> {
	const book = await readEpubBytes(bytes);
	const ncxTree = await extractNcxTree(book);
	const resolveCrumb = makeBreadcrumbResolver(ncxTree, book.spine);
	const flatNav = flattenNcx(ncxTree);

	const files = [];
	for (let i = 0; i < book.spine.length; i++) {
		const href = book.spine[i].href;
		const file = book.zip.file(href);
		if (!file) continue;
		const raw = await file.async("string");
		let doc: Document;
		try {
			doc = new DOMParser().parseFromString(raw, "text/xml");
		} catch (err: any) {
			throw new Error(`解析 ${href} 失败: ${err.message}`);
		}
		smartMergeParagraphs(doc);
		const blocks = collectBlocks(doc);

		// NCX 锚点 → 合成标题块（目录驱动的切分边界）。
		// 跳过与文件面包屑末项同名的条目（避免章节标题重复出现）。
		const entries = flatNav.filter((n) => n.href === href && n.title);
		const boundaries = anchorBoundaries(doc, blocks, entries);
		const crumbTail = (resolveCrumb(i)[resolveCrumb(i).length - 1] || "").trim();
		for (let b = boundaries.length - 1; b >= 0; b--) {
			const { idx, entry } = boundaries[b];
			if (!entry.title) continue;
			if (entry.title.trim() === crumbTail && idx === 0) continue;
			const heading: Block = {
				text: entry.title,
				tag: "h" + Math.max(1, Math.min(6, entry.depth + 1)),
				isHeading: true,
				level: Math.max(1, Math.min(6, entry.depth + 1))
			};
			blocks.splice(idx, 0, heading);
		}

		files.push({ fileName: href, fileBreadcrumb: resolveCrumb(i), blocks });
	}

	const { sections, stats } = chunkBook(files, options);
	return finalize(sections, stats, { ...book.meta }, "epub", fileName, options.bag || "default");
}

/** Markdown / TXT 主流程 */
async function importTextBytes(bytes: Uint8Array, fileName: string, options: ImportOptions): Promise<ImportResult> {
	const isMd = /\.(md|markdown)$/i.test(fileName);
	const text = decodeBytes(bytes);
	const blocks = isMd ? blocksFromMarkdown(text) : blocksFromPlainText(text);
	if (!blocks.length) throw new Error("文件内容为空");
	const base = fileName.replace(/.*\//, "").replace(/\.[a-z0-9]+$/i, "");
	const meta: MetaWithFormat = { title: isMd ? (guessTitleFromMarkdown(text) || base) : base };
	const { sections, stats } = chunkBook([{ fileName, fileBreadcrumb: [], blocks }], options);
	return finalize(sections, stats, meta, isMd ? "markdown" : "txt", fileName, options.bag || "default");
}

export async function runImport(bytes: Uint8Array, fileName: string, options: ImportOptions = {}): Promise<ImportResult> {
	const lower = fileName.toLowerCase();
	if (lower.endsWith(".epub")) return importEpubBytes(bytes, fileName, options);
	if (/\.(md|markdown)$/.test(lower)) return importTextBytes(bytes, fileName, options);
	if (lower.endsWith(".txt")) return importTextBytes(bytes, fileName, options);
	throw new Error("不支持的格式（M2 支持 .epub / .md / .txt）");
}

/**
 * M3：在同一文档的有序节列表中计算相邻节。
 * @param orderedTitles 已按阅读顺序排列的节标题
 * @param current 当前节标题
 */
export function neighborsOf(orderedTitles: string[], current: string): { prev: string | null; next: string | null; index: number } {
	const i = orderedTitles.indexOf(current);
	return {
		prev: i > 0 ? orderedTitles[i - 1] : null,
		next: i >= 0 && i < orderedTitles.length - 1 ? orderedTitles[i + 1] : null,
		index: i
	};
}
