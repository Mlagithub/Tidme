/*
ids.ts — 确定性 ID 与内容指纹（双端：浏览器 WebCrypto / Node / TW 服务端 vm 沙箱）

纯函数、无副作用。
本模块被 node 测试直接 import，禁用 require；仅 ES 引零依赖的 core/ns 常量。
*/

import { CRUMB_SEP } from './ns.ts';

/** 文档元信息（EPUB/PDF/Markdown 导入的公共字段；docId 由 title+creator+language 派生） */
export interface DocMeta {
  title?: string;
  creator?: string;
  language?: string;
  publisher?: string;
  date?: string;
}

let _encoder: { encode(s: string): Uint8Array } | null = null;
function getEncoder(): { encode(s: string): Uint8Array } {
  if (_encoder) return _encoder;
  if (typeof TextEncoder !== 'undefined') {
    _encoder = new TextEncoder();
    return _encoder;
  }
  // TW 服务端 vm 沙箱无 TextEncoder：用沙箱提供的 Buffer
  const buf: any = typeof Buffer !== 'undefined' ? Buffer : null;
  if (buf) {
    _encoder = { encode: (s: string) => new Uint8Array(buf.from(s, 'utf8')) };
    return _encoder;
  }
  throw new Error('TextEncoder 不可用');
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return subtle;
  // TW 服务端模块运行在 vm 沙箱：globalThis.crypto/process 均不可见，但裸 process 可用
  let proc: any;
  try {
    proc = typeof process !== 'undefined' ? process : undefined;
  } catch {
    proc = undefined;
  }
  if (proc && typeof proc.getBuiltinModule === 'function') {
    const nodeCrypto = proc.getBuiltinModule('node:crypto');
    if (nodeCrypto?.webcrypto?.subtle) return nodeCrypto.webcrypto.subtle;
  }
  throw new Error('crypto.subtle 不可用（需要浏览器或 Node >= 19）');
}

/** 纯 JS SHA-256（FIPS 180-4）。兜底场景：局域网 **HTTP 页面是不安全上下文**，
 *  浏览器的 crypto.subtle 直接为 undefined（crypto.subtle 不可用 报错的真身），
 *  TW 服务端 vm 沙箱同理；两者拿不到 WebCrypto 时用本实现，摘要字节与 WebCrypto
 *  完全一致 → docId/sectionId 跨环境稳定（同一本书 HTTPS 导入与 HTTP 再导入同 ID）。 */
const SHA256_K = new Uint32Array([
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
]);

export function sha256HexBytes(bytes: Uint8Array): string {
  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;
  const l = bytes.length;
  const total = (l + 9 + 63) & ~63;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(l / 0x20000000));
  dv.setUint32(total - 4, (l << 3) >>> 0);
  const h = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) out += h[i].toString(16).padStart(8, '0');
  return out;
}

/** SHA-256 十六进制（内部实现：对外只经 shortHash——全库没有需要完整摘要的调用方）。
 *  快路径 WebCrypto，不可得（HTTP 不安全上下文 / vm 沙箱）时落纯 JS 实现，字节一致。 */
async function hashHex(str: string): Promise<string> {
  const bytes = getEncoder().encode(str);
  try {
    const digest = await getSubtle().digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return sha256HexBytes(bytes);
  }
}

export async function shortHash(str: string, len = 10): Promise<string> {
  return (await hashHex(str)).slice(0, len);
}

/** 规范化文本：折叠空白 */
export function normalizeText(text: string | null | undefined): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** 内容指纹（异步） */
export async function contentFingerprint(text: string): Promise<string> {
  return shortHash(normalizeText(text), 16);
}

/** 文档 ID：'d' + 8 位短哈希（只由元数据派生，不含全文） */
export async function makeDocId(meta: DocMeta): Promise<string> {
  const basis = ['tidme-doc/v1', meta.title || '', meta.creator || '', meta.language || ''].join('\n');
  return 'd' + (await shortHash(basis, 8));
}

/** 节 ID：'s' + 12 位短哈希(docId | 全面包屑 | 全局序号) */
export async function makeSectionId(docId: string, breadcrumb: string[], ordinal: number): Promise<string> {
  const basis = [docId, breadcrumb.join(CRUMB_SEP), String(ordinal)].join('|');
  return 's' + (await shortHash(basis, 12));
}
