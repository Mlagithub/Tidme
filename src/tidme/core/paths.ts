/*
paths.ts — tiddler 命名空间路径生成（M3 章节隔离）

设计目标：
- 每本书放进独立目录（TW 原生 title 路径语义）
- 一本书的目录内不再分子目录：文档页/节卡/摘录都拍平（章层次靠 breadcrumb 字段）
- 知识型卡片（挖空/问答）单独走 Tidme/Decks/<书>/ 命名空间（避免污染阅读材料目录）
- title 唯一稳定（用 tidme.id 短哈希作叶段）
- 显示用 caption / tidme.breadcrumb 保持可读（不动 UI）
- 现有过滤器全部基于字段（tidme.doc / tidme.parent / tags），零依赖 title 路径

布局：
  Tidme/                                              根（用户内容）
    Books/
      <bookSlug>~<docId?>/                            文档页 + 节卡 + 摘录（拍平）
        <sectionId>                                   节卡（如 s1234567890ab）
        <sectionId>--e<extractId>                     摘录（-- 分隔避免冲突）
    Decks/
      <bookSlug>~<docId?>/                            知识型卡片（拍平）
        <sectionId>--cloze-<cardId>                   挖空
        <sectionId>--qa-<cardId>                      问答
      <bookSlug>~<docId?>/复习本书/                   文档子集牌组
      ...                                             未来用户自建牌组
    Clips/                                            Web 剪切（占位）
冲突处理：bookSlug 相同时追加 ~<docId 短哈希> 后缀；其它层不冲突（短哈希已唯一）
*/

// 保留 TW 系统 tiddler 段
const RESERVED = new Set([
	"index", "default", "new", "edit", "config", "settings", "state"
]);

