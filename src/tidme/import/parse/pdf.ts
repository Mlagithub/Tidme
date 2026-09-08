/*
pdf.ts — PDF 导入纯逻辑（大纲切分 / 扫描页判定 / LLM-OCR 请求构建）

- 本模块零依赖（不 require、不碰 DOM/pdf.js）：pdf.js 浏览器适配在
  import/widgets/pdfjs.ts，落库在 core/pdf-ops.ts，阅读器在 read/widgets/pdf-reader.ts。
- 大纲切分：normalizeOutline 把 pdf.js outline（title/dest/嵌套 items）拍平为
  {title, page}（page 由调用方注入 resolvePage 回调解析），splitByOutline 按页码升序
  生成「起始页-结束页」区间，同页起点的后续项折叠。
*/

export interface PdfOutlineNode {
  title: string;
  page: number;
}

export interface PdfSectionRange {
  title: string;
  startPage: number;
  endPage: number;
}

/** tiddler title 非法字符（\ / : * ? " < > |）清理——节卡标题清洁（保留可读性，非 slug） */
export function sanitizeLeaf(raw: string): string {
  return String(raw || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * pdf.js outline → 拍平的 {title, page} 列表。
 * resolvePage(dest) 由调用方注入（dest 解析需要 getDestination/getPageIndex，异步）；
 * 解析失败（返回 <1）的项跳过；嵌套 items 递归展开。
 */
export function normalizeOutline(raw: any[], resolvePage: (dest: any) => number): PdfOutlineNode[] {
  const out: PdfOutlineNode[] = [];
  const walk = (items: any[]) => {
    for (const it of items || []) {
      const page = Number(resolvePage(it.dest)) || 0;
      const title = sanitizeLeaf(it.title);
      if (page >= 1 && title) out.push({ title, page });
      if (Array.isArray(it.items) && it.items.length) walk(it.items);
    }
  };
  walk(raw);
  return out.sort((a, b) => a.page - b.page);
}

/**
 * 按大纲切分：第 i 节 = [node[i].page, node[i+1].page - 1]（末节到 pageCount）。
 * 同页起点的后续节点折叠（保留首个）；越界节点跳过；nodes 为空返回 []（调用方走「不切分」）。
 */
export function splitByOutline(nodes: PdfOutlineNode[], pageCount: number): PdfSectionRange[] {
  const sorted = [...(nodes || [])].sort((a, b) => a.page - b.page || (a.title < b.title ? -1 : 1));
  const sections: PdfSectionRange[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    if (node.page < 1 || node.page > pageCount) continue;
    if (i > 0 && node.page === sorted[i - 1].page) continue; // 同页折叠
    const nextPage = i + 1 < sorted.length ? sorted[i + 1].page : pageCount + 1;
    const endPage = Math.max(node.page, Math.min(nextPage - 1, pageCount));
    sections.push({ title: node.title, startPage: node.page, endPage });
  }
  return sections;
}

/** 不切分：整本一节（1..pageCount） */
export function singleSection(pageCount: number): PdfSectionRange[] {
  return pageCount >= 1 ? [{ title: '全文', startPage: 1, endPage: pageCount }] : [];
}

/** 扫描页判定：可提取文本过短（阈值 32 字符）视为扫描/图片页，需要 OCR */
export function isScannedPageText(text: string): boolean {
  return String(text || '').trim().length < 32;
}

/** tidme.pages 字段（"起-止"）解析；无值 = 整本（end 0 表示不限） */
export function parsePagesField(v: string): { start: number; end: number } {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(v || ''));
  if (m) return { start: Math.max(1, Number(m[1])), end: Math.max(Number(m[2]), Number(m[1])) };
  return { start: 1, end: 0 };
}

export interface OcrConfig {
  enable?: boolean;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * LLM-OCR 请求构建（OpenAI 兼容 chat/completions，视觉模型）：
 * 页面渲染为 PNG（base64）后忠实转写为 Markdown——保留原文语言与措辞，不翻译不总结。
 */
export function buildOcrRequest(
  cfg: OcrConfig,
  imageB64: string,
  pageLabel: string,
): { url: string; headers: Record<string, string>; body: string } {
  const base = String(cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = String(cfg.model || 'gpt-4o-mini');
  const prompt = `你是 OCR 引擎。请把这一页（${pageLabel}）的内容忠实转写为 Markdown：` +
    `保留原文语言与原文措辞（不要翻译、不要总结、不要补充），标题用 # 层级，列表/表格/公式尽量保留结构。只输出转写结果。`;
  const body = JSON.stringify({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0,
  });
  return {
    url: `${base}/chat/completions`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${String(cfg.apiKey || '')}` },
    body,
  };
}

/** OCR 响应解析：取 choices[0].message.content；结构缺失返回空串（调用方提示失败） */
export function parseOcrResponse(json: any): string {
  try {
    return String(json?.choices?.[0]?.message?.content || '').trim();
  } catch {
    return '';
  }
}

/** OCR 转写结果 tiddler（每页一个；文档页标题作前缀，清理阅读材料时级联删除） */
export function ocrTiddlerTitle(docPageTitle: string, page: number): string {
  const prefix = String(docPageTitle || '').trim() || 'Tidme/Books/Unknown';
  return `${prefix}/ocr-p${page}`;
}
