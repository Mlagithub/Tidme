/*
ingest-text.ts — 文本摄取：Markdown / Wikitext / HTML / TXT → 统一 Block 流

复用 chunker：把文本转成合成 Block 流，再走统一的大纲树切分。
- Markdown：ATX/setext 标题、围栏代码（原子块）、表格（原子块）、引用、列表、水平线
- Wikitext：`!` 标题、转义 `<h1-h6>`
- HTML：DOMParser → collectBlocks（与 EPUB 共用叶子块模型）
- TXT：段落聚合为虚拟节
*/

import { normalizeText } from "$:/plugins/tidme/core/ids";
import type { Block } from "./epub";
import { collectBlocks } from "./epub";

export type TextFormat = "markdown" | "wikitext" | "html" | "txt";

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function virtualBlock(text: string, isHeading = false, level = 0): Block {
	// 合成块没有 DOM；标题块不重复出现在正文 HTML 中（标题进面包屑/卡片名）
	return { text, tag: isHeading ? "h" + level : "p", isHeading, level, virtualHtml: isHeading ? "" : `<p>${escapeHtml(text)}</p>` };
}

function headingBlock(text: string, level: number): Block {
	return virtualBlock(text, true, Math.max(1, Math.min(6, level)));
}

function preBlock(text: string, cls = "tm-import-code", tag = "pre"): Block {
	return {
		text,
		tag,
		isHeading: false,
		level: 0,
		atomic: true,
		virtualHtml: `<pre class="${cls}">${escapeHtml(text)}</pre>`
	};
}

function blockquoteBlock(text: string): Block {
	return {
		text,
		tag: "blockquote",
		isHeading: false,
		level: 0,
		virtualHtml: `<blockquote>${escapeHtml(text)}</blockquote>`
	};
}

function splitLines(text: string): string[] {
	return String(text || "").replace(/\r\n?/g, "\n").split("\n");
}

/** 按空行聚段 */
function paragraphsOf(text: string): string[] {
	const normalized = String(text || "").replace(/\r\n?/g, "\n");
	const paras = normalized.split(/\n[ \t]*\n+/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
	return paras.length ? paras : [normalized.trim()].filter(Boolean);
}

const FENCE_RE = /^\s*(```|~~~)\s*([^\s]*)\s*$/;
const ATX_RE = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT_RE = /^\s*(=+|-+)\s*$/;
const HR_RE = /^\s*([-*_])\s*\1\s*\1+\s*$/;
const LIST_RE = /^(\s*[-*+]\s+|\s*\d+[.)]\s+)/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const QUOTE_RE = /^\s*>\s?/;

function isTableSeparator(line: string): boolean {
	return TABLE_SEP_RE.test(line) && line.includes("-");
}

/** 从一行开始收集表格行（表头 + 分隔行 + 数据行），返回 { rows, nextIndex } */
function collectTable(lines: string[], start: number): { rows: string[]; nextIndex: number } {
	const rows: string[] = [lines[start]];
	let i = start + 1;
	// 表头后必须紧跟分隔行才视为表格
	if (i < lines.length && isTableSeparator(lines[i])) {
		rows.push(lines[i]);
		i++;
		while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && !isTableSeparator(lines[i])) {
			rows.push(lines[i]);
			i++;
		}
		return { rows, nextIndex: i };
	}
	return { rows: [], nextIndex: start + 1 };
}

export function blocksFromMarkdown(text: string): Block[] {
	const lines = splitLines(text);
	const blocks: Block[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();

		// 围栏代码 → 原子块
		const fence = trimmed.match(FENCE_RE);
		if (fence) {
			const content: string[] = [];
			i++;
			while (i < lines.length && !/^\s*(```|~~~)\s*$/.test(lines[i])) { content.push(lines[i]); i++; }
			i++; // 跳过闭合围栏
			blocks.push(preBlock(content.join("\n"), fence[2] ? `tm-import-code ${fence[2]}` : "tm-import-code"));
			continue;
		}

		// ATX 标题
		const atx = trimmed.match(ATX_RE);
		if (atx && !trimmed.startsWith("#!")) {
			blocks.push(headingBlock(atx[2].trim(), atx[1].length));
			i++;
			continue;
		}

		// 表格（表头 + 分隔行）
		if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
			const { rows, nextIndex } = collectTable(lines, i);
			if (rows.length) {
				blocks.push(preBlock(rows.join("\n"), "tm-import-table", "table"));
				i = nextIndex;
				continue;
			}
		}

		// setext 标题（下行 === / ---）
		if (trimmed && i + 1 < lines.length && SETEXT_RE.test(lines[i + 1]) && !HR_RE.test(line)) {
			blocks.push(headingBlock(trimmed, lines[i + 1].trim().startsWith("=") ? 1 : 2));
			i += 2;
			continue;
		}

		// 引用块
		if (QUOTE_RE.test(line)) {
			const quote: string[] = [];
			while (i < lines.length && QUOTE_RE.test(lines[i])) {
				quote.push(lines[i].replace(QUOTE_RE, ""));
				i++;
			}
			blocks.push(blockquoteBlock(quote.join(" ")));
			continue;
		}

		// 水平线（独立行）
		if (HR_RE.test(trimmed)) { i++; continue; }

		// 列表
		if (LIST_RE.test(line)) {
			const items: string[] = [];
			while (i < lines.length && (LIST_RE.test(lines[i]) || /^\s+\S/.test(lines[i]))) {
				items.push(lines[i]);
				i++;
			}
			blocks.push(preBlock(items.join("\n"), "tm-import-list", "pre"));
			continue;
		}

		// 段落：连续非空行
		if (trimmed) {
			const para: string[] = [trimmed];
			i++;
			while (
				i < lines.length && lines[i].trim() &&
				!FENCE_RE.test(lines[i]) && !ATX_RE.test(lines[i]) && !QUOTE_RE.test(lines[i]) &&
				!LIST_RE.test(lines[i]) && !HR_RE.test(lines[i].trim()) &&
				!(TABLE_ROW_RE.test(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
			) {
				para.push(lines[i].trim());
				i++;
			}
			blocks.push(virtualBlock(para.join(" ")));
			continue;
		}

		i++;
	}
	return blocks.filter((b) => normalizeText(b.text));
}

