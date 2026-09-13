/*
pdf-view.ts — PDF 阅读器视图模式纯逻辑（仿桌面阅读器的「页面布局 × 滚动方式」视图菜单）

- 布局（layout）：single 单页 / dual 双页（1-2, 3-4…成对）/ book 书籍（首页独占封面，其后 2-3, 4-5…成对）
- 滚动（scroll）：page 页面（只看当前单元，翻单元切换）/ vertical 垂直 / horizontal 水平 /
  wrapped 平铺（单元横向排列换行成网格）/ infinite 无限（无视成对布局的单页连续长条）
- 单元（unit）= 滚动与配对的最小渲染组：infinite 恒单页；dual/book 双页；single 单页。
  页码 state / 续读点一律记录单元首页（单元内可指向任一成员页，导航后归一到首页）
- 仅 read/widgets/pdf-reader.ts 使用，相对 import 随 widget 内联（同 pdf-zoom.ts）
- scale 单位 = pdf.js viewport scale（1 = 页面 1pt → 1px CSS），与 pdf-zoom 一致
*/

// 显式 .ts 后缀：本模块被单测直 import（Node 类型剥离不做无后缀解析）；esbuild 按解析路径去重
import * as zoom from './pdf-zoom.ts';

export type PdfLayout = 'single' | 'dual' | 'book';
export type PdfScroll = 'page' | 'vertical' | 'horizontal' | 'wrapped' | 'infinite';

/** 双页单元内两页的间距（px）；fit 计算需把间距计入单元总宽 */
export const SPREAD_GAP = 12;

const LAYOUTS: ReadonlySet<string> = new Set(['single', 'dual', 'book']);
const SCROLLS: ReadonlySet<string> = new Set(['page', 'vertical', 'horizontal', 'wrapped', 'infinite']);

export function parseLayout(v: unknown): PdfLayout {
  return typeof v === 'string' && LAYOUTS.has(v) ? (v as PdfLayout) : 'single';
}

export function parseScroll(v: unknown): PdfScroll {
  return typeof v === 'string' && SCROLLS.has(v) ? (v as PdfScroll) : 'page';
}

/** 视图状态持久化文本（$:/state/tidme-pdf/view，全局共享：{l 布局, s 滚动, z 缩放}） */
export function viewStateText(layout: PdfLayout, scroll: PdfScroll, zoomMode: zoom.ZoomMode): string {
  return JSON.stringify({ l: layout, s: scroll, z: zoomMode });
}

/** 持久化文本 → 视图状态；非法 JSON / 非法字段逐项回退默认（布局 single、滚动 page、缩放 fit-page） */
export function parseViewState(text: string): { layout: PdfLayout; scroll: PdfScroll; zoom: zoom.ZoomMode } {
  let layout: PdfLayout = 'single';
  let scroll: PdfScroll = 'page';
  let zoomMode: zoom.ZoomMode = 'fit-page';
  try {
    const o = JSON.parse(String(text || ''));
    if (o && typeof o === 'object') {
      layout = parseLayout(o.l);
      scroll = parseScroll(o.s);
      const z = o.z;
      if (z === 'auto' || z === 'fit-page' || z === 'fit-width' || z === 'actual') zoomMode = z;
      else if (typeof z === 'number' && Number.isFinite(z) && z > 0) zoomMode = z;
    }
  } catch (_) {
    /* 损坏/缺失 → 全默认 */
  }
  return { layout, scroll, zoom: zoomMode };
}

/** 渲染单元的页数：infinite 恒单页（无视成对布局）；dual/book 双页；single 单页 */
export function unitSize(layout: PdfLayout, scroll: PdfScroll): number {
  return scroll === 'infinite' || layout === 'single' ? 1 : 2;
}

/** 单元总数（numPages 非法按 1） */
export function unitCount(numPages: number, layout: PdfLayout, scroll: PdfScroll): number {
  const n = Math.max(1, Math.floor(numPages) || 1);
  if (unitSize(layout, scroll) === 1) return n;
  if (layout === 'book') return 1 + Math.ceil((n - 1) / 2);
  return Math.ceil(n / 2);
}

