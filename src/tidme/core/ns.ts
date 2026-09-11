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
- $:/temp/tidme/card-open-at        ns.CARD_OPEN_AT_TITLE ↔ startstudy.tid（评分专注计时锚点；字段 text=起始时刻、card=归属卡）
- $:/Deck/<name>                    ns.DECK_PREFIX ↔ fsrs4tw 学习循环 + 各管理 .tid
- $:/state/folded/<title>           ns.FOLDED_STATE_PREFIX ↔ fsrs4tw reveal/折叠语义
- $:/config/Tidme/AutoPostpone      scheduler.AUTOPOSTPONE_CONFIG_TITLE ↔ queue-ops 配置面板
- $:/config/Tidme/*                 本模块 QUEUE_MODE_TITLE / QUEUE_MIX_TITLE / PRIORITY_DYNAMICS_TITLE /
                                     LOG_RETENTION_TITLE / OCR_TITLE / SEMANTIC_SPLIT_TITLE ↔ 设置页与 .tid
- $:/temp/tidme/*                   session.TEMP_PREFIX / ns.AUTOPOSTPONE_LAST_TITLE ↔ stopstudy 清场、queue-ops 展示
- $:/temp/tidme-import/bag          ns.IMPORT_BAG_TITLE ↔ 服务端 importer（importer.js）
- notify-* 通知面板 / help-shortcuts 本模块 NOTIFY_*、PAGE_* ↔ 按钮/按键 .tid 的 tm-notify
*/

/** 阅读材料命名空间（文档页 + 节卡 + 摘录卡） */
export const NS_DOCS = 'Tidme/Docs/';

/** 附件/二进制命名空间（type application/pdf 等原文件） */
export const NS_ASSETS = 'Tidme/Assets/';

/** 知识卡命名空间（挖空/问答/散卡；与 Docs 平行镜像） */
export const NS_DECKS = 'Tidme/Decks/';

/** 无来源散卡桶（普通笔记上挖空/问答的落点） */
export const NS_DECKS_SCATTER = NS_DECKS + '散卡';

/** 面包屑层级分隔符（tidme.breadcrumb / 显示层共用） */
export const CRUMB_SEP = ' › ';

/** fsrs4tw 牌组标题前缀（$:/Deck/<name>，学习循环运行时依赖） */
export const DECK_PREFIX = '$:/Deck/';

/**
 * 出队三态排除尾段（done/ignored/suspended）——一切"在队"过滤器的公共后缀。
 * TS 侧组合复用（TOPIC_QUEUE_FILTER / deck.DEFAULT_CARD_FILTER / doc-ops.docItemsFilter /
 * server 定时器查询），修改出队标记时只改这里；.tid wikitext 内的字面量除外（DSL 无法插值）。
 */
export const QUEUE_EXCLUDE = '!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]';

/** 牌组实体标签：带此标签的 tiddler 即牌组（`$:/Deck/<name>`）。
 *  learning-package 词书页是"牌组 + legacy kind=topic"，故它是牌组而非阅读材料——
 *  阅读/学习队列、导入对齐的旧卡查询一律按此标签排除（JS 侧用 deck.isDeckFields）。 */
export const DECK_TAG = '$:/tags/TidmeDeck';

/** 过滤器片段：排除牌组实体（TOPIC_QUEUE_FILTER 与导入对齐旧卡查询共用同一份字面量） */
export const NOT_DECK_FILTER = `!tag[${DECK_TAG}]`;

/**
 * 阅读列表（topic 队列）过滤器唯一契约：全库 kind=topic 在队卡（排除草稿、牌组页、搁置/完成/忽略）。
 * 单条 run 的闭合过滤器字符串；deck-engine / doc-ops 等处共用。
 *
 * 排除两类非阅读单元：
 *  - 牌组实体（NOT_DECK_FILTER，legacy 词书页 kind=topic）；
 *  - structure=sectioned：分节型文档页——阅读材料的宿主/入口页（节卡才是阅读单元），
 *    连续型文档页（structure=continuous，如整本 PDF）自身即阅读卡，须留在队列。
 *  卡片一律带 tidme.kind（见 core/card-factory 与各文档页构建处），无需"无 kind 兜底"。
 */
