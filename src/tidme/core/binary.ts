/*
core/binary.ts — 字节/编码纯工具（base64 编解码唯一实现）

- bytesToBase64 / base64ToBytes：纯 JS 实现（TW vm 沙箱无 atob/btoa 全局）
- bytesToBase64Async：大文件分片异步版。同步循环编码数十 MB 会冻结 UI 数秒，
  让用户误以为失败；按时间切片让出主线程驱动进度条
- base64RoundtripValid：回程完整性校验。空/损坏 base64 经同步层落到服务端
  即 0 字节 .pdf，重载后数据不可恢复——入库前必须校验

纯函数、无 DOM、双端可用（浏览器 / Node 直测 / TW vm 沙箱）。
*/

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 → 字节（忽略字母表外字符，'=' 截断 padding） */
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

/** 回程完整性校验：base64 解码字节数必须与原字节一致（空/损坏 → false，拒绝入库） */
export function base64RoundtripValid(dataB64: string, byteLength: number): boolean {
  return base64ToBytes(dataB64).length === byteLength;
}