export function blocksFromWikitext(text: string): Block[] {
	const lines = splitLines(text);
	const blocks: Block[] = [];
	let i = 0;
	while (i < lines.length) {
		const trimmed = lines[i].trim();
		// `!` 标题（排除图片 `![`）
		const bang = trimmed.match(/^(!{1,6})\s*(.+)$/);
		if (bang && !trimmed.startsWith("![")) {
			blocks.push(headingBlock(bang[2].trim(), bang[1].length));
			i++;
			continue;
		}
		// 转义 HTML 标题
		const htmlH = trimmed.match(/^<h([1-6])[^>]*>(.*?)<\/h\1>\s*$/i);
		if (htmlH) {
			blocks.push(headingBlock(htmlH[2].replace(/<[^>]+>/g, "").trim(), Number(htmlH[1])));
			i++;
			continue;
		}
		if (trimmed) {
			const para: string[] = [trimmed];
			i++;
			while (i < lines.length && lines[i].trim() && !/^!{1,6}\s/.test(lines[i].trim()) && !/^<h[1-6][^>]*>/i.test(lines[i].trim())) {
				para.push(lines[i].trim());
				i++;
			}
			blocks.push(virtualBlock(para.join(" ")));
			continue;
		}
		i++;
	}
	return blocks.filter((b) => normalizeText(b.text));
}

export function blocksFromHtml(text: string): Block[] {
	if (typeof DOMParser === "undefined") {
		throw new Error("HTML 解析需要 DOMParser（浏览器或 jsdom）");
	}
	const doc = new DOMParser().parseFromString(String(text || ""), "text/html");
	return collectBlocks(doc);
}

export function blocksFromPlainText(text: string): Block[] {
	return paragraphsOf(text).map((p) => virtualBlock(p)).filter((b) => normalizeText(b.text));
}

/** 格式探测（无显式 type 时） */
export function sniffFormat(text: string): TextFormat {
	const t = String(text || "").slice(0, 2000);
	if (/^\s*<(?:!DOCTYPE\s+html|html|head|body|h[1-6]|div|p)\b/i.test(t)) return "html";
	const hasMdHeading = /^\s*#{1,6}\s+\S/m.test(t);
	const hasMdFence = /^\s*(```|~~~)/m.test(t);
	const hasBangHeading = /^\s*!{1,6}\s+\S/m.test(t);
	if (hasBangHeading && !hasMdHeading && !hasMdFence) return "wikitext";
	if (hasMdHeading || hasMdFence || /^\s*[-*+]\s+\S/m.test(t) || /^\s*\d+[.)]\s+\S/m.test(t)) return "markdown";
	return "txt";
}

export function formatLabel(format: string): string {
	return ({ epub: "导入自 EPUB", markdown: "Markdown", wikitext: "Wikitext", html: "HTML", txt: "TXT" } as Record<string, string>)[format] || format;
}

/** 从文本探测标题（md: 首个一级标题；wikitext: 首个 ! 标题；html: 首个 h1） */
export function guessTitle(text: string, format: TextFormat): string | null {
	if (format === "markdown") return guessTitleFromMarkdown(text);
	if (format === "wikitext") {
		const m = text.match(/^\s*!\s+(.+)$/m);
		return m ? m[1].trim() : null;
	}
	if (format === "html") {
		const m = text.match(/<h1[^>]*>([^<]+)<\/h1>/i);
		return m ? m[1].trim() : null;
	}
	return null;
}

/** 从 Markdown 提取首个一级标题作书名兜底 */
export function guessTitleFromMarkdown(text: string): string | null {
	const m = text.match(/^\s*#\s+(.+)$/m);
	return m ? m[1].trim() : null;
}

/** 解码字节：优先 UTF-8 严格模式，失败回退 GBK（中文 txt 常见） */
export function decodeBytes(bytes: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		try { return new TextDecoder("gbk").decode(bytes); }
		catch { return new TextDecoder().decode(bytes); }
	}
}
