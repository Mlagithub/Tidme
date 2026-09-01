/**
 * wikitext-parser.ts — TiddlyWiki WikiText 增量语法标记解析器
 * 
 * 用于在 CodeMirror 6 编辑器中识别标题、加粗、斜体、下划线、删除线、行内代码、Wikilink 等节点的
 * 字符起止位置（from/to）以及对应要隐去/高亮显示的 Markup Mark 范围。
 */

export interface SyntaxToken {
	type:
		| "heading"
		| "bold"
		| "italic"
		| "underline"
		| "strikethrough"
		| "highlight"
		| "superscript"
		| "subscript"
		| "inline-code"
		| "code-block"
		| "wikilink"
		| "transclusion"
		| "list-bullet"
		| "list-number"
		| "list-term"
		| "list-def"
		| "blockquote"
		| "hr";
	from: number; // 整个节点起始 offset
	to: number; // 整个节点结束 offset
	markStartFrom?: number; // 前置语法标记起始 offset
	markStartTo?: number; // 前置语法标记结束 offset
	markEndFrom?: number; // 后置语法标记起始 offset
	markEndTo?: number; // 后置语法标记结束 offset
	level?: number; // 标题/引言/列表层级
	linkTarget?: string; // Wikilink 的目标 tiddler
	displayText?: string; // Wikilink 的显示文本
}