/** 去除路径不安全字符 + 折叠空白；保留中日韩文字与拉丁字母数字 */
export function slugify(name: string): string {
	if (!name) return "";
	let s = String(name)
		.normalize("NFKC")
		.replace(/[《》「」『』「」]/g, "")  // 中文角标引号（书名号等）
		.replace(/[（()()【\[\]】]/g, "")    // 中英文括号（营销/说明）
		.replace(/[/\\:*?"<>|]/g, "")   // 文件系统/TW 保留字符
		.replace(/\s+/g, "-")            // 空白 → 连字符
		.replace(/[\-_.]+/g, "-")        // 合并连续连字符/点
		.replace(/^[\-\.]+|[\-\.]+$/g, "") // 去首尾连字符/点
		.slice(0, 80);
	return s || "untitled";
}

/** 拼接 title 路径（用 /，TW 原生）；任一空段抛错（防意外根污染） */
export function joinPath(...parts: (string | undefined | null)[]): string {
	const clean = parts
		.map((p) => String(p ?? "").trim())
		.filter((p) => p.length > 0);
	if (!clean.length) throw new Error("joinPath: empty path");
	if (clean.some((p) => p.includes("//") || /^[.\s]|[.\s]$/.test(p))) {
		throw new Error("joinPath: invalid segment: " + JSON.stringify(clean));
	}
	if (clean.some((p) => RESERVED.has(p.toLowerCase()))) {
		throw new Error("joinPath: reserved segment: " + clean.find((p) => RESERVED.has(p.toLowerCase())));
	}
	return clean.join("/");
}

/** 文档根路径：Tidme/Books/<bookSlug>（slug 冲突时带 ~<docId>） */
export function bookRoot(bookTitle: string, docId: string): string {
	const slug = slugify(bookTitle) || "untitled";
	const base = "Tidme/Books/" + slug;
	if (RESERVED.has(slug.toLowerCase())) throw new Error("bookRoot: reserved book title: " + slug);
	return uniqueFolder(base, docId);
}

/** 知识型卡片根：Tidme/Decks/<bookSlug>[/~<docId>]（挖空/问答统一进这里） */
export function bookCardsRoot(bookTitle: string, docId: string): string {
	const slug = slugify(bookTitle) || "untitled";
	const base = "Tidme/Decks/" + slug;
	return uniqueFolder(base, docId);
}

/** 子集牌组路径：Tidme/Decks/<bookSlug>[/~<docId>]/<用途> */
export function deckSubsetPath(bookTitle: string, docId: string, purpose = "复习本书"): string {
	const root = bookCardsRoot(bookTitle, docId);
	return joinPath(root, slugify(purpose));
}

/** 节卡路径：Tidme/Books/<bookSlug>/<sectionId>（拍平；章层次靠 breadcrumb 字段表达） */
export function sectionPath(bookTitle: string, docId: string, _breadcrumb: string[], sectionId: string): string {
	const root = bookRoot(bookTitle, docId);
	return joinPath(root, sectionId);
}

/** 摘录路径：Tidme/Books/<bookSlug>/<sectionId>--extract（拍平；-- 分隔避免冲突）
 * 冲突时由调用方加 -N 后缀（paths.ts 是纯函数不持状态） */
export function extractPath(
	bookTitle: string,
	docId: string,
	sectionId: string
): string {
	const root = bookRoot(bookTitle, docId);
	return joinPath(root, sectionId + "--extract");
}

/** 知识卡路径（挖空/问答）：Tidme/Decks/<bookSlug>[/~<docId>]/<sectionId>--<subkind>
 * 拍平在书对应的 decks 子目录里——不在节下嵌子目录（保持"一本书一个目录"原则） */
export function cardPath(
	bookTitle: string,
	docId: string,
	sectionId: string,
	subkind: "cloze" | "qa"
): string {
	const root = bookCardsRoot(bookTitle, docId);
	return joinPath(root, sectionId + "--" + subkind);
}

/** 派生卡统一入口（按 subkind 自动路由到 extract 命名空间或 cards 命名空间）
 * 注意：当前调用方都走 buildExtract/Cloke/QA + collision check，不直接用 itemPath
 * 保留为向后兼容 */
export function itemPath(
	bookTitle: string,
	docId: string,
	_breadcrumb: string[],
	sectionId: string,
	subkind: "extract" | "cloze" | "qa"
): string {
	if (subkind === "extract") {
		return extractPath(bookTitle, docId, sectionId);
	}
	return cardPath(bookTitle, docId, sectionId, subkind as "cloze" | "qa");
}

/** 文档页标题：Tidme/Books/<bookSlug>[/~<docIndex>]
 * docIndex 1 = 无后缀（首份）；同书二次导入 docIndex=2 追加 " ~2"
 */
export function docPageTitle(bookTitle: string, docId: string, docIndex = 1): string {
	const root = bookRoot(bookTitle, docId);
	if (docIndex <= 1) return root;
	return joinPath(root, "~" + docIndex);
}

/** 插入式新建节（在已有文档内手填时使用；拍平到书目录，文件名带 manual 前缀） */
export function insertedSectionTitle(bookTitle: string, docId: string, sectionCaption: string, sectionId: string): string {
	const root = bookRoot(bookTitle, docId);
	return joinPath(root, "manual-" + slugify(sectionCaption) + "-" + sectionId);
}

/** 判断 tiddler 是否属于 Tidme 命名空间（用户内容） */
export function isTidmeContent(title: string): boolean {
	const t = String(title ?? "");
	return t === "Tidme"
		|| t.startsWith("Tidme/")
		|| t.startsWith("Tidme");
}

/** 判断 tiddler 是否属于某本书（含文档页、节卡、摘录、知识卡、牌组） */
export function isInBook(title: string, bookTitle: string, docId: string): boolean {
	const bookRoot_ = bookRoot(bookTitle, docId);
	const cardsRoot = bookCardsRoot(bookTitle, docId);
	return title === bookRoot_ || title.startsWith(bookRoot_ + "/")
		|| title === cardsRoot || title.startsWith(cardsRoot + "/");
}

/**
 * 唯一化文件夹路径：检测冲突；冲突时把 docId 前 6 位追加为 ~XXXXXX
 * 冲突检测由调用方传入 (existingTitles: Set<string>)：纯函数不持状态
 */
export function uniqueFolder(baseFolder: string, docId: string, existing?: Set<string>): string {
	if (!existing || !existing.has(baseFolder)) return baseFolder;
	const tag = "~" + String(docId).replace(/^d/, "").slice(0, 6);
	return baseFolder + tag;
}

/** 全部命名空间常量（供 UI 引用） */
export const NS = {
	ROOT: "Tidme",
	BOOKS: "Tidme/Books",
	DECKS: "Tidme/Decks",
	CLIPS: "Tidme/Clips",
} as const;
