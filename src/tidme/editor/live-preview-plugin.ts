/**
 * live-preview-plugin.ts — CodeMirror 6 Obsidian 风格 Live Preview 动态 Decoration 引擎
 * 
 * 核心逻辑：
 * 1. 遍历 Viewport 可见行，调用 wikitext-parser 提取 WikiText 节点
 * 2. 比较节点范围与当前光标选区（selection）
 * 3. 选区移开 -> 应用 Decoration.replace 隐藏标记符号，并叠加排版 CSS 类
 * 4. 选区移入 -> 展开展示 raw 字符，方便修改
 * 5. 通过 atomicRanges 提供原生流畅的光标跳跃与删除支持
 */

import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { parseLineWikiText, SyntaxToken } from "./wikitext-parser";

// 预定义各语法的替换与样式 Decoration
const hideDeco = Decoration.replace({});

class ListPrefixWidget extends WidgetType {
	constructor(
		readonly prefixType: "bullet" | "number" | "term" | "def",
		readonly level: number,
		readonly numIndex: number = 1
	) {
		super();
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = `cm-live-list-prefix cm-live-list-${this.prefixType}`;
		if (this.prefixType === "bullet") {
			span.textContent = "• ";
		} else if (this.prefixType === "number") {
			span.textContent = `${this.numIndex}. `;
		} else if (this.prefixType === "term") {
			span.textContent = "▪ ";
		} else if (this.prefixType === "def") {
			span.textContent = "↳ ";
		}
		if (this.level > 1) {
			span.style.marginLeft = `${(this.level - 1) * 16}px`;
		}
		return span;
	}

	eq(other: ListPrefixWidget): boolean {
		return (
			other.prefixType === this.prefixType &&
			other.level === this.level &&
			other.numIndex === this.numIndex
		);
	}
}

const headingDecos: Record<number, Decoration> = {
	1: Decoration.mark({ class: "cm-live-heading cm-live-heading-1" }),
	2: Decoration.mark({ class: "cm-live-heading cm-live-heading-2" }),
	3: Decoration.mark({ class: "cm-live-heading cm-live-heading-3" }),
	4: Decoration.mark({ class: "cm-live-heading cm-live-heading-4" }),
	5: Decoration.mark({ class: "cm-live-heading cm-live-heading-5" }),
	6: Decoration.mark({ class: "cm-live-heading cm-live-heading-6" })
};

const boldDeco = Decoration.mark({ class: "cm-live-bold" });
const italicDeco = Decoration.mark({ class: "cm-live-italic" });
const underlineDeco = Decoration.mark({ class: "cm-live-underline" });
const strikethroughDeco = Decoration.mark({ class: "cm-live-strikethrough" });
const highlightDeco = Decoration.mark({ class: "cm-live-highlight" });
const superscriptDeco = Decoration.mark({ class: "cm-live-superscript" });
const subscriptDeco = Decoration.mark({ class: "cm-live-subscript" });
const inlineCodeDeco = Decoration.mark({ class: "cm-live-inline-code" });
const wikilinkDeco = Decoration.mark({ class: "cm-live-wikilink" });
const transclusionDeco = Decoration.mark({ class: "cm-live-transclusion" });
const blockquoteDeco = Decoration.mark({ class: "cm-live-blockquote" });
const hrDeco = Decoration.mark({ class: "cm-live-hr" });

interface PendingDeco {
	from: number;
	to: number;
	value: Decoration;
}

function buildLivePreviewDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const pending: PendingDeco[] = [];
	const { state } = view;
	const selection = state.selection.main;
	const cursorFrom = selection.from;
	const cursorTo = selection.to;

	const listCounters: Record<number, number> = {};

	for (let lineNo = 1; lineNo <= state.doc.lines; lineNo++) {
		const line = state.doc.line(lineNo);
		const lineTokens = parseLineWikiText(line.text, line.from);

		let hasNumberListOnLine = false;

		for (const token of lineTokens) {
			const isCursorInside = cursorTo >= token.from - 1 && cursorFrom <= token.to + 1;

			if (token.type === "list-number") {
				hasNumberListOnLine = true;
				const level = token.level || 1;
				listCounters[level] = (listCounters[level] || 0) + 1;
				// 重置更深层级的计数器
				for (const k of Object.keys(listCounters)) {
					if (Number(k) > level) {
						listCounters[Number(k)] = 0;
					}
				}

				if (!isCursorInside) {
					const numIndex = listCounters[level];
					const listWidgetDeco = Decoration.replace({
						widget: new ListPrefixWidget("number", level, numIndex)
					});
					if (token.markStartFrom !== undefined && token.markStartTo !== undefined) {
						pending.push({ from: token.markStartFrom, to: token.markStartTo, value: listWidgetDeco });
					}
				}
			} else if (
				token.type === "list-bullet" ||
				token.type === "list-term" ||
				token.type === "list-def"
			) {
				if (!isCursorInside) {
					let prefixType: "bullet" | "term" | "def" = "bullet";
					if (token.type === "list-term") prefixType = "term";
					else if (token.type === "list-def") prefixType = "def";

					const listWidgetDeco = Decoration.replace({
						widget: new ListPrefixWidget(prefixType, token.level || 1, 1)
					});
					if (token.markStartFrom !== undefined && token.markStartTo !== undefined) {
						pending.push({ from: token.markStartFrom, to: token.markStartTo, value: listWidgetDeco });
					}
				}
			} else if (!isCursorInside) {
				// 隐藏普通前置标记
				if (token.markStartFrom !== undefined && token.markStartTo !== undefined) {
					if (token.markStartFrom < token.markStartTo) {
						pending.push({ from: token.markStartFrom, to: token.markStartTo, value: hideDeco });
					}
				}

				// 隐藏后置标记
				if (token.markEndFrom !== undefined && token.markEndTo !== undefined) {
					if (token.markEndFrom < token.markEndTo) {
						pending.push({ from: token.markEndFrom, to: token.markEndTo, value: hideDeco });
					}
				}

				// 给节点整体内容加排版样式
				let styleDeco: Decoration | null = null;
				switch (token.type) {
					case "heading":
						styleDeco = headingDecos[token.level || 1] || headingDecos[1];
						break;
					case "bold":
						styleDeco = boldDeco;
						break;
					case "italic":
						styleDeco = italicDeco;
						break;
					case "underline":
						styleDeco = underlineDeco;
						break;
					case "strikethrough":
						styleDeco = strikethroughDeco;
						break;
					case "highlight":
						styleDeco = highlightDeco;
						break;
					case "superscript":
						styleDeco = superscriptDeco;
						break;
					case "subscript":
						styleDeco = subscriptDeco;
						break;
					case "inline-code":
						styleDeco = inlineCodeDeco;
						break;
					case "wikilink":
						styleDeco = wikilinkDeco;
						break;
					case "transclusion":
						styleDeco = transclusionDeco;
						break;
					case "blockquote":
						styleDeco = blockquoteDeco;
						break;
					case "hr":
						styleDeco = hrDeco;
						break;
				}

				if (styleDeco) {
					pending.push({ from: token.from, to: token.to, value: styleDeco });
				}
			}
		}

		if (!hasNumberListOnLine) {
			if (line.text.trim() === "" || (!line.text.startsWith("#") && !line.text.startsWith(" "))) {
				for (const k of Object.keys(listCounters)) {
					listCounters[Number(k)] = 0;
				}
			}
		}
	}

	// 严格按 from 升序排序，满足 CodeMirror 6 RangeSetBuilder 必须升序写入的断言要求
	pending.sort((a, b) => a.from - b.from || a.to - b.to);

	for (const item of pending) {
		builder.add(item.from, item.to, item.value);
	}

	return builder.finish();
}

export const livePreviewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildLivePreviewDecorations(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.selectionSet || update.viewportChanged) {
				this.decorations = buildLivePreviewDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => {
				return view.plugin(plugin)?.decorations || Decoration.none;
			})
	}
);
