/*
smart-merge.ts — PDF 碎行语义合并（浏览器版，与 Node 版同构）
*/

const SENTENCE_END = /[。！？；：…!?;:"“”‘’（）)]\s*$/;
const BLOCK_BREAK = new Set(["div", "body", "blockquote", "td", "li", "dd", "dt", "tr"]);
const NEW_BLOCK_PATTERNS = [
	/^\s*第[一二三四五六七八九十百千0-9]+[章节篇部卷]/,
	/^\s*[一二三四五六七八九十百]+\s*[、.．]/,
	/^\s*（[一二三四五六七八九十百]+）/,
	/^\s*\d+\s*[、.．]/,
	/^\s*\d+(\.\d+)+/,
	/^\s*[—\-–]\s*\S/,
	/^\s*[A-Z][A-Z0-9\s]{0,24}$/
];

function localName(node: any): string {
	return String((node && (node.localName || node.tagName)) || "").toLowerCase();
}

function getText(node: any): string {
	let out = "";
	const walk = (n: any) => {
		for (const c of Array.from(n.childNodes || [])) {
			if (c.nodeType === 3) out += c.nodeValue || "";
			else if (c.nodeType === 1) walk(c);
		}
	};
	walk(node);
	return out;
}

export function smartMergeParagraphs(doc: Document): boolean {
	const body = doc.getElementsByTagName("body")[0] || doc.documentElement;
	if (!body) return false;

	const isNewBlock = (text: string) => {
		const t = (text || "").trim();
		if (!t) return true;
		if (t.length <= 20 && !/[。！？；：!?;]$/.test(t)) return true;
		for (const re of NEW_BLOCK_PATTERNS) if (re.test(t)) return true;
		return false;
	};
	const textOf = (node: any) => getText(node).replace(/\s+/g, " ").trim();
	const stripTrailingHyphen = (node: any) => {
		const kids = node.childNodes;
		for (let i = kids.length - 1; i >= 0; i--) {
			const c = kids[i];
			if (c.nodeType === 3) { c.nodeValue = c.nodeValue.replace(/\s*-\s*$/, ""); return; }
			if (c.nodeType === 1) { stripTrailingHyphen(c); return; }
		}
	};

	let changed = false;
	const mergeWalk = (parent: any) => {
		const kids = Array.from(parent.childNodes || []);
		for (const c of kids) {
			if (c.nodeType === 1 && BLOCK_BREAK.has(localName(c))) mergeWalk(c);
		}
		let i = 0;
		while (i < kids.length) {
			const c = kids[i];
			if (c.nodeType !== 1 || localName(c) !== "p") { i++; continue; }
			const seq: any[] = [kids[i]];
			let j = i + 1;
			while (j < kids.length) {
				const k = kids[j];
				if (k.nodeType === 1 && localName(k) === "p") { seq.push(k); j++; continue; }
				if (k.nodeType === 3 && /^\s*$/.test(k.nodeValue || "")) { j++; continue; }
				break;
			}
			if (seq.length < 2) { i = j; continue; }
			let current = seq[0];
			let curText = textOf(current);
			for (let k = 1; k < seq.length; k++) {
				const p = seq[k];
				const t = textOf(p);
				if (!t) continue;
				if (SENTENCE_END.test(curText) || isNewBlock(t) || isNewBlock(curText)) {
					current = p; curText = t;
					continue;
				}
				const lastChar = curText.slice(-1);
				const firstChar = t[0] || "";
				if (lastChar === "-") stripTrailingHyphen(current);
				else if (/[a-zA-Z0-9]/.test(lastChar) && /[a-zA-Z0-9]/.test(firstChar)) current.appendChild(doc.createTextNode(" "));
				while (p.firstChild) current.appendChild(p.firstChild);
				p.parentNode.removeChild(p);
				curText = textOf(current);
				changed = true;
			}
			i = j;
		}
	};
	mergeWalk(body);
	return changed;
}
