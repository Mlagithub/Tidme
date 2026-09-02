/*
paths.ts — tiddler 命名空间路径生成（M3 章节隔离）

设计目标：
- 每本书放进独立目录（TW 原生 title 路径语义）
- 一本书的目录内不再分子目录：文档页/节卡/摘录都拍平（章层次靠 breadcrumb 字段）
- 知识型卡片（挖空/问答）单独走 Tidme/Decks/<书>/ 命名空间（避免污染阅读材料目录）
- title 唯一稳定：叶段 = 可读 caption slug + "-" + tidme.id（A2，核心 UI 可读）
- 显示用 caption / tidme.breadcrumb 保持可读（不动 UI）
- 现有过滤器全部基于字段（tidme.doc / tidme.parent / tags），零依赖 title 路径

布局：
  Tidme/                                              根（用户内容）
    Books/
      <bookSlug>[/~docId6]/                           文档页 + 节卡 + 摘录（拍平）
        <sectionId>                                   节卡（如 s1234567890ab）
        <sectionId>--extract                          摘录（-- 分隔；同层冲突 -N 后缀）
    Decks/
      <bookSlug>[/~docId6]/                           知识型卡片（拍平；与 Books 平行）
        <sectionId>--cloze / --qa                     挖空 / 问答
      <bookSlug>[/~docId6]/复习本书/                  文档子集牌组
      ...                                             未来用户自建牌组
    Clips/                                            Web 剪切（占位）
冲突处理：同名书（slug 相同、docId 不同）的 ~docId6 后缀在导入期解析（split.ts resolveDocRoot，
经调用方 folderOccupied 探测真实占用后追加）；本模块为纯函数，不做状态探测。
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

/** 文档根路径：Tidme/Books/<bookSlug>。同名书冲突的 ~docId6 后缀由导入期 resolveDocRoot 追加（本模块纯函数）。 */
export function bookRoot(bookTitle: string, _docId?: string): string {
	const slug = slugify(bookTitle) || "untitled";
	if (RESERVED.has(slug.toLowerCase())) throw new Error("bookRoot: reserved book title: " + slug);
	return "Tidme/Books/" + slug;
}

/** 知识型卡片根：Tidme/Decks/<bookSlug>（挖空/问答统一进这里；与 bookRoot 平行） */
export function bookCardsRoot(bookTitle: string, _docId?: string): string {
	return "Tidme/Decks/" + (slugify(bookTitle) || "untitled");
}

/** 子集牌组路径：Tidme/Decks/<bookSlug>[/~<docId>]/<用途> */
export function deckSubsetPath(bookTitle: string, docId: string, purpose = "复习本书"): string {
	const root = bookCardsRoot(bookTitle, docId);
	return joinPath(root, slugify(purpose));
}

/** 节卡叶段（A2：核心 UI 可读）：可读 caption slug + "-" + 稳定 id；caption 空时退化为纯 id。
 * 唯一性由 id 保证，可读性由 caption 提供；标题一经创建即稳定。 */
export function sectionLeaf(caption: string, sectionId: string): string {
	const slug = slugify(caption);
	return (slug ? slug + "-" : "") + sectionId;
}

/** 节卡路径（纯形式）：Tidme/Books/<bookSlug>/<sectionLeaf(caption, sectionId)>。 */
export function sectionPath(bookTitle: string, caption: string, sectionId: string): string {
	return joinPath(bookRoot(bookTitle), sectionLeaf(caption, sectionId));
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

/** 知识卡路径（挖空/问答）：Tidme/Decks/<bookSlug>[/~docId6]/<sectionId>--<subkind>
 * 拍平在书对应的 decks 子目录里——不在节下嵌子目录（保持"一本书一个目录"原则）。
 * 注：实际建卡（section.ts）从父卡位置派生以兼容带后缀 folder；本函数为纯形式路径。 */
export function cardPath(
	bookTitle: string,
	docId: string,
	sectionId: string,
	subkind: "cloze" | "qa"
): string {
	const root = bookCardsRoot(bookTitle, docId);
	return joinPath(root, sectionId + "--" + subkind);
}

/** 取命名空间 title 的叶段（末段）：Tidme/Books/<slug>/s123… → s123…。
 * 集中"反解析"（生成在 paths，解析也在 paths），避免各处 substring 手切。 */
export function leafIdOf(title: string): string {
	const t = String(title ?? "");
	const i = t.lastIndexOf("/");
	return i >= 0 ? t.slice(i + 1) : t;
}

/** 插入式新建节（在已有文档内手填时使用；拍平到书目录，叶段带 manual 前缀） */
export function insertedSectionTitle(bookTitle: string, docId: string, sectionCaption: string): string {
	return joinPath(bookRoot(bookTitle, docId), "manual-" + (slugify(sectionCaption) || "untitled"));
}
