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

/** SHA-256 十六进制（内部实现：对外只经 shortHash——全库没有需要完整摘要的调用方） */
async function hashHex(str: string): Promise<string> {
  const digest = await getSubtle().digest('SHA-256', getEncoder().encode(str));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
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