export function parseLineWikiText(lineText: string, lineFrom: number): SyntaxToken[] {
	const tokens: SyntaxToken[] = [];

	// 1. 分割线 (---)
	if (/^---\s*$/.test(lineText)) {
		tokens.push({
			type: "hr",
			from: lineFrom,
			to: lineFrom + lineText.length,
			markStartFrom: lineFrom,
			markStartTo: lineFrom + lineText.length
		});
		return tokens;
	}

	// 2. 标题识别 (^(!{1,6})\s+)
	const headingMatch = lineText.match(/^(!{1,6})\s+(.*)$/);
	if (headingMatch) {
		const level = headingMatch[1].length;
		const markLen = headingMatch[1].length + 1; // 包含后面的空格
		tokens.push({
			type: "heading",
			from: lineFrom,
			to: lineFrom + lineText.length,
			markStartFrom: lineFrom,
			markStartTo: lineFrom + markLen,
			level
		});
	}

	// 3. 列表符号识别 (*, #, ;, :)
	const listMatch = lineText.match(/^([*#;:]{1,4})\s+/);
	if (listMatch && !headingMatch) {
		const prefix = listMatch[1];
		let listType: SyntaxToken["type"] = "list-bullet";
		if (prefix.startsWith("#")) listType = "list-number";
		else if (prefix.startsWith(";")) listType = "list-term";
		else if (prefix.startsWith(":")) listType = "list-def";

		tokens.push({
			type: listType,
			from: lineFrom,
			to: lineFrom + listMatch[0].length,
			markStartFrom: lineFrom,
			markStartTo: lineFrom + listMatch[0].length,
			level: prefix.length
		});
	}

	// 4. 引用块 (> Quote)
	const bqMatch = lineText.match(/^(>{1,3})\s+/);
	if (bqMatch && !headingMatch && !listMatch) {
		tokens.push({
			type: "blockquote",
			from: lineFrom,
			to: lineFrom + lineText.length,
			markStartFrom: lineFrom,
			markStartTo: lineFrom + bqMatch[0].length,
			level: bqMatch[1].length
		});
	}

	// 5. 成对行内标记匹配器 helper
	const matchPairs = (
		regex: RegExp,
		type: SyntaxToken["type"]
	) => {
		let match: RegExpExecArray | null;
		regex.lastIndex = 0;
		while ((match = regex.exec(lineText)) !== null) {
			const fullStr = match[0];
			const innerText = match[1];
			const startPos = lineFrom + match.index;
			const endPos = startPos + fullStr.length;
			const markStartLen = (fullStr.length - innerText.length) / 2;

			tokens.push({
				type,
				from: startPos,
				to: endPos,
				markStartFrom: startPos,
				markStartTo: startPos + markStartLen,
				markEndFrom: endPos - markStartLen,
				markEndTo: endPos
			});
		}
	};

	// 粗体 ''bold''
	matchPairs(/''((?:(?!'').)+)''/g, "bold");
	// 斜体 //italic//
	matchPairs(/\/\/((?:(?!\/\/).)+)\/\//g, "italic");
	// 下划线 __underline__
	matchPairs(/__((?:(?!__).)+)__/g, "underline");
	// 删除线 ~~strikethrough~~
	matchPairs(/~~((?:(?!~~).)+)~~/g, "strikethrough");
	// 高亮/突出显示 @@highlight@@
	matchPairs(/@@((?:(?!@@).)+)@@/g, "highlight");
	// 上标 ^^superscript^^
	matchPairs(/\^\^((?:(?!\^\^).)+)\^\^/g, "superscript");
	// 下标 ,,subscript,,
	matchPairs(/,,((?:(?!,,).)+),,/g, "subscript");
	// 行内代码 `code` 与 {{{code}}}
	matchPairs(/`([^`]+)`/g, "inline-code");
	matchPairs(/\{\{\{((?:(?!\}\}\}).)+)\}\}\}/g, "inline-code");

	// 6. Wikilink 识别 [[Title]] 或 [[Text|Title]]
	const wikilinkRegex = /\[\[((?:(?!\]\]).)+)\]\]/g;
	let wlMatch: RegExpExecArray | null;
	while ((wlMatch = wikilinkRegex.exec(lineText)) !== null) {
		const fullStr = wlMatch[0];
		const innerContent = wlMatch[1];
		const startPos = lineFrom + wlMatch.index;
		const endPos = startPos + fullStr.length;

		let displayText = innerContent;
		let linkTarget = innerContent;

		if (innerContent.includes("|")) {
			const parts = innerContent.split("|");
			displayText = parts[0];
			linkTarget = parts[1];
			const pipeIdx = innerContent.indexOf("|");
			tokens.push({
				type: "wikilink",
				from: startPos,
				to: endPos,
				markStartFrom: startPos,
				markStartTo: startPos + 2, // [[
				markEndFrom: startPos + 2 + pipeIdx, // 从 | 开始到结尾 ]]
				markEndTo: endPos,
				displayText,
				linkTarget
			});
		} else {
			tokens.push({
				type: "wikilink",
				from: startPos,
				to: endPos,
				markStartFrom: startPos,
				markStartTo: startPos + 2,
				markEndFrom: endPos - 2,
				markEndTo: endPos,
				displayText,
				linkTarget
			});
		}
	}

	// 7. 嵌入 Transclusion {{Title}}
	const transRegex = /\{\{((?:(?!\}\}).)+)\}\}/g;
	let trMatch: RegExpExecArray | null;
	while ((trMatch = transRegex.exec(lineText)) !== null) {
		const fullStr = trMatch[0];
		const startPos = lineFrom + trMatch.index;
		const endPos = startPos + fullStr.length;
		tokens.push({
			type: "transclusion",
			from: startPos,
			to: endPos,
			markStartFrom: startPos,
			markStartTo: startPos + 2,
			markEndFrom: endPos - 2,
			markEndTo: endPos,
			displayText: trMatch[1]
		});
	}

	// 8. HTML 经典内联标签识别 <b>, <i>, <u>, <s>
	matchPairs(/<b>((?:(?!<\/b>).)+)<\/b>/gi, "bold");
	matchPairs(/<i>((?:(?!<\/i>).)+)<\/i>/gi, "italic");
	matchPairs(/<u>((?:(?!<\/u>).)+)<\/u>/gi, "underline");
	matchPairs(/<s>((?:(?!<\/s>).)+)<\/s>/gi, "strikethrough");

	return tokens;
}

/**
 * 自动清理并修复先前因 innerHTML 导致的 HTML 污染文本（如 <p>...</p>, <b>...</b>, &nbsp;），
 * 还原为干净、易读的原始 WikiText 格式。
 */
export function cleanContaminatedHtmlToWikiText(raw: string): string {
	if (!raw) return "";
	if (!/<[a-z1-6]+[^>]*>/i.test(raw) && !/&nbsp;/i.test(raw)) {
		return raw;
	}
	let text = raw;
	// 转换 段落 <p>...</p> -> 换行
	text = text.replace(/<p>/gi, "").replace(/<\/p>/gi, "\n\n");
	// 转换 粗体 <b>...</b>, <strong>...</strong> -> ''...''
	text = text.replace(/<(?:b|strong)>(.*?)<\/(?:b|strong)>/gi, "''$1''");
	// 转换 斜体 <i>...</i>, <em>...</em> -> //...//
	text = text.replace(/<(?:i|em)>(.*?)<\/(?:i|em)>/gi, "//$1//");
	// 转换 高亮 <mark>...</mark> -> @@...@@
	text = text.replace(/<mark>(.*?)<\/mark>/gi, "@@$1@@");
	// 转换 实体 &nbsp; -> 空格, &lt; -> <, &gt; -> >, &amp; -> &
	text = text.replace(/&nbsp;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&amp;/gi, "&");
	// 清除残留未闭合/孤立标签
	text = text.replace(/<[^>]+>/g, "");
	// 清理多余空行
	text = text.replace(/\n{3,}/g, "\n\n").trim();
	return text;
}
