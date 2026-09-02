/*
chunker.ts — 大纲树递归切分器（浏览器版，与 Node 版同构）
规则详见 D:\work\tidme-import\src\chunk\outline-chunker.js 头注。
*/

import { normalizeText } from "$:/plugins/keepone/tidme/core/ids";
import type { Block } from "./epub";

export const DEFAULTS = { maxChars: 4000, minChars: 600 };

export interface ChunkOptions { maxChars?: number; minChars?: number }

function cleanOptions(options: ChunkOptions = {}): ChunkOptions {
	const out: ChunkOptions = {};
	if (Number.isFinite(options.maxChars) && (options.maxChars as number) > 0) out.maxChars = options.maxChars;
	if (Number.isFinite(options.minChars) && (options.minChars as number) >= 0) out.minChars = options.minChars;
	return out;
}

function escapeHtml(text: string) {
	return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const charsOf = (blocks: Block[]) => blocks.reduce((n, b) => n + normalizeText(b.text).length, 0);

function serializeChildren(el: any): string {
	const ser = new XMLSerializer();
	let out = "";
	for (const c of Array.from(el.childNodes || [])) out += ser.serializeToString(c);
	return out;
}

/** 允许原样回包的块级标签；列表/表格单元降级为 <p> 以保证独立片段的合法性 */
const WRAP_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "figcaption", "caption", "div"]);

/** 块的完整块级 HTML：必须带回原始标签，否则多块拼接会失去段落结构 */
function blockHtml(block: any): string {
	if (typeof block.virtualHtml === "string") return block.virtualHtml;
	try {
		if (block.el) {
			const inner = serializeChildren(block.el);
			let tag = String(block.tag || "p").toLowerCase();
			if (!WRAP_TAGS.has(tag)) tag = "p";
			if (inner.trim()) return `<${tag}>${inner}</${tag}>`;
		}
	} catch { /* fallthrough */ }
	return `<p>${escapeHtml(normalizeText(block.text))}</p>`;
}

export function splitSentences(text: string, maxLen: number): string[] {
	const sentences = String(text).match(/[^。！？!?；;\n]+[。！？!?；;]*/g) || [String(text)];
	const out: string[] = [];
	let cur = "";
	for (const s of sentences) {
		if (s.length > maxLen) {
			if (cur) { out.push(cur); cur = ""; }
			for (let i = 0; i < s.length; i += maxLen) out.push(s.slice(i, i + maxLen));
			continue;
		}
		if (cur && cur.length + s.length > maxLen) { out.push(cur); cur = s; }
		else cur += s;
	}
	if (cur) out.push(cur);
	return out;
}

interface Part { htmlParts: string[]; textParts: string[]; chars: number }

function partitionBlocks(blocks: Block[], maxChars: number): { parts: Part[]; hardSplitCount: number } {
	const parts: Part[] = [];
	let cur: Part = { htmlParts: [], textParts: [], chars: 0 };
	let hardSplitCount = 0;
	const flush = () => {
		if (cur.htmlParts.length || cur.textParts.length) { parts.push(cur); cur = { htmlParts: [], textParts: [], chars: 0 }; }
	};
	for (const b of blocks) {
		const t = normalizeText(b.text);
		if (!t) continue;
		if (b.atomic) {
			// 原子块（围栏代码/表格）：永不切分，整块独立成段（超长记警告由 stats 体现）
			flush();
			parts.push({ htmlParts: [blockHtml(b)], textParts: [t], chars: t.length });
			continue;
		}
		if (t.length > maxChars) {
			flush();
			for (const piece of splitSentences(t, maxChars)) {
				parts.push({ htmlParts: [`<p>${escapeHtml(piece)}</p>`], textParts: [piece], chars: piece.length });
				hardSplitCount++;
			}
			continue;
		}
		if (cur.chars && cur.chars + t.length > maxChars) flush();
		cur.htmlParts.push(blockHtml(b));
		cur.textParts.push(t);
		cur.chars += t.length;
	}
	flush();
	return { parts, hardSplitCount };
}

interface TreeNode { level: number; text: string; blocks: Block[]; children: TreeNode[] }

export function buildTree(blocks: Block[]): { roots: TreeNode[]; preamble: Block[] } {
	const roots: TreeNode[] = [];
	const stack: { level: number; children: TreeNode[] }[] = [{ level: 0, children: roots }];
	let current: TreeNode | null = null;
	const preamble: Block[] = [];
	for (const b of blocks) {
		if (b.isHeading) {
			while (stack.length > 1 && stack[stack.length - 1].level >= b.level) stack.pop();
			const parent = stack[stack.length - 1];
			const node: TreeNode = { level: b.level, text: b.text, blocks: [], children: [] };
			parent.children.push(node);
			stack.push({ level: b.level, children: node.children });
			current = node;
		} else {
			(current ? current.blocks : preamble).push(b);
		}
	}
	return { roots, preamble };
}

interface Leaf { node: TreeNode; trail: string[] }

function collectLeaves(nodes: TreeNode[], trail: string[] = [], out: Leaf[] = []): Leaf[] {
	for (const n of nodes) {
		const path = [...trail, n.text || ""];
		if (!n.children.length) out.push({ node: n, trail: path });
		else {
			if (n.blocks.length) out.push({ node: { level: n.level, text: n.text, blocks: n.blocks, children: [] }, trail: path });
			collectLeaves(n.children, path, out);
		}
	}
	return out;
}

