/*
core/reactive.ts — 集中相关性谓词（唯一刷新机制的匹配层）

规则：数据变化 → 视图更新的唯一通道是 TW 原生
refresh(changedTiddlers) 嗅探；本模块是嗅探的**唯一匹配层**。
- 谓词宁宽勿窄：漏匹配 = UI 静默陈旧；宽匹配只多一次重建（良性损耗）。
  例外：复习日志/会话等高频写入对列表类面板是纯噪音（评分一次连写 4+ 个
  tiddler），由 isCardDataChange 精化排除——列表不展示它们，排除不漏匹配。
- 精化条件登记在这里，组件内禁止散写字段嗅探。
- 被删除的 tiddler 读不到字段：对删除事件一律按"相关"处理（由调用方保证）。
*/

declare function require(module: string): any;
const session = require('$:/plugins/keepone/tidme/core/session.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');

/** 学习会话相关变化（全局会话 tiddler / 任一 <deck>/study 列表）——学习模式条、workflow 主按钮 */
export function isSessionChange(title: string): boolean {
  return title === session.SESSION_TIDDLER || String(title).endsWith(session.DECK_STUDY_SUFFIX);
}

/** tidme 数据域相关变化（宽匹配）：聚合类组件（统计面板 / Today 反馈条要读复习日志） */
export function isTidmeDataChange(wiki: any, title: string): boolean {
  if (title.startsWith('$:/state/tidme') || title.startsWith(ns.DECK_PREFIX) || title.startsWith('Tidme/')) return true;
  const f = wiki.getTiddler(title)?.fields;
  if (!f) return true; // 删除按相关处理
  return f['tidme.kind'] !== undefined ||
    (f.state !== undefined && f.due !== undefined) ||
    (Array.isArray(f.tags) && f.tags.indexOf('tidme-import-doc') >= 0);
}

/** 组件 refresh 收敛入口（宽谓词）：聚合类组件统一走这里，勿再散写循环 */
export function hasRelevantChange(wiki: any, changedTiddlers: Record<string, any> | undefined): boolean {
  for (const title of Object.keys(changedTiddlers || {})) {
    if (isTidmeDataChange(wiki, title)) return true;
  }
  return false;
}

/**
 * 卡片数据相关变化（列表类面板精化谓词：卡片管理器 / 阅读列表 / 队列操作）。
 * 与宽谓词的差异：复习日志（<deck>/log/）、牌组学习列表与会话写入不算相关——
 * 评分一次连写卡片字段 + 日志 + 会话 4+ 个 tiddler，而列表不展示日志/会话，
 * 排除后每次评分少重建一半以上。续读点/牌组配置/卡片/文档页仍相关。
 */
export function isCardDataChange(wiki: any, title: string): boolean {
  if (title.startsWith(docOps.READPOINT_PREFIX)) return true;
  if (title.startsWith(ns.DECK_PREFIX)) return !title.includes('/log/') && !title.includes('/study');
  if (title.startsWith('Tidme/')) {
    const f = wiki.getTiddler(title)?.fields;
    return !f || f['tidme.kind'] !== undefined;
  }
  const f = wiki.getTiddler(title)?.fields;
  if (!f) return true; // 删除按相关处理
  return f['tidme.kind'] !== undefined ||
    (f.state !== undefined && f.due !== undefined) ||
    (Array.isArray(f.tags) && f.tags.indexOf('tidme-import-doc') >= 0);
}

/** 列表类面板 refresh 收敛入口（精化谓词） */
export function hasCardDataChange(wiki: any, changedTiddlers: Record<string, any> | undefined): boolean {
  for (const title of Object.keys(changedTiddlers || {})) {
    if (isCardDataChange(wiki, title)) return true;
  }
  return false;
}

// ---------- 面板重建合并 ----------

const pendingRebuilds = new Set<() => void>();
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 把面板重建合并到下一个宏任务：一次操作连续写多个 tiddler（评分 = 卡片字段×2
 * + 牌组日志 + 会话），每次写入都触发一轮 refresh——合并后一轮操作只重建一次。
 * 用法：refresh 里 `if (need) return rebuildSoon(() => this.build());`
 * 返回 true（TW 不再重建子树，DOM 由延迟回调接管，最多延迟一个宏任务）。
 * 回调带 try/catch：widget 可能在延迟触发前被销毁（故事条目关闭），此时无副作用。
 */
export function rebuildSoon(build: () => void): boolean {
  pendingRebuilds.add(build);
  if (rebuildTimer === null) {
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      const fns = [...pendingRebuilds];
      pendingRebuilds.clear();
      for (const fn of fns) {
        try {
          fn();
        } catch (e) {
          console.error('[tidme] deferred rebuild failed:', e);
        }
      }
    }, 0);
  }
  return true;
}
