/*
epub.ts — EPUB 解析（格式层委托 foliate-js，本模块只做内容层）

分工边界（解耦声明）：
- foliate-js（MIT，npm: foliate-js）负责「格式层」：container/OPF/spine/manifest 解析、
  EPUB3 nav 与 EPUB2 NCX 目录（自动回退）、URI 解码与相对路径解析（百分比编码的目录
  href 会被 decodeURI 还原成 zip 条目名）、加密字体识别——经 Foliate/Readest/Koodo
  等阅读器的海量真实书籍打磨，edge case 不再由本插件自己踩。
- 本插件负责「内容层」：叶子块收集（collectBlocks）、锚点边界注入、切分（chunker）——
  这是增量阅读领域自己的任务，不下沉到通用阅读库。
loader 契约：foliate 通过 { loadText, loadBlob, getSize } 取文件，入参是「EPUB 根相对
路径」（内部已按 OPF/nav 位置解析并解码）；jszip 适配十余行。loadBlob 仅加密字体
反混淆用，纯文本解析路径可不实现。

历史教训（collectBlocks 下钻缺陷，2026-09 修复）：progit.epub（Asciidoctor 生成，
body > section epub:type=chapter 包装）曾整本导入 0 节卡且静默——遍历只在命中
BLOCK_TAGS 时下钻，section/article/main 等包装标签的子树从未被访问。
*/

// vendored foliate-js（MIT）：相对导入绕开 packup 旧版 esbuild 的 exports 通配符解析缺陷
import type { DocMeta } from '$:/plugins/keepone/tidme/core/ids';
import { EPUB } from './vendor/foliate/epub.js';

declare function require(module: string): any;
// jszip 以 TW library tiddler 形式随插件分发；惰性 require 避免服务器端模块加载时执行
let _JSZip: any = null;
function JSZipLib(): any {
  if (!_JSZip) _JSZip = require('$:/plugins/keepone/tidme/import/jszip');
  return _JSZip;
}

export function localName(node: any): string {
  return String((node && (node.localName || node.tagName)) || '').toLowerCase();
}

export function getText(node: any): string {
  let out = '';
  const walk = (n: any) => {
    for (const c of Array.from(n.childNodes || [])) {
      if (c.nodeType === 3) out += c.nodeValue || '';
      else if (c.nodeType === 1) walk(c);
    }
  };
  walk(node);
  return out;
}

export function normalizePath(p: string): string {
  return String(p || '').replace(/^\.\//, '').replace(/\\/g, '/').split('#')[0];
}

export interface EpubBook {
  /** 归一化字符串元数据（title/creator/language/publisher/date） */
  meta: DocMeta;
  /** spine 顺序（href = foliate 解析后的 EPUB 根相对路径，与 zip 条目名一致） */
  spine: { idref: string; href: string }[];
  /** 目录树（foliate 合并 nav/NCX 的结果；href 已解码，可能含外部链接） */
  toc: NcxNode[];
  /** 装载第 i 个 spine 文档（foliate 按 manifest mediaType 解析；XML 错误抛异常，不再静默） */
  loadDocumentAt(i: number): Promise<Document | null>;
}

/** 元数据值归一化：foliate 可能给 string 或 {value, language} 地图 */
function metaStr(v: any): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && typeof v.value === 'string') return v.value.trim();
  return '';
}

function tocToNodes(items: any[] | null | undefined, depth = 0): NcxNode[] {
  const out: NcxNode[] = [];
  for (const it of items || []) {
    const href = String(it?.href || '');
    const hash = href.indexOf('#');
    const text = String(it?.label || '').replace(/\s+/g, ' ').trim();
    if (!href && !text) continue;
    out.push({
      text,
      href: hash === -1 ? href : href.slice(0, hash),
      frag: hash === -1 ? '' : href.slice(hash + 1),
      depth,
      children: tocToNodes(it?.subitems, depth + 1),
    });
  }
  return out;
}