export const TOPIC_QUEUE_FILTER = `[all[shadows+tiddlers]!is[draft]tidme.kind[topic]${NOT_DECK_FILTER}!tidme.structure[sectioned]` +
  QUEUE_EXCLUDE + ']';

/** 该 title 能否安全插入 TW 过滤器字面量（`[prefix[<title>]]`、`{<title>!!field}`）。
 *  实测（TW 5.3）：`]` 与 `}` 在过滤器字面量内**无法转义**（`\]`、双括号写法均报
 *  "Filter error"），且错误文本会被当作一个结果项返回 → 下游把假 title 当卡处理。
 *  系统生成的 title 经 paths.slugify / deck.titleOf 过滤（两者共用 TITLE_UNSAFE_CHARS）；
 *  本判别用于"手写 deck/页 title"这类外部输入的插值点做守卫。 */
export function isFilterSafeTitle(s: unknown): boolean {
  return !/[[\]{}]/.test(String(s ?? ''));
}

/** 生成 title 叶段时必须处理的字符（唯一产地，paths.slugify 与 deck.titleOf 共用）：
 *  路径分隔符 `/`、文件系统保留字符、TW 系统前缀符 `$`，以及过滤器无法转义的 `[` `]` `{` `}`
 *  （见 isFilterSafeTitle）。两处各自决定"删掉"还是"换成 -"（可读性风格不同），
 *  但**危险字符集合必须同源**——曾经两份列表，`{}` 只在一处，另一处生成出过滤器不安全的 title。 */
