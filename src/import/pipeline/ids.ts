/*
ids.ts — 确定性 ID 与内容指纹（浏览器版：WebCrypto）

与 D:\work\tidme-import\src\ids.js 同构；差异仅在哈希实现
（Node 用 node:crypto 同步，浏览器用 crypto.subtle 异步）。
*/

let _encoder: TextEncoder | null = null;
function getEncoder(): TextEncoder {
	if (!_encoder) _encoder = new TextEncoder();
	return _encoder;
}

export async function hashHex(str: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", getEncoder().encode(str));
	return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function shortHash(str: string, len = 10): Promise<string> {
	return (await hashHex(str)).slice(0, len);
}

export interface BookMeta { title?: string; creator?: string; language?: string; publisher?: string; date?: string }

/** 书目文档 ID：'d' + 8 位短哈希（只由元数据派生，不含全文） */
export async function makeDocId(meta: BookMeta): Promise<string> {
	const basis = ["tidme-doc/v1", meta.title || "", meta.creator || "", meta.language || ""].join("\n");
	return "d" + (await shortHash(basis, 8));
}

/** 节 ID：'s' + 12 位短哈希(docId | 全面包屑 | 全局序号) */
export async function makeSectionId(docId: string, breadcrumb: string[], ordinal: number): Promise<string> {
	const basis = [docId, breadcrumb.join(" › "), String(ordinal)].join("|");
	return "s" + (await shortHash(basis, 12));
}

/** 规范化文本：折叠空白 */
export function normalizeText(text: string | null | undefined): string {
	return String(text || "").replace(/\s+/g, " ").trim();
}

/** 内容指纹（异步） */
export async function contentFingerprint(text: string): Promise<string> {
	return shortHash(normalizeText(text), 16);
}
