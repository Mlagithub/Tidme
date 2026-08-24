/*
ingest-text.ts — Markdown / TXT 的轻量摄取（M2 范围）

复用 chunker：把文本转成合成 Block 流，再走统一的大纲树切分。
- Markdown：ATX 标题（#{1,6}）为骨架；段落按空行聚合
- TXT：无标题 → 段落聚合为虚拟节（由切分器按尺寸分段）
*/

import { normalizeText } from "./ids";
import type { Block } from "./epub";

function virtualBlock(text: string, isHeading = false, level = 0): Block {
	// 合成块没有 DOM；标题块不重复出现在正文 HTML 中（标题进面包屑/卡片名）
	return { text, tag: isHeading ? "h" + level : "p", isHeading, level, virtualHtml: isHeading ? "" : `<p>${escapeHtml(text)}</p>` };
}

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 按空行聚段（保留行内换行的场景极少；M2 统一折叠） */
function paragraphsOf(text: string): string[] {
	const normalized = text.replace(/\r\n?/g, "\n");
	const paras = normalized.split(/\n[ \t]*\n+/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
	return paras.length ? paras : [normalized.trim()].filter(Boolean);
}

export function blocksFromMarkdown(text: string): Block[] {
	const blocks: Block[] = [];
	for (const para of paragraphsOf(text)) {
		const heading = para.match(/^(#{1,6})\s+(.+)$/);
		if (heading) {
			blocks.push(virtualBlock(heading[2].trim(), true, heading[1].length));
		} else if (/^(\s*[-*+]\s+|\s*\d+[.)]\s+)/.test(para)) {
			// 列表段：整段作为普通块保留原始行结构
			blocks.push({ ...virtualBlock(para), virtualHtml: "<pre class=\"tm-import-list\">" + escapeHtml(para) + "</pre>" });
		} else {
			blocks.push(virtualBlock(para));
		}
	}
	return blocks.filter((b) => normalizeText(b.text));
}

export function blocksFromPlainText(text: string): Block[] {
	return paragraphsOf(text).map((p) => virtualBlock(p)).filter((b) => normalizeText(b.text));
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

/** 从 Markdown 提取首个一级标题作书名兜底 */
export function guessTitleFromMarkdown(text: string): string | null {
	const m = text.match(/^\s*#\s+(.+)$/m);
	return m ? m[1].trim() : null;
}
