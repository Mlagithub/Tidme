/*
widgets/pdfjs.ts — pdf.js CDN 按需加载器与浏览器适配

- Mozilla pdf.js（Apache-2.0）固定版本经 cdnjs 按需注入（不打包进插件，省 ~1.5MB）；
  加载失败（离线/无网）时 promise reject，调用方给出提示。
- 适配层：loadPdfBytes / extractOutlineNodes（outline → {title,page} 拍平前解析）/
  pageSize（scale1 原始尺寸）/ renderPageToCanvas（渲染并返回 viewport）/ pageTextItems（文本层数据）。
*/

const PDFJS_VERSION = '3.11.174';
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

let libOverride: any = null;

/** 注入外部 pdf.js 库（测试用：Node 侧 pdfjs-dist legacy 与 CDN 构建同 API） */
export function setPdfJsLib(lib: any): void {
  libOverride = lib;
}

let libPromise: Promise<any> | null = null;

/** 按需注入 pdf.js <script> 并配置 worker；全局只加载一次 */
export function ensurePdfJs(): Promise<any> {
  if (libOverride) return Promise.resolve(libOverride);
  const existing = (globalThis as any).pdfjsLib;
  if (existing) return Promise.resolve(existing);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onload = () => {
        const lib = (globalThis as any).pdfjsLib;
        if (!lib) {
          reject(new Error('pdf.js script loaded but pdfjsLib is undefined'));
          return;
        }
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        resolve(lib);
      };
      s.onerror = () => {
        libPromise = null;
        reject(new Error('Failed to load pdf.js (requires network access to cdnjs.cloudflare.com)'));
      };
      (document.head || document.body || document.documentElement).appendChild(s);
    });
  }
  return libPromise;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 → 字节（纯 JS：TW vm 沙箱无 atob/btoa 全局） */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let bits = 0;
  let acc = 0;
  let len = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '=') break;
    acc = (acc << 6) | B64_CHARS.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[len++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, len);
}

/** 字节 → base64（纯 JS，标准字母表 + padding） */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | ((b1 || 0) >> 4)];
    out += b1 === undefined ? '=' : B64_CHARS[((b1 & 15) << 2) | ((b2 || 0) >> 6)];
    out += b2 === undefined ? '=' : B64_CHARS[b2 & 63];
  }
  return out;
}

/** 字节 → pdf.js 文档对象。传副本：pdf.js 可能转移底层 buffer（detach），
 *  调用方（导入流程的 base64 编码）需要保留可用数据。 */
export async function loadPdfBytes(bytes: Uint8Array): Promise<any> {
  const lib = await ensurePdfJs();
  return lib.getDocument({ data: bytes.slice() }).promise;
}

/** dest（字符串命名目标或数组 [ref, {x,y}]）→ 页码（1 起）；无法解析返回 0 */
export async function resolveDestPage(pdf: any, dest: any): Promise<number> {
  try {
    let ref = dest;
    if (typeof dest === 'string') ref = await pdf.getDestination(dest);
    if (!Array.isArray(ref) || !ref.length) return 0;
    const pageIndex = await pdf.getPageIndex(ref[0]);
    return pageIndex + 1;
  } catch {
    return 0;
  }
}

/** pdf.js outline → 已解析页码的节点列表（嵌套拍平；未解析页码的项丢弃） */
export async function extractOutlineNodes(pdf: any): Promise<Array<{ title: string; page: number }>> {
  const raw = (await pdf.getOutline().catch(() => null)) || [];
  const resolved: Array<{ title: string; page: number }> = [];
  for (const it of raw) {
    const page = await resolveDestPage(pdf, it.dest);
    const title = String(it.title || '').trim();
    if (page >= 1 && title) resolved.push({ title, page });
    // 二级大纲极少用于切分（书内层级一至两层），不再递归以保确定性
  }
  return resolved;
}

/** 页面原始尺寸（scale=1 视口，缩放 fit 计算的基准） */
export async function pageSize(pdf: any, num: number): Promise<{ width: number; height: number }> {
  const page = await pdf.getPage(num);
  const vp = page.getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height };
}

/**
 * 渲染页到 canvas；返回渲染 viewport。
 * - 缺省 1.5× 渲染（旧调用兼容），像素即 CSS 尺寸
 * - opts { cssScale, dpr }：CSS 缩放 × 设备像素比渲染，canvas CSS 尺寸随之显式设置
 *   （cssScale 单位 = PDF scale1；文本层坐标同样处于渲染空间，除以 dpr 得 CSS 像素）
 * - 同一 canvas 的多次调用按序串行（pdf.js 禁止同一 canvas 并发 render；
 *   翻页与 ResizeObserver 的渲染请求可能重叠），过期调用由调用方按返回值取舍
 */
const canvasRenderChains = new WeakMap<object, Promise<any>>();

export function renderPageToCanvas(
  pdf: any,
  num: number,
  canvas: HTMLCanvasElement,
  opts: { cssScale?: number; dpr?: number } = {},
): Promise<any> {
  const prev = canvasRenderChains.get(canvas) || Promise.resolve();
  const task = prev.catch(() => {}).then(async () => {
    const page = await pdf.getPage(num);
    const dpr = Number(opts.dpr) > 0 ? Number(opts.dpr) : 1;
    const cssScale = Number(opts.cssScale) > 0 ? Number(opts.cssScale) : 1.5;
    const viewport = page.getViewport({ scale: cssScale * dpr });
    const ctx = canvas.getContext('2d');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    if (dpr !== 1) {
      canvas.style.width = `${canvas.width / dpr}px`;
      canvas.style.height = `${canvas.height / dpr}px`;
    } else {
      canvas.style.width = '';
      canvas.style.height = '';
    }
    await page.render({ canvasContext: ctx, viewport }).promise;
    return viewport;
  });
  canvasRenderChains.set(canvas, task);
  return task;
}

/** 页文本项（文本层数据；扫描页返回近空数组） */
export async function pageTextItems(pdf: any, num: number): Promise<any[]> {
  const page = await pdf.getPage(num);
  const tc = await page.getTextContent();
  return tc.items || [];
}

/** 文本项 → 文本层定位（左/顶/字号；需先 ensurePdfJs） */
export function itemStyle(viewport: any, item: any): { left: number; top: number; fontSize: number } {
  const lib = (globalThis as any).pdfjsLib;
  const m = lib.Util.transform(viewport.transform, item.transform);
  const fontSize = Math.hypot(m[2], m[3]);
  return { left: m[4], top: m[5] - fontSize, fontSize };
}
