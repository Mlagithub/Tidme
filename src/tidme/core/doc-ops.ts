/*
core/doc-ops.ts — 文档运维门面（对外的稳定入口，实现按职责分在四个模块）

拆分后的职责边界（每块一个抽屉，避免"什么都能干"的 400 行大模块）：
- core/doc-query       文档实体谓词与查询：isDocPage / isContinuousCard / docPageOfDoc /
                       docFolderOwner / sectionsOfDoc / sectionOfDocByPage（只读）
- core/doc-readpoint   续读点存储 + 位置串编解码 + 阅读入口目标 + 阅读进度
                       （parse/save/clearReadPoint、format/parsePagePosition、docReadingTarget、
                        globalReadingTarget、docReadingProgress）
- core/doc-queue       阅读队列过滤器与快照：docItemsFilter / collectTopicQueue
- core/doc-delete      删除阅读材料级联：deleteDocContent（写操作）

本模块只做**转引**（`export const x = mod.x`），不复制实现：相对 ES re-export 会被 esbuild
内联成第二份实现（见 core 铁律 2），故一律显式 require 后转出。调用方按需引用具体模块，
`docOps.*` 这一层保持既有调用点不变。
*/

declare function require(module: string): any;
const query = require('$:/plugins/keepone/tidme/core/doc-query.js');
const readPoint = require('$:/plugins/keepone/tidme/core/doc-readpoint.js');
const queue = require('$:/plugins/keepone/tidme/core/doc-queue.js');
const del = require('$:/plugins/keepone/tidme/core/doc-delete.js');

// ---- doc-query：实体谓词与查询 ----
export const docFolderOwner: (wiki: any, baseFolder: string) => string | null = query.docFolderOwner;
export const docPageOfDoc: (wiki: any, docId: string) => string = query.docPageOfDoc;
export const isDocPage: (f: Record<string, any> | null | undefined) => boolean = query.isDocPage;
export const isContinuousCard: (fields: Record<string, any> | null | undefined) => boolean = query.isContinuousCard;
export const isContentSection: (f: Record<string, any>) => boolean = query.isContentSection;
export const sectionsOfDoc: (wiki: any, docId: string) => string[] = query.sectionsOfDoc;
export const sectionOfDocByPage: (wiki: any, docId: string, page: number) => string | null = query.sectionOfDocByPage;

// ---- doc-readpoint：续读点、位置串、阅读入口与进度 ----
export const READPOINT_PREFIX: string = readPoint.READPOINT_PREFIX;
export const GLOBAL_READPOINT: string = readPoint.GLOBAL_READPOINT;
export const parseReadPoint: (wiki: any, doc: string) => { t: string; s: string } | null = readPoint.parseReadPoint;
export const saveReadPoint: (wiki: any, doc: string, rp: { t: string; s: string }) => void = readPoint.saveReadPoint;
export const clearReadPoint: (wiki: any, doc: string) => void = readPoint.clearReadPoint;
export const formatPagePosition: (page: unknown) => string = readPoint.formatPagePosition;
export const parsePagePosition: (s: unknown) => number | null = readPoint.parsePagePosition;
export const readPointPositionOf: (wiki: any, title: string) => string = readPoint.readPointPositionOf;
export const saveGlobalReadPoint: (wiki: any, title: string) => void = readPoint.saveGlobalReadPoint;
export const globalReadPointTitle: (wiki: any) => string = readPoint.globalReadPointTitle;
export const clearGlobalReadPoint: (wiki: any) => void = readPoint.clearGlobalReadPoint;
export const docReadingProgress: (wiki: any, docId: string) => any = readPoint.docReadingProgress;
export const docReadingTarget: (wiki: any, docId: string) => string = readPoint.docReadingTarget;
export const globalReadingTarget: (wiki: any) => string = readPoint.globalReadingTarget;

// ---- doc-queue：队列过滤器与快照 ----
export const docItemsFilter: (docId: string) => string = queue.docItemsFilter;
export const collectTopicQueue: (wiki: any) => Record<string, any>[] = queue.collectTopicQueue;

// ---- doc-delete：删除级联 ----
export const deleteDocContent: (wiki: any, docId: string) => number = del.deleteDocContent;
