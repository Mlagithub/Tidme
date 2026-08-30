/*
ids.ts — 确定性 ID 与内容指纹（双端：浏览器 WebCrypto / Node / TW 服务端 vm 沙箱）

规格见 doc/research/data-model.md §4。纯函数、无副作用。
*/

export interface BookMeta {
	title?: string;
	creator?: string;
	language?: string;
	publisher?: string;
	date?: string;
}

let _encoder: { encode(s: string): Uint8Array } | null = null;
function getEncoder(): { encode(s: string): Uint8Array } {
	if (_encoder) return _encoder;
	if (typeof TextEncoder !== "undefined") {
		_encoder = new TextEncoder();
		return _encoder;
	}
	// TW 服务端 vm 沙箱无 TextEncoder：用沙箱提供的 Buffer
	const buf: any = typeof Buffer !== "undefined" ? Buffer : null;
	if (buf) {
		_encoder = { encode: (s: string) => new Uint8Array(buf.from(s, "utf8")) };
		return _encoder;
	}
	throw new Error("TextEncoder 不可用");
}

function getSubtle(): SubtleCrypto {
	const subtle = globalThis.crypto?.subtle;
	if (subtle) return subtle;
	// TW 服务端模块运行在 vm 沙箱：globalThis.crypto/process 均不可见，但裸 process 可用
	let proc: any;
	try { proc = typeof process !== "undefined" ? process : undefined; } catch { proc = undefined; }
	if (proc && typeof proc.getBuiltinModule === "function") {
		const nodeCrypto = proc.getBuiltinModule("node:crypto");
		if (nodeCrypto?.webcrypto?.subtle) return nodeCrypto.webcrypto.subtle;
	}
	throw new Error("crypto.subtle 不可用（需要浏览器或 Node >= 19）");
}

export async function hashHex(str: string): Promise<string> {
	const digest = await getSubtle().digest("SHA-256", getEncoder().encode(str));
	return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function shortHash(str: string, len = 10): Promise<string> {
	return (await hashHex(str)).slice(0, len);
}

/** 规范化文本：折叠空白 */
export function normalizeText(text: string | null | undefined): string {
	return String(text || "").replace(/\s+/g, " ").trim();
}

/** 内容指纹（异步） */
export async function contentFingerprint(text: string): Promise<string> {
	return shortHash(normalizeText(text), 16);
}

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

/** 摘录 ID：'e' + 12 位短哈希(parentId | 内容指纹 | 序号) */
export async function makeExtractId(parentId: string, text: string, ordinal: number): Promise<string> {
	const basis = [parentId, await contentFingerprint(text), String(ordinal)].join("|");
	return "e" + (await shortHash(basis, 12));
}

/** 卡片 ID：'c' + 12 位短哈希(parentId | 内容指纹(caption+text) | 序号) */
export async function makeCardId(parentId: string, caption: string, text: string, ordinal: number): Promise<string> {
	const basis = [parentId, await contentFingerprint(caption + "\n" + text), String(ordinal)].join("|");
	return "c" + (await shortHash(basis, 12));
}