export interface RawSection {
	level: number; title: string; trail: string[];
	html: string; text: string; chars: number;
	merged?: boolean; isContinuation?: boolean; file?: string; orderInFile?: number; ordinal?: number;
	/** 分段明细（G1 干预边界）：parts[0]=自身内容；parts[1..]=并入的子节（title 有值 = 以标题开头） */
	parts?: SectionPart[];
}

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

	// 0. 过滤删除节与修改标题/改短
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

	// 第三遍：插入手动新增的自定义节
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
		sec.ordinal = i;
	});
	return result;
}

function applySizeRules(leaves: Leaf[], cfg: { maxChars: number; minChars: number }, stats: { hardSplitCount: number }): RawSection[] {
	const expanded: RawSection[] = [];
	for (const leaf of leaves) {
		const title = leaf.trail[leaf.trail.length - 1] || "";
		const blocks = leaf.node.blocks.filter((b) => normalizeText(b.text));
		const html = blocks.map(blockHtml).join("\n\n");
		const text = blocks.map((b) => normalizeText(b.text)).join("\n");
		const total = charsOf(blocks);
		expanded.push({
			level: leaf.node.level,
			title,
			trail: leaf.trail,
			html,
			text,
			chars: total,
			parts: [{ html, text, chars: total }]
		});
	}

	const result: RawSection[] = [];
	for (const sec of expanded) {
		const canMergeIntoPrev =
			result.length &&
			sec.chars < cfg.minChars &&
			result[result.length - 1].chars + sec.chars <= cfg.maxChars;
		if (canMergeIntoPrev) {
			const prev = result[result.length - 1];
			prev.parts!.push({ title: sec.title || undefined, html: sec.html, text: sec.text, chars: sec.chars });
			prev.chars += sec.chars;
			prev.merged = true;
			continue;
		}
		result.push(sec);
	}
	return result.map(deriveSection);
}

function makeBreadcrumb(parts: (string | null | undefined)[]): string[] {
	return parts.map((p) => String(p || "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function chunkFile(
	p: { blocks: Block[]; fileBreadcrumb: string[]; fileName: string; options?: ChunkOptions },
	statsOut: { hardSplitCount?: number } = {}
): RawSection[] {
	const cfg = { ...DEFAULTS, ...cleanOptions(p.options || {}) };
	statsOut.hardSplitCount = statsOut.hardSplitCount || 0;
	const blocks = p.blocks || [];
	const crumbBase = Array.isArray(p.fileBreadcrumb) ? p.fileBreadcrumb.filter(Boolean) : [];

	const headings = blocks.filter((b) => b.isHeading);

	if (!headings.length) {
		const fallbackTitle =
			crumbBase[crumbBase.length - 1] ||
			String(p.fileName || "").replace(/.*\//, "").replace(/\.[a-z0-9]+$/i, "") ||
			"正文";
		const level = Math.max(2, Math.min(6, crumbBase.length + 1));
		const { parts, hardSplitCount } = partitionBlocks(blocks, cfg.maxChars);
		statsOut.hardSplitCount += hardSplitCount;
		return parts.map((part, idx) => {
			const html = part.htmlParts.join("\n\n");
			const text = part.textParts.join("\n");
			return {
				level,
				title: idx === 0 ? fallbackTitle : "",
				trail: makeBreadcrumb([...crumbBase, idx === 0 ? fallbackTitle : ""]),
				html,
				text,
				chars: part.chars,
				isContinuation: idx > 0,
				parts: [{ html, text, chars: part.chars }]
			};
		});
	}

	const { roots, preamble } = buildTree(blocks);
	const leaves = collectLeaves(roots);

	if (preamble.some((b) => normalizeText(b.text))) {
		leaves.unshift({ node: { level: headings[0].level, text: "前言", blocks: preamble, children: [] }, trail: [...crumbBase, "前言"] });
	}

	const processed = applySizeRules(leaves, cfg, statsOut);

	return processed.map((sec) => ({
		level: Math.max(2, Math.min(6, sec.level)),
		title: sec.title || "",
		trail: makeBreadcrumb(sec.trail),
		html: sec.html,
		text: sec.text,
		chars: sec.chars,
		merged: !!sec.merged,
		isContinuation: !!sec.isContinuation,
		...(sec.parts ? { parts: sec.parts } : {})
	}));
}

export interface InputFile { fileName: string; fileBreadcrumb: string[]; blocks: Block[] }

export function chunkBook(
	files: InputFile[],
	options: ChunkOptions = {},
	overrides?: SplitOverrides
): { sections: RawSection[]; stats: { sections: number; hardSplitCount: number } } {
	const stats = { hardSplitCount: 0, sections: 0 };
	const sections: RawSection[] = [];
	for (const f of files) {
		const secs = chunkFile({ blocks: f.blocks, fileBreadcrumb: f.fileBreadcrumb, fileName: f.fileName, options }, stats as any);
		secs.forEach((s, i) => sections.push({ ...s, file: f.fileName, orderInFile: i }));
	}
	sections.forEach((s, idx) => {
		s.ordinal = idx;
		if (s.isContinuation) {
			const base = s.trail.length ? s.trail[s.trail.length - 1] : "续";
			s.trail = [...s.trail.slice(0, -1), `${base} (续)`];
		}
		if (!s.title) s.title = s.trail[s.trail.length - 1] || "续";
	});
	// G1 干预：拆分/合并 + ordinal 重排
	const final = applyOverrides(sections, overrides);
	stats.sections = final.length;
	return { sections: final, stats };
}
