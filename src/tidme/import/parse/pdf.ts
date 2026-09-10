/*
pdf.ts — PDF 导入纯逻辑（扫描页判定 / 续读点页码解析 / LLM-OCR 请求构建）

- 本模块零依赖（不 require、不碰 DOM/pdf.js）：pdf.js 浏览器适配在
  import/widgets/pdfjs.ts，落库在 core/pdf-ops.ts，阅读器在 read/widgets/pdf-reader.ts。
- PDF 不再切分节卡：导入即整本一张阅读卡，阅读位置由续读点绝对页码表达。
  parsePagesField 仅用于兼容存量书籍的 tidme.pages 字段（阅读器区间解析）。
*/

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
  const prefix = String(docPageTitle || '').trim() || 'Tidme/Docs/Unknown';
  return `${prefix}/ocr-p${page}`;
}
