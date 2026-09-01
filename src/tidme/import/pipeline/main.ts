/*
main.ts — 导入管线入口（浏览器版）

对外暴露：
  runImport(bytes, fileName, options)  文件字节 → tiddler JSON（EPUB 专用块路径；文本走 runSplit）
  runSplit(input)                      任意 markdown/wikitext/HTML/TXT 文本 → tiddler JSON（通用切分）
产物即标准 TW 导入格式；节卡带 kind=topic（阅读材料）。
*/

import { makeDocId, contentFingerprint } from "$:/plugins/keepone/tidme/core/ids";
import { readEpubBytes, extractNcxTree, extractNavTree, makeBreadcrumbResolver, collectBlocks, flattenNcx, anchorBoundaries } from "./epub";
import { smartMergeParagraphs } from "./smart-merge";
import { chunkBook } from "./chunker";
import type { ChunkOptions } from "./chunker";
import { decodeBytes, sniffFormat } from "./ingest-text";
import { emitTiddlers, runSplit, twDateString, initialFsrsFields } from "./split";

export { runSplit, twDateString, initialFsrsFields, applyOverrides, cleanTitle } from "./split";

export interface ImportResult {
	bookTitle: string;
	docId: string;
	meta: Record<string, string>;
	format: "epub" | "markdown" | "wikitext" | "html" | "txt";
	sectionCount: number;
	stats: { sections: number; hardSplitCount: number };
	tiddlers: Record<string, any>[];
	warnings: string[];
}

export interface ImportOptions extends ChunkOptions { bag?: string; priority?: number }

/** EPUB 主流程 */
async function importEpubBytes(bytes: Uint8Array, fileName: string, options: ImportOptions): Promise<ImportResult> {
	const book = await readEpubBytes(bytes);
	// EPUB3 nav.xhtml 优先，NCX 兜底（epub3-only 无 NCX 的书籍走 nav）
	let ncxTree: import("./epub").NcxNode[] = [];
	try { ncxTree = await extractNavTree(book); } catch { /* 解析失败回退 NCX */ }
	if (!ncxTree.length) ncxTree = await extractNcxTree(book);
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
			const heading: import("./epub").Block = {
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
	const meta: Record<string, string> = {
		...(book.meta.title ? { title: book.meta.title } : {}),
		...(book.meta.creator ? { creator: book.meta.creator } : {}),
		...(book.meta.language ? { language: book.meta.language } : {}),
		...(book.meta.date ? { date: book.meta.date } : {}),
		__format: "epub"
	};
	const docId = await makeDocId(book.meta);
	const bookTitle = (meta.title || fileName.replace(/.*\//, "") || "未命名导入").trim();
	const { tiddlers, warnings } = await emitTiddlers(docId, meta, bookTitle, sections, options.bag || "default", true, options.priority);
	return {
		bookTitle,
		docId,
		meta,
		format: "epub",
		sectionCount: stats.sections,
		stats,
		tiddlers,
		warnings
	};
}

/** 文本主流程：解码 → runSplit（统一切分器） */
async function importTextBytes(bytes: Uint8Array, fileName: string, options: ImportOptions): Promise<ImportResult> {
	const text = decodeBytes(bytes);
	if (!text.trim()) throw new Error("文件内容为空");
	const ext = fileName.toLowerCase();
	const type = /\.(md|markdown)$/.test(ext) ? "text/markdown"
		: /\.html?$/.test(ext) ? "text/html"
		: "text/plain";
	const base = fileName.replace(/.*\//, "").replace(/\.[a-z0-9]+$/i, "");
	const r = await runSplit({
		text,
		title: base,
		type,
		bag: options.bag || "default",
		priority: options.priority,
		maxChars: options.maxChars,
		minChars: options.minChars
	});
	return {
		bookTitle: r.bookTitle,
		docId: r.docId,
		meta: r.meta,
		format: r.format,
		sectionCount: r.sectionCount,
		stats: r.stats,
		tiddlers: r.tiddlers,
		warnings: r.warnings
	};
}

export async function runImport(bytes: Uint8Array, fileName: string, options: ImportOptions = {}): Promise<ImportResult> {
	const lower = fileName.toLowerCase();
	if (lower.endsWith(".epub")) return importEpubBytes(bytes, fileName, options);
	if (/\.(md|markdown|txt|html?)$/.test(lower)) return importTextBytes(bytes, fileName, options);
	throw new Error(`不支持的格式：${fileName}（支持 .epub / .md / .txt / .html）`);
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
