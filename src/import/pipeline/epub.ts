/*
epub.ts — EPUB 解析（浏览器版）

与 D:\work\tidme-import\src\parse\epub.js 同构：
- jszip 以 TW library tiddler 引用（esbuild external，运行时 require）
- DOMParser/XMLSerializer 用浏览器原生实现
*/

declare function require(module: string): any;
// jszip 以 TW library tiddler 形式随插件分发；惰性 require 避免服务器端模块加载时执行
let _JSZip: any = null;
function JSZipLib(): any {
	if (!_JSZip) _JSZip = require("$:/plugins/tidme/import/jszip");
	return _JSZip;
}
import type { BookMeta } from "$:/plugins/tidme/core/ids";

const XHTML_TYPE = "application/xhtml+xml";

export function localName(node: any): string {
	return String((node && (node.localName || node.tagName)) || "").toLowerCase();
}

export function findNode(root: any, selectors: string[]): any {
	let node = root;
	for (const selector of selectors) {
		const children = node.childNodes || [];
		node = null;
		for (const child of Array.from(children)) {
			if (child.nodeType === 1 && localName(child) === selector.toLowerCase()) { node = child; break; }
		}
		if (!node) return null;
	}
	return node;
}

export function getText(node: any): string {
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

export function resolvePath(href: string, baseDir: string): string {
	if (!href) return href;
	if (/^[a-z]+:/i.test(href)) return href;
	href = href.replace(/^\.\//, "");
	if (href.startsWith("/")) return href.slice(1);
	return baseDir + href;
}

export function normalizePath(p: string): string {
	return String(p || "").replace(/^\.\//, "").replace(/\\/g, "/").split("#")[0];
}

export interface EpubBook {
	zip: any;
	meta: BookMeta;
	spine: { idref: string; href: string }[];
	ncxHref: string | null;
	navHref: string | null;
}

export async function readEpubBytes(bytes: ArrayBuffer | Uint8Array): Promise<EpubBook> {
	const zip = await JSZipLib().loadAsync(bytes);

	const containerFile = zip.file("META-INF/container.xml");
	if (!containerFile) throw new Error("不是有效的 EPUB：缺少 META-INF/container.xml");
	const containerDoc = new DOMParser().parseFromString(await containerFile.async("string"), "text/xml");
	const rootfile = findNode(containerDoc, ["container", "rootfiles", "rootfile"]);
	if (!rootfile) throw new Error("container.xml 中找不到 rootfile");
	const opfPath = rootfile.getAttribute("full-path");

	const opfDoc = new DOMParser().parseFromString(await zip.file(opfPath).async("string"), "text/xml");
	const opfDir = opfPath.replace(/[^/]*$/, "");

	const meta: BookMeta = {};
	const metaNode = findNode(opfDoc, ["package", "metadata"]);
	if (metaNode) {
		for (const child of Array.from(metaNode.childNodes || [])) {
			if (child.nodeType !== 1) continue;
			const n = localName(child);
			const val = String(child.textContent || "").trim();
			if (!val) continue;
			if (n === "title" && !meta.title) meta.title = val;
			else if (n === "creator" && !meta.creator) meta.creator = val;
			else if (n === "language" && !meta.language) meta.language = val;
			else if (n === "publisher" && !meta.publisher) meta.publisher = val;
			else if (n === "date" && !meta.date) meta.date = val;
		}
	}

	const manifest: Record<string, any> = {};
	const manifestNode = findNode(opfDoc, ["package", "manifest"]);
	if (manifestNode) {
		for (const child of Array.from(manifestNode.childNodes || [])) {
			if (child.nodeType !== 1 || localName(child) !== "item") continue;
			const id = child.getAttribute("id");
			manifest[id] = {
				id,
				href: resolvePath(child.getAttribute("href"), opfDir),
				mediaType: child.getAttribute("media-type") || "",
				properties: (child.getAttribute("properties") || "").split(/\s+/).filter(Boolean)
			};
		}
	}

	const spineNode = findNode(opfDoc, ["package", "spine"]);
	if (!spineNode) throw new Error("OPF 中没有 spine");
	const spine: EpubBook["spine"] = [];
	for (const child of Array.from(spineNode.childNodes || [])) {
		if (child.nodeType !== 1 || localName(child) !== "itemref") continue;
		const item = manifest[child.getAttribute("idref")];
		if (item && item.mediaType === XHTML_TYPE) spine.push({ idref: item.id, href: item.href });
	}

	let ncxHref: string | null = null;
	const tocId = spineNode.getAttribute("toc");
	if (tocId && manifest[tocId]) ncxHref = manifest[tocId].href;
	if (!ncxHref) for (const id in manifest) if (/\.ncx$/i.test(manifest[id].href)) ncxHref = manifest[id].href;
	let navHref: string | null = null;
	for (const id in manifest) if ((manifest[id].properties || []).includes("nav")) navHref = manifest[id].href;

	return { zip, meta, spine, ncxHref, navHref };
}

export interface NcxNode { text: string; href: string; frag: string; depth: number; children: NcxNode[] }

export async function extractNcxTree(book: EpubBook): Promise<NcxNode[]> {
	if (!book.ncxHref) return [];
	const doc = new DOMParser().parseFromString(await book.zip.file(book.ncxHref).async("string"), "text/xml");
	const navMap = findNode(doc, ["ncx", "navMap"]);
	if (!navMap) return [];
	const ncxDir = book.ncxHref.replace(/[^/]*$/, "");
	const visit = (parent: any, depth: number): NcxNode[] => {
		const out: NcxNode[] = [];
		for (const np of Array.from(parent.childNodes || [])) {
			if (np.nodeType !== 1 || localName(np) !== "navpoint") continue;
			const label = findNode(np, ["navLabel", "text"]);
			const content = findNode(np, ["content"]);
			let href = "";
			let frag = "";
			if (content) {
				const src = content.getAttribute("src") || "";
				const hashIdx = src.indexOf("#");
				href = resolvePath(hashIdx === -1 ? src : src.slice(0, hashIdx), ncxDir);
				frag = hashIdx === -1 ? "" : src.slice(hashIdx + 1);
			}
			out.push({
				text: label ? getText(label).replace(/\s+/g, " ").trim() : "",
				href,
				frag,
				depth,
				children: visit(np, depth + 1)
			});
		}
		return out;
	};
	return visit(navMap, 0);
}

/**
 * EPUB3 nav.xhtml 目录解析（与 NCX 同构输出 NcxNode 树）。
 * 定位 nav[epub:type="toc"]（回退 role="doc-toc" / 首个 nav），走 ol/li/a 结构。
 */
export async function extractNavTree(book: EpubBook): Promise<NcxNode[]> {
	if (!book.navHref) return [];
	const doc = new DOMParser().parseFromString(await book.zip.file(book.navHref).async("string"), "text/xml");
	const navDir = book.navHref.replace(/[^/]*$/, "");
	const navs = doc.getElementsByTagName("nav");
	let nav: any = null;
	for (const n of Array.from(navs)) {
		const type = n.getAttribute("epub:type") || "";
		const role = n.getAttribute("role") || "";
		if (type.includes("toc") || role === "doc-toc") { nav = n; break; }
	}
	if (!nav && navs.length) nav = navs[0];
	if (!nav) return [];
	const visit = (ol: any, depth: number): NcxNode[] => {
		const out: NcxNode[] = [];
		for (const li of Array.from(ol.childNodes || [])) {
			if (li.nodeType !== 1 || localName(li) !== "li") continue;
			const a = findNode(li, ["a"]) || findNode(li, ["span"]);
			const text = a ? getText(a).replace(/\s+/g, " ").trim() : "";
			const src = a ? a.getAttribute("href") || "" : "";
			const hashIdx = src.indexOf("#");
			const href = resolvePath(hashIdx === -1 ? src : src.slice(0, hashIdx), navDir);
			const frag = hashIdx === -1 ? "" : src.slice(hashIdx + 1);
			const childOl = findNode(li, ["ol"]);
			out.push({ text, href, frag, depth, children: childOl ? visit(childOl, depth + 1) : [] });
		}
		return out;
	};
	const ol = findNode(nav, ["ol"]);
	return ol ? visit(ol, 0) : [];
}

/** spine 序号 → NCX 祖先标题链；无匹配时继承前一文件（续章启发式） */
export function makeBreadcrumbResolver(ncxTree: NcxNode[], spine: EpubBook["spine"]): (i: number) => string[] {	const byHref = new Map<string, string[]>();
	const walk = (nodes: NcxNode[], trail: string[]) => {
		for (const n of nodes) {
			const path = [...trail, n.text].filter(Boolean);
			const key = normalizePath(n.href);
			if (key && !byHref.has(key)) byHref.set(key, path);
			walk(n.children || [], path);
		}
	};
	walk(ncxTree, []);
	const cache: (string[] | undefined)[] = [];
	let last: string[] = [];
	return (i: number) => {
		if (cache[i] !== undefined) return cache[i] as string[];
		const key = normalizePath(spine[i]?.href || "");
		const found = byHref.get(key);
		const result = found ? found.slice() : last.slice();
		last = result;
		cache[i] = result;
		return result;
	};
}

export interface NavEntry { title: string; href: string; frag: string; depth: number }

/** 展平 NCX（文档顺序），保留深度与锚点 */
export function flattenNcx(tree: NcxNode[]): NavEntry[] {
	const out: NavEntry[] = [];
	const walk = (nodes: NcxNode[]) => {
		for (const n of nodes) {
			out.push({ title: n.text, href: n.href, frag: n.frag, depth: n.depth });
			walk(n.children || []);
		}
	};
	walk(tree);
	return out;
}

/**
 * 把某文件命中的 NCX 锚点映射为块序号：
 * getElementById(frag) → 沿祖先链上溯直到命中某个已收集块。
 * 返回按块序排序的 [{ idx, entry }]，供注入合成标题。
 */
export function anchorBoundaries(
	doc: Document,
	blocks: Block[],
	entries: NavEntry[]
): { idx: number; entry: NavEntry }[] {
	const byEl = new Map<any, number>();
	blocks.forEach((b, i) => { if (b.el) byEl.set(b.el, i); });
	const out: { idx: number; entry: NavEntry }[] = [];
	if (!entries.length || !blocks.length) return out;
	for (const entry of entries) {
		if (!entry.frag) continue;
		let el: any = null;
		try { el = doc.getElementById(entry.frag); } catch { /* ignore */ }
		if (!el) continue;
		let cur: any = el;
		while (cur && !byEl.has(cur)) cur = cur.parentNode;
		const idx = cur ? byEl.get(cur) : undefined;
		if (idx !== undefined && !out.some((o) => o.idx === idx)) {
			out.push({ idx, entry });
		}
	}
	out.sort((a, b) => a.idx - b.idx);
	return out;
}

export interface Block {
	el?: any;
	text: string;
	tag: string;
	isHeading: boolean;
	level: number;
	virtualHtml?: string;
	/** 原子块：超长也不切分（围栏代码、表格等），计数为 oversize 警告 */
	atomic?: boolean;
}

const BLOCK_TAGS = new Set([
	"div", "p", "h1", "h2", "h3", "h4", "h5", "h6",
	"li", "blockquote", "td", "th", "dt", "dd", "figcaption", "caption", "pre"
]);

/** 叶子块级元素（“行”模型）；须在 smartMerge 之后调用 */
export function collectBlocks(doc: Document): Block[] {
	const rows: Block[] = [];
	const body = doc.getElementsByTagName("body")[0] || doc.documentElement;
	if (!body) return rows;
	const walk = (parent: any) => {
		for (const child of Array.from(parent.childNodes || [])) {
			if (child.nodeType !== 1) continue;
			const local = localName(child);
			if (!BLOCK_TAGS.has(local)) continue;
			const hasBlockChild = Array.from(child.childNodes as any[]).some(
				(c: any) => c.nodeType === 1 && BLOCK_TAGS.has(localName(c))
			);
			const text = getText(child).replace(/\s+/g, " ").trim();
			const isHeading = /^h[1-6]$/.test(local);
			if (!hasBlockChild && text) {
				rows.push({ el: child, text, tag: local, isHeading, level: isHeading ? parseInt(local[1], 10) : 0 });
			}
			walk(child);
		}
	};
	walk(body);
	return rows;
}
