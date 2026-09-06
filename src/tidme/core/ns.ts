/*
core/ns.ts — 标题命名空间与跨模块契约常量（唯一产地，零依赖）

标题约定（tidme 数据布局）与 fsrs4tw 契约（deck/log/folded 命名）散布在
core 与 widgets 各处曾按字面量手拼，改名/迁移时靠 grep 兜底。本模块收口：
- 一切 title 前缀、分隔符、fsrs4tw 日志契约、UI 页面/通知地址、跨端导入契约
  一律引这里的常量/判别式，勿手拼；
- 纯常量与纯函数，不 require 任何模块（防环，双端可用）。
注意：TW 过滤器 DSL 字符串内嵌的字段名（如 [tidme.kind[item]]）无法插值，
保持字面量；本模块只管 title/字符串拼接层的契约。

【跨端契约清单】以下标题同时被 .tid wikitext 引用——JS 常量只覆盖 TS 侧，
wikitext 侧仍是字面量；改名必须人工同步两侧（grep 全仓核对）：
- $:/state/tidme/learning-session   session.ts SESSION_TIDDLER ↔ startstudy/stopstudy 等动作
- <deck>/study                      session.DECK_STUDY_SUFFIX ↔ startstudy.tid
- $:/Deck/<name>                    ns.DECK_PREFIX ↔ fsrs4tw 学习循环 + 各管理 .tid
- $:/state/folded/<title>           ns.FOLDED_STATE_PREFIX ↔ fsrs4tw reveal/折叠语义
- $:/config/Tidme/AutoPostpone      scheduler.AUTOPOSTPONE_CONFIG_TITLE ↔ queue-ops 配置面板
- $:/config/Tidme/QueueMode         workflow.ts QUEUE_MODE_TIDDLER ↔ 工作流选项
- $:/temp/tidme/*                   session.TEMP_PREFIX ↔ stopstudy 清场
- $:/temp/tidme-import/bag          ns.IMPORT_BAG_TITLE ↔ 服务端 importer（importer.js）
- notify-* 通知面板 / help-shortcuts 本模块 NOTIFY_*、PAGE_* ↔ 按钮/按键 .tid 的 tm-notify
*/

/** 阅读材料命名空间（文档页 + 节卡 + 摘录卡） */
export const NS_BOOKS = 'Tidme/Books/';

/** 知识卡命名空间（挖空/问答/散卡；与 Books 平行镜像） */
export const NS_DECKS = 'Tidme/Decks/';

/** 无来源散卡桶（普通笔记上挖空/问答的落点） */
export const NS_DECKS_SCATTER = NS_DECKS + '散卡';

/** 面包屑层级分隔符（tidme.breadcrumb / 显示层共用） */
export const CRUMB_SEP = ' › ';

/** fsrs4tw 牌组标题前缀（$:/Deck/<name>，学习循环运行时依赖） */
export const DECK_PREFIX = '$:/Deck/';

/** 卡折叠态 tiddler 前缀（<prefix><title> = "show"/"hide"，fsrs4tw reveal 语义） */
export const FOLDED_STATE_PREFIX = '$:/state/folded/';

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

/** 复习日志契约（按文件）：<deck>/log —— 单个 data tiddler（type application/json），
 *  键 = 17 位复习时刻（YYYY0MM0DD0hh0mm0ssXXX），值 = review_log JSON。
 *  旧版按天（<deck>/log/<YYYYMMDD>）由启动调度器迁移合并进本文件并删除旧 tiddler。 */
export const DECK_LOG_SUFFIX = '/log';

export function deckLogTitle(deck: string): string {
  return deck + DECK_LOG_SUFFIX;
}

export function isDeckLogTitle(title: string): boolean {
  return title.startsWith(DECK_PREFIX) && title.endsWith(DECK_LOG_SUFFIX);
}

/** 今日日期键（UTC，YYYYMMDD）——日志 tiddler 命名与统计口径共用 */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

// ---------- 本插件 UI 页面地址（tm-navigate 目标；.tid 引用见头部跨端契约清单） ----------

export const PAGE_TODAY = '$:/Today';
export const PAGE_READING_LIST = '$:/plugins/keepone/tidme/import/ui/reading-list';
export const PAGE_IMPORT_CENTER = '$:/plugins/keepone/tidme/import/ui/import-center';
export const PAGE_CARD_MANAGER = '$:/plugins/keepone/tidme/manager/ui/card-manager';
export const PAGE_IMPORT_STATS = '$:/plugins/keepone/tidme/import/ui/stats';
export const PAGE_HELP_SHORTCUTS = '$:/plugins/keepone/tidme/import/ui/help-shortcuts';
export const PAGE_SETTINGS = '$:/plugins/keepone/tidme/manager/ui/settings';

// ---------- 通知面板地址（tm-notify param / $tw.notifier.display） ----------

export const NOTIFY_EXTRACT = '$:/plugins/keepone/tidme/import/ui/notify-extract';
export const NOTIFY_CLOZE = '$:/plugins/keepone/tidme/import/ui/notify-cloze';
export const NOTIFY_READPOINT = '$:/plugins/keepone/tidme/import/ui/notify-readpoint';
export const NOTIFY_SELECT_FIRST = '$:/plugins/keepone/tidme/import/ui/notify-select-first';
export const NOTIFY_EXTRACT_NOTE = '$:/plugins/keepone/tidme/import/ui/notify-extract-note';
export const NOTIFY_SECTION_DONE = '$:/plugins/keepone/tidme/import/ui/notify-section-done';
export const NOTIFY_LATER = '$:/plugins/keepone/tidme/import/ui/notify-later';
export const NOTIFY_DONE = '$:/plugins/keepone/tidme/import/ui/notify-done';
export const NOTIFY_UNSUPPORTED = '$:/plugins/keepone/tidme/import/ui/notify-unsupported';
export const NOTIFY_CONGRATULATION = '$:/plugins/keepone/tidme/review/notify/congratulation';
export const NOTIFY_STUDY_ENDED = '$:/plugins/keepone/tidme/review/notify/study-ended';

// ---------- 跨端导入契约 ----------

/** 同步目标桶的临时配置 tiddler（浏览器 import widgets ↔ 服务端 importer 共用） */
export const IMPORT_BAG_TITLE = '$:/temp/tidme-import/bag';
