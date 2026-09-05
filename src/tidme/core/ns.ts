/*
core/ns.ts — 标题命名空间与跨模块契约常量（唯一产地，零依赖）

标题约定（tidme 数据布局）与 fsrs4tw 契约（deck/log/folded 命名）散布在
core 与 widgets 各处曾按字面量手拼，改名/迁移时靠 grep 兜底。本模块收口：
- 一切 title 前缀、分隔符、fsrs4tw 日志契约一律引这里的常量/判别式，勿手拼；
- 纯常量与纯函数，不 require 任何模块（防环）。
注意：TW 过滤器 DSL 字符串内嵌的字段名（如 [tidme.kind[item]]）无法插值，
保持字面量；本模块只管 title/字符串拼接层的契约。
*/

/** 阅读材料命名空间（文档页 + 节卡 + 摘录卡） */
export const NS_BOOKS = "Tidme/Books/";

/** 知识卡命名空间（挖空/问答/散卡；与 Books 平行镜像） */
export const NS_DECKS = "Tidme/Decks/";

/** 无来源散卡桶（普通笔记上挖空/问答的落点） */
export const NS_DECKS_SCATTER = NS_DECKS + "散卡";

/** 面包屑层级分隔符（tidme.breadcrumb / 显示层共用） */
export const CRUMB_SEP = " › ";

/** fsrs4tw 牌组标题前缀（$:/Deck/<name>，学习循环运行时依赖） */
export const DECK_PREFIX = "$:/Deck/";

/** 卡折叠态 tiddler 前缀（<prefix><title> = "show"/"hide"，fsrs4tw reveal 语义） */
export const FOLDED_STATE_PREFIX = "$:/state/folded/";

/**
 * Books → Decks 镜像推导：某阅读材料的测试卡（挖空/问答）所在牌组目录根。
 * 文档页 title == folder 根（folder 冲突带 ~docId 后缀时后缀原样保留）。
 * 非 Books 来源返回 null（调用方走散卡桶等兜底）。
 */
export function booksToDecksRoot(title: string): string | null {
	return title.startsWith(NS_BOOKS)
		? NS_DECKS + title.slice(NS_BOOKS.length)
		: null;
}

/** fsrs4tw 复习日志契约：<deck>/log/<YYYYMMDD>（data map，键 = 卡 title） */
export function isDeckLogTitle(title: string, dateKey?: string): boolean {
	if (!title.startsWith(DECK_PREFIX) || !/\/log\/\d{8}$/.test(title)) return false;
	return dateKey === undefined || title.endsWith(dateKey);
}

/** 今日日期键（UTC，YYYYMMDD）——日志 tiddler 命名与统计口径共用 */
export function todayKey(now = new Date()): string {
	return now.toISOString().slice(0, 10).replace(/-/g, "");
}
