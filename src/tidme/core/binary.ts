/*
core/binary.ts — 字节/编码纯工具（base64 编解码唯一实现）

- bytesToBase64 / base64ToBytes：纯 JS 实现（TW vm 沙箱无 atob/btoa 全局）。
  解码侧是**唯一**入口：容忍 dataURL 前缀、MIME 折行空白与 URL-safe 字母表，
  拒绝字母表外字符（静默丢字节会让损坏数据一路落到下游报"格式非法"，无从定位）
- bytesToBase64Async：大文件分片异步版。同步循环编码数十 MB 会冻结 UI 数秒，
  让用户误以为失败；按时间切片让出主线程驱动进度条
- base64RoundtripValid：回程完整性校验。空/损坏 base64 经同步层落到服务端
  即 0 字节 .pdf，重载后数据不可恢复——入库前必须校验

纯函数、无 DOM、双端可用（浏览器 / Node 直测 / TW vm 沙箱）。
*/

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 归一化 base64 文本：去 dataURL 前缀 → 去空白折行 → URL-safe 字母表转标准。
 * 返回 null = 含字母表外字符（调用方决定拒绝方式，本函数不猜）。
 */
function normalizeBase64(input: string): string | null {
  let s = String(input || '').trim();
  const comma = s.indexOf(',');
  if (comma !== -1 && /^data:/i.test(s)) s = s.slice(comma + 1);
  s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  return /^[A-Za-z0-9+/=]*$/.test(s) ? s : null;
}

/**
 * base64 → 字节（唯一解码入口）。输入可为标准或 URL-safe 字母表（`-`/`_`，
 * 部分 PDF/接口返回后者）、可带 `data:...;base64,` 前缀与换行折行。
 * 含字母表外字符 → 抛错（不静默丢弃，否则损坏数据变成"少几个字节的 PDF"）。
 * 返回**独立** Uint8Array（length 即真实字节数，不复用内部 buffer 余量）。
 */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = normalizeBase64(b64);
  if (clean === null) throw new Error('base64 输入含字母表外字符');
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
  return out.slice(0, len);
}

/** 字节 → base64（标准字母表 + padding）。大文件请用 bytesToBase64Async */
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

/** 让出主线程一帧，让浏览器有机会重绘进度条（setTimeout(0) 浏览器/Node 均可用） */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 让帧间隔：工作切片超过该毫秒数才让出一帧。粒度过细会被浏览器嵌套
 *  setTimeout 的 ~4ms 钳制放大总耗时（50MB ≈ 1000 片 ≈ +4s），按时间切片
 *  既保住 UI 响应又不放大总时长。 */
const YIELD_INTERVAL_MS = 24;

/** 字节 → base64（分片异步版）：分片大小取 3 的倍数保证跨片无 padding 歧义
 *  （仅末片可出现 '='）；进度回调（done/total，字节数）逐片回报。 */
export async function bytesToBase64Async(
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const total = bytes.length;
  const parts: string[] = [];
  const slice = 3 * 0x4000; // 49152 字节/片
  let lastYield = Date.now();
  for (let i = 0; i < total; i += slice) {
    const end = Math.min(i + slice, total);
    parts.push(bytesToBase64(bytes.subarray(i, end)));
    onProgress?.(end, total);
    if (end < total && Date.now() - lastYield >= YIELD_INTERVAL_MS) {
      await yieldToUi();
      lastYield = Date.now();
    }
  }
  return parts.join('');
}

/** 回程完整性校验：base64 解码字节数必须与原字节一致（空/损坏/含非法字符 → false，拒绝入库） */
export function base64RoundtripValid(dataB64: string, byteLength: number): boolean {
  try {
    return base64ToBytes(dataB64).length === byteLength;
  } catch {
    return false;
  }
}