export const TITLE_UNSAFE_CHARS = /[\\/:*?"<>|$[\]{}]/g;

/** 卡折叠态 tiddler 前缀（<prefix><title> = "show"/"hide"，fsrs4tw reveal 语义） */
export const FOLDED_STATE_PREFIX = '$:/state/folded/';

// 故事河（$:/StoryList）是界面状态，不是领域数据：读它的实现与常量在 ui/base/view-state。

/** 卡片专注计时锚点：`text` = 起始时刻（UTC 17 位串），`card` = 归属卡 title。
 *  导航进入学习卡时由 core/session.touchFocusAnchor 写入，换卡/评分/结束学习时结算
 *  （session.settleFocusAnchor / consumeFocusAnchor）——锚点只有一个槽位，换卡必须先
 *  结算上一张，否则那段时长被覆盖丢失。startstudy.tid 是 fsrs4tw 单牌组起学路径的
 *  写入方，须同时写 text 与 card 两个字段。落在 $:/temp/tidme/ 前缀下，
 *  endSession/stopstudy 清场自动带走。 */
export const CARD_OPEN_AT_TITLE = '$:/temp/tidme/card-open-at';

/** PDF 临时跳转页码 state tiddler 前缀（<prefix><docId>，跨 widget 一次性交接，消费即清理） */
export const PDF_PAGE_STATE_PREFIX = '$:/state/tidme-pdf/page/';

/** 自动顺延任务的上次运行记录：server/scheduler.js 写（{at, overdue, postponed, kept}），
 *  queue-ops 读给用户看——顺延会悄悄改到期日，用户需要知道"什么时候被顺延过、顺延了多少张"。
 *  $:/temp 前缀使其随会话清场带走（只是运行记录，不是持久统计）。 */
export const AUTOPOSTPONE_LAST_TITLE = '$:/temp/tidme/autopostpone/last';

export function pdfPageStateTitle(docId: string): string {
  return PDF_PAGE_STATE_PREFIX + docId;
}

/**
 * Docs → Decks 镜像推导：某阅读材料的测试卡（挖空/问答）所在牌组目录根。
 * 文档页 title == folder 根（folder 冲突带 ~docId 后缀时后缀原样保留）。
 * 非 Docs 来源返回 null（调用方走散卡桶等兜底）。
 */
export function docsToDecksRoot(title: string): string | null {
  return title.startsWith(NS_DOCS)
    ? NS_DECKS + title.slice(NS_DOCS.length)
    : null;
}

/** 复习日志契约（按文件）：<deck>/log —— 单个 data tiddler（type application/json），
 *  键 = 17 位复习时刻（YYYY0MM0DD0hh0mm0ssXXX），值 = review_log JSON。 */
export const DECK_LOG_SUFFIX = '/log';

export function deckLogTitle(deck: string): string {
  return deck + DECK_LOG_SUFFIX;
}

export function isDeckLogTitle(title: string): boolean {
  return title.startsWith(DECK_PREFIX) && title.endsWith(DECK_LOG_SUFFIX);
}

// 日期键（todayKey）不在此模块：ns 是零依赖常量模块，日期归 core/schema 唯一产地

// ---------- 配置 tiddler 地址（$:/config/Tidme/*，唯一产地） ----------
// 自动顺延配置的常量例外地放在 core/scheduler（它是该配置的最低层消费者），config.ts 复用 sched.AUTOPOSTPONE_CONFIG_TITLE。

/** 本插件配置命名空间前缀（reactivity 谓词按前缀嗅探「任一 Tidme 配置变化」也用这个常量） */
export const CONFIG_TITLE_PREFIX = '$:/config/Tidme/';

/** 学习流构成（''=纯测试卡 / interleaved / strict） */
export const QUEUE_MODE_TITLE = CONFIG_TITLE_PREFIX + 'QueueMode';
/** 交错比（item:topic，如 '4:1'） */
export const QUEUE_MIX_TITLE = CONFIG_TITLE_PREFIX + 'QueueMix';
/** 评分 → 优先级动态（again/hard/good/easy + enable） */
export const PRIORITY_DYNAMICS_TITLE = CONFIG_TITLE_PREFIX + 'PriorityDynamics';
/** 复习日志保留天数（空=默认 90；0=永久保留） */
export const LOG_RETENTION_TITLE = CONFIG_TITLE_PREFIX + 'LogRetention';
/** 学习日换天时刻（小时 0–23，默认 4，对标 Anki 4:00 AM） */
export const ROLLOVER_HOUR_TITLE = CONFIG_TITLE_PREFIX + 'RolloverHour';
/** 每日新卡上限（默认 20，0 = 不限） */
export const NEW_PER_DAY_TITLE = CONFIG_TITLE_PREFIX + 'NewPerDay';
/** 每日复习卡上限（默认 200，0 = 不限） */
export const REVIEWS_PER_DAY_TITLE = CONFIG_TITLE_PREFIX + 'ReviewsPerDay';
/** 复习超额时压制新卡引入（默认 true，对标 Anki 行为） */
export const LIMITS_SUPPRESS_NEW_TITLE = CONFIG_TITLE_PREFIX + 'LimitsSuppressNew';
/** 提前学习上限（分钟，默认 20，对标 Anki learn ahead limit） */
export const LEARN_AHEAD_TITLE = CONFIG_TITLE_PREFIX + 'LearnAhead';
/** 每日配额消耗状态 tiddler */
export const DAILY_QUOTA_STATE_TITLE = '$:/state/tidme/daily-quota';
/** 撤销状态 tiddler */
export const UNDO_STATE_TITLE = '$:/state/tidme/undo-state';
/** PDF 与 OCR 配置（JSON） */
export const OCR_TITLE = CONFIG_TITLE_PREFIX + 'Ocr';
/** 语义切分配置（JSON；服务端 importer 与导入预览共用） */
export const SEMANTIC_SPLIT_TITLE = CONFIG_TITLE_PREFIX + 'SemanticSplit';

// ---------- 本插件 UI 页面地址（tm-navigate 目标；.tid 引用见头部跨端契约清单） ----------

export const PAGE_INCREMENTAL_LEARNING = '$:/IncrementalLearning';
export const PAGE_TODAY = PAGE_INCREMENTAL_LEARNING;
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