export async function readEpubBytes(bytes: ArrayBuffer | Uint8Array): Promise<EpubBook> {
  const zip = await JSZipLib().loadAsync(bytes);
  const fileOf = (name: string) => (name ? zip.file(name) : null);
  const epub = new EPUB({
    loadText: async (name: string) => {
      const f = fileOf(name);
      return f ? await f.async('string') : null;
    },
    // 仅加密字体反混淆需要；文本解析不取 Blob，返回 null 让 foliate 走无字体解码路径
    loadBlob: async (name: string) => {
      const f = fileOf(name);
      return f ? await f.async('blob') : null;
    },
    getSize: () => 0,
  });
  await epub.init();

  const meta: DocMeta = {};
  const m = (epub as any).metadata || {};
  if (metaStr(m.title)) meta.title = metaStr(m.title);
  const creator = Array.isArray(m.author) ? m.author[0] : m.author ?? m.creator;
  if (metaStr(creator)) meta.creator = metaStr(creator);
  const language = Array.isArray(m.language) ? m.language[0] : m.language;
  if (metaStr(language)) meta.language = metaStr(language);
  if (metaStr(m.publisher)) meta.publisher = metaStr(m.publisher);
  if (metaStr(m.date)) meta.date = metaStr(m.date);

  return {
    meta,
    // section.id = manifest item 的 href（foliate 解析后的根相对路径）
    spine: (epub.sections || []).map((s: any) => ({ idref: s.id, href: s.id })),
    toc: tocToNodes((epub as any).toc),
    loadDocumentAt: async (i: number) => {
      const s = (epub as any).sections?.[i];
      if (!s) return null;
      const doc = await s.createDocument();
      // 不用 instanceof Document：无头测试环境（jsdom 注入）未必暴露 Document 全局
      return doc && typeof doc.getElementsByTagName === 'function' ? doc : null;
    },
  };
}

export interface NcxNode {
  text: string;
  href: string;
  frag: string;
  depth: number;
  children: NcxNode[];
}

/** spine 序号 → 目录祖先标题链；无匹配时继承前一文件（续章启发式） */
export function makeBreadcrumbResolver(ncxTree: NcxNode[], spine: EpubBook['spine']): (i: number) => string[] {
  const byHref = new Map<string, string[]>();
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
    const key = normalizePath(spine[i]?.href || '');
    const found = byHref.get(key);
    const result = found ? found.slice() : last.slice();
    last = result;
    cache[i] = result;
    return result;
  };
}

export interface NavEntry {
  title: string;
  href: string;
  frag: string;
  depth: number;
}

/** 展平目录树（文档顺序），保留深度与锚点 */
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
 * 把某文件命中的目录锚点映射为块序号：
 * getElementById(frag) → 沿祖先链上溯直到命中某个已收集块。
 * 返回按块序排序的 [{ idx, entry }]，供注入合成标题。
 */
export function anchorBoundaries(
  doc: Document,
  blocks: Block[],
  entries: NavEntry[],
): { idx: number; entry: NavEntry }[] {
  const byEl = new Map<any, number>();
  blocks.forEach((b, i) => {
    if (b.el) byEl.set(b.el, i);
  });
  const out: { idx: number; entry: NavEntry }[] = [];
  if (!entries.length || !blocks.length) return out;
  for (const entry of entries) {
    if (!entry.frag) continue;
    let el: any = null;
    try {
      el = doc.getElementById(entry.frag);
    } catch { /* ignore */ }
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
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'td',
  'th',
  'dt',
  'dd',
  'figcaption',
  'caption',
  'pre',
]);

/** 既不收集也不下钻的元素（脚本/样式/向量图对文本切分无意义） */
const SKIP_TAGS = new Set(['script', 'style', 'svg', 'head', 'template']);

/** 块候选内部是否还有块级后代（非块包装标签视为透明，逐层看进去）——
 *  否则 <div><section><p>…</p></section></div> 会把 div 整体记一块、
 *  下钻后又记 p 一块，内容重复收集 */
function hasBlockDescendant(el: any, depth = 0): boolean {
  if (depth > 12) return true; // 超深树防御：视为有块后代，走整体收集
  for (const c of Array.from(el.childNodes || [])) {
    if (c.nodeType !== 1) continue;
    if (BLOCK_TAGS.has(localName(c))) return true;
    if (hasBlockDescendant(c, depth + 1)) return true;
  }
  return false;
}

/** 叶子块级元素（“行”模型）；须在 smartMerge 之后调用。
 *  遍历对**任意**元素下钻（script/style/svg 除外），只在 BLOCK_TAGS 命中时收集——
 *  section/article/main 等 EPUB 语义包装标签是透传层，不是内容边界（progit 缺陷根因） */
export function collectBlocks(doc: Document): Block[] {
  const rows: Block[] = [];
  const body = doc.getElementsByTagName('body')[0] || doc.documentElement;
  if (!body) return rows;
  const walk = (parent: any) => {
    for (const child of Array.from(parent.childNodes || [])) {
      if (child.nodeType !== 1) continue;
      const local = localName(child);
      if (SKIP_TAGS.has(local)) continue;
      if (!BLOCK_TAGS.has(local)) {
        walk(child);
        continue;
      }
      const hasBlockChild = hasBlockDescendant(child);
      const text = getText(child).replace(/\s+/g, ' ').trim();
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
