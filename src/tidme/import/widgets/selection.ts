/*
widgets/selection.ts — 划词共享工具（阅读条栏 section-bar 与全局制卡气泡 pick-bubble 共用）

- frameTitleOfSelection：从当前选区/光标向上定位所在卡的 title
  （按钮获焦导致 anchorNode 无 attribute 时回退调用方注入的 fallback）
- getSelectionInfo：提取激活选区内容及其所在自然块/行内容
  （优先 CodeMirror 6 编辑器选区——经 getEditorView 注入；回退原生 DOM Selection）
无状态纯 DOM 读取；不写库、不发事件。
*/

/** 从选区向上找 data-tiddler-title；找不到回退 fallback() */
export function frameTitleOfSelection(win: any, fallback?: () => string | null): string | null {
	const sel = win?.getSelection?.();
	if (sel && sel.anchorNode) {
		let node: any = sel.anchorNode;
		while (node) {
			if (node.getAttribute) {
				const t = node.getAttribute("data-tiddler-title");
				if (t) return t;
			}
			node = node.parentNode;
		}
	}
	return fallback ? fallback() : null;
}

/** 选区内容 + 所在块/行（兼容 CodeMirror 6 与原生 DOM）；无选区时两者为空串 */
export function getSelectionInfo(win: any, getEditorView?: () => any): { selected: string; block: string } {
	let selected = "";
	let block = "";

	// 1. 优先从 CodeMirror 6 编辑器中获取选区与当前行（阅读条栏的 section-body 场景）
	const view = getEditorView?.();
	if (view) {
		const sel = view.state.selection.main;
		if (!sel.empty) {
			selected = view.state.sliceDoc(sel.from, sel.to).trim();
			const line = view.state.doc.lineAt(sel.from);
			block = line.text.trim();
		}
	}

	// 2. 回退原生 DOM Selection
	if (!selected) {
		const sel = win?.getSelection?.();
		if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
			selected = String(sel).trim();
			let node: any = sel.getRangeAt(0).startContainer;
			const BLOCK = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE", "DIV", "SPAN"]);
			while (node && !(node.tagName && (BLOCK.has(String(node.tagName)) || (node.className && String(node.className).includes("cm-line"))))) {
				node = node.parentNode;
			}
			if (node) {
				block = String(node.textContent || "").replace(/\s+/g, " ").trim();
			}
		}
	}

	if (!block && selected) {
		block = selected;
	}

	return { selected, block };
}
