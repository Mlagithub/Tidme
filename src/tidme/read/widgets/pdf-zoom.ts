/*
pdf-zoom.ts — PDF 阅读器缩放纯逻辑（仿桌面阅读器的「适合页面/适合宽度/实际大小 + 档位步进」）

- 仅 read/widgets/pdf-reader.ts 使用，相对 import 随 widget 内联（editor/* 同款私有实现例外）
- scale 单位 = pdf.js viewport scale（1 = 页面 1pt → 1px CSS），百分比展示 = scale × 100
*/

export type ZoomFit = 'fit-page' | 'fit-width' | 'actual';
/** number = 固定缩放档（相对 scale1 的比例） */
export type ZoomMode = ZoomFit | number;

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;
/** ±/下拉共用档位（避免 1.2 连乘出现 113% 这类难读数值） */
export const ZOOM_LADDER = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export function clampScale(s: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(s) || 1));
}

/** 模式 → 实际 scale：数字档原样（clamp）；fit-page 宽高同受约束（取小）；fit-width 只受宽；actual = 1 */
export function resolveScale(mode: ZoomMode, pw: number, ph: number, cw: number, ch: number): number {
  if (typeof mode === 'number') return clampScale(mode);
  if (mode === 'actual') return 1;
  if (mode === 'fit-width') return clampScale(cw / pw);
  return clampScale(Math.min(cw / pw, ch / ph));
}

/** 当前 scale 基础上取上/下一档（dir: 1 放大 / -1 缩小）；已到端点返回端点档 */
export function stepLadder(current: number, dir: 1 | -1): number {
  const s = clampScale(current);
  if (dir === 1) {
    return ZOOM_LADDER.find((v) => v > s + 1e-6) ?? ZOOM_MAX;
  }
  for (let i = ZOOM_LADDER.length - 1; i >= 0; i--) {
    if (ZOOM_LADDER[i] < s - 1e-6) return ZOOM_LADDER[i];
  }
  return ZOOM_MIN;
}

/** 下拉的百分比选项（value = scale 字符串，与 ZOOM_LADDER 一致） */
export function ladderOptions(): Array<{ value: string; label: string }> {
  return ZOOM_LADDER.map((v) => ({ value: String(v), label: `${Math.round(v * 100)}%` }));
}