/** 页码所在单元的成员页（升序，越界裁剪；页码非法回 [1]）。
 *  dual：[1,2],[3,4]…；book：[1],[2,3],[4,5]…（封面后的对从偶数页起）；单页单元：[p] */
export function unitOf(page: number, layout: PdfLayout, scroll: PdfScroll, numPages: number): number[] {
  const n = Math.max(1, Math.floor(numPages) || 1);
  const p = Math.min(Math.max(1, Math.floor(page) || 1), n);
  if (unitSize(layout, scroll) === 1) return [p];
  if (layout === 'book' && p === 1) return [1];
  const left = layout === 'book' ? (p % 2 === 0 ? p : p - 1) : p % 2 === 1 ? p : p - 1;
  const right = Math.min(left + 1, n);
  return right > left ? [left, right] : [left];
}

/** 单元序号（0 基）→ 单元首页；越界收敛到端点单元 */
export function unitStartByIndex(index: number, layout: PdfLayout, scroll: PdfScroll, numPages: number): number {
  const n = Math.max(1, Math.floor(numPages) || 1);
  const count = unitCount(n, layout, scroll);
  const i = Math.min(Math.max(0, Math.floor(index) || 0), count - 1);
  if (unitSize(layout, scroll) === 1) return i + 1;
  if (layout === 'book') return i === 0 ? 1 : Math.min(2 * i, n);
  return Math.min(2 * i + 1, n);
}

/** 页码所在单元的首页（页码 state / 续读点的记录口径） */
export function unitStart(page: number, layout: PdfLayout, scroll: PdfScroll, numPages: number): number {
  return unitOf(page, layout, scroll, numPages)[0];
}

/** 页码所在单元的序号（0 基） */
export function unitIndexOf(page: number, layout: PdfLayout, scroll: PdfScroll, numPages: number): number {
  const start = unitStart(page, layout, scroll, numPages);
  if (unitSize(layout, scroll) === 1) return start - 1;
  if (layout === 'book') return start === 1 ? 0 : 1 + (start - 2) / 2;
  return (start - 1) / 2;
}

/** 翻单元导航：dir=1 下一单元 / -1 上一单元，返回目标单元首页；端点收敛。
 *  页数未知（加载中）时按单元页数就近步进，不回起点（与逐页翻页的旧行为一致） */
export function unitStep(page: number, layout: PdfLayout, scroll: PdfScroll, dir: 1 | -1, numPages: number): number {
  const size = unitSize(layout, scroll);
  if (!numPages || numPages < 1) {
    return Math.max(1, (Math.floor(page) || 1) + dir * size);
  }
  const count = unitCount(numPages, layout, scroll);
  const i = Math.min(Math.max(0, unitIndexOf(page, layout, scroll, numPages) + dir), count - 1);
  return unitStartByIndex(i, layout, scroll, numPages);
}

/**
 * 视图感知缩放：把布局/滚动方式折算成「单元整体」的 fit 约束后委托 pdf-zoom.resolveScale。
 * - 垂直族（page/vertical/infinite）：单元受容器宽高约束
 * - wrapped：单元按一行两个的名义列宽约束（具体换行列数由容器宽度自然涌现）
 * - horizontal：沿水平滚动，fit 只受高度约束（fit-page 额外不超宽，避免单页横向溢出视口）
 */
export function resolveViewScale(
  mode: zoom.ZoomMode,
  pw0: number,
  ph0: number,
  availW: number,
  availH: number,
  layout: PdfLayout,
  scroll: PdfScroll,
  gap: number = SPREAD_GAP,
): number {
  const n = unitSize(layout, scroll);
  const spreadW0 = pw0 * n + gap * (n - 1);
  if (scroll === 'wrapped') {
    const unitW = Math.max(120, availW / 2 - gap);
    return zoom.resolveScale(mode, spreadW0, ph0, unitW, availH);
  }
  if (scroll === 'horizontal') {
    const hFit = zoom.clampScale(availH / ph0);
    if (mode === 'fit-width') return hFit;
    if (mode === 'auto') return Math.min(hFit, 1);
    return Math.min(hFit, zoom.clampScale(availW / spreadW0));
  }
  return zoom.resolveScale(mode, spreadW0, ph0, availW, availH);
}
