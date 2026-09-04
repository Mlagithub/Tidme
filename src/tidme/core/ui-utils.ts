/*
core/ui-utils.ts — （M1 拆分 shim / 历史兼容层）

原"UI 工具+文档查询+删除业务"一锅端按职责拆分到：
  core/dom.ts       无状态 DOM（el / escapeHtml）
  core/display.ts   展示层（徽章/标签/标题/日期）
  core/doc-ops.ts   文档运维（查询/删除/折叠态）
本文件仅转发保持旧 import 兼容；新代码请直接 require 对应模块。
调用点全部迁移后删除本 shim。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制成多份实现）。
*/

declare function require(module: string): any;

const dom = require("$:/plugins/keepone/tidme/core/dom.js");
export const el = dom.el;
export const escapeHtml = dom.escapeHtml;

const display = require("$:/plugins/keepone/tidme/core/display.js");
export const badgeOf = display.badgeOf;
export const kindMark = display.kindMark;
export const stateLabel = display.stateLabel;
export const dueLabel = display.dueLabel;
export const intervalLabel = display.intervalLabel;
export const repsLabel = display.repsLabel;
export const lapsesLabel = display.lapsesLabel;
export const diffLabel = display.diffLabel;
export const dateLabel = display.dateLabel;
export const displayTitle = display.displayTitle;
export const captionText = display.captionText;

const docOps = require("$:/plugins/keepone/tidme/core/doc-ops.js");
export const docFolderOwner = docOps.docFolderOwner;
export const docPageOfDoc = docOps.docPageOfDoc;
export const deleteDocContent = docOps.deleteDocContent;
export const sectionsOfDoc = docOps.sectionsOfDoc;
export const prepareCardFold = docOps.prepareCardFold;
