/*
core/reactive.ts — 集中相关性谓词（唯一刷新机制的匹配层）

规则：数据变化 → 视图更新的唯一通道是 TW 原生
refresh(changedTiddlers) 嗅探；本模块是嗅探的**唯一匹配层**。
- 谓词宁宽勿窄：漏匹配 = UI 静默陈旧；宽匹配只多一次重建（良性损耗）。
- 各组件禁止在组件内散写字段嗅探；精化条件登记在这里。
- 被删除的 tiddler 读不到字段：对删除事件一律按"相关"处理（由调用方保证）。
*/

declare function require(module: string): any;
const session = require('$:/plugins/keepone/tidme/core/session.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

/** 学习会话相关变化（全局会话 tiddler / 任一 <deck>/study 列表）——学习模式条、workflow 主按钮 */
export function isSessionChange(title: string): boolean {
  return title === session.SESSION_TIDDLER || String(title).endsWith(session.DECK_STUDY_SUFFIX);
}

/** tidme 数据域相关变化（宽匹配）：面板类组件（统计/管理器/队列/阅读列表）的刷新谓词 */
export function isTidmeDataChange(wiki: any, title: string): boolean {
  if (title.startsWith('$:/state/tidme') || title.startsWith(ns.DECK_PREFIX) || title.startsWith('Tidme/')) return true;
  const f = wiki.getTiddler(title)?.fields;
  if (!f) return true; // 删除按相关处理
  return f['tidme.kind'] !== undefined ||
    (f.state !== undefined && f.due !== undefined) ||
    (Array.isArray(f.tags) && f.tags.indexOf('tidme-import-doc') >= 0);
}

/** 组件 refresh 收敛入口：changedTiddlers 里是否有 tidme 数据域相关变化（面板类组件统一走这里，勿再散写循环） */
export function hasRelevantChange(wiki: any, changedTiddlers: Record<string, any> | undefined): boolean {
  for (const title of Object.keys(changedTiddlers || {})) {
    if (isTidmeDataChange(wiki, title)) return true;
  }
  return false;
}
