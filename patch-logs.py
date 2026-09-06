# -*- coding: utf-8 -*-
# 复习日志布局 v2：每牌组单文件 + 自动迁移 + 保留期修剪
R = {
# 1. ns.ts：日志契约 v2
"src/tidme/core/ns.ts": [(
"""/** fsrs4tw 复习日志契约：<deck>/log/<YYYYMMDD>（data map，键 = 卡 title） */
export function isDeckLogTitle(title: string, dateKey?: string): boolean {
  if (!title.startsWith(DECK_PREFIX) || !/\\/log\\/\\d{8}$/.test(title)) return false;
  return dateKey === undefined || title.endsWith(dateKey);
}""",
"""/** 复习日志契约（按文件）：<deck>/log —— 单个 data tiddler（type application/json），
 *  键 = 17 位复习时刻（YYYY0MM0DD0hh0mm0ssXXX），值 = review_log JSON。
 *  旧版按天（<deck>/log/<YYYYMMDD>）由启动调度器迁移合并进本文件并删除旧 tiddler。 */
export const DECK_LOG_SUFFIX = '/log';

export function deckLogTitle(deck: string): string {
  return deck + DECK_LOG_SUFFIX;
}

export function isDeckLogTitle(title: string): boolean {
  return title.startsWith(DECK_PREFIX) && title.endsWith(DECK_LOG_SUFFIX);
}"""
)],
# 2. repeat.tid：写入单文件，键升级为完整时刻
"src/tidme/review/buttons/action/repeat.tid": [(
"""            $tiddler={{{ [<deckTiddler>addsuffix[/log/]addsuffix<now [UTC]YYYY0MM0DD>] }}}
            $index={{{ [<now [UTC]0hh0mm0ssXXX>] }}}""",
"""            $tiddler={{{ [<deckTiddler>addsuffix[/log]] }}}
            $index={{{ [<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>] }}}"""
)],
# 3. today.ts：今日计数读 v2 单文件
"src/tidme/review/widgets/today.ts": [(
"""/** 今日复习卡数：遍历全部牌组当日日志条目（<deck>/log/<YYYYMMDD> 契约见 core/ns） */
function todayReviewCount(wiki: any): number {
  const key = ns.todayKey();
  let n = 0;
  for (const lt of wiki.filterTiddlers(`[prefix[${ns.DECK_PREFIX}]]`)) {
    if (!ns.isDeckLogTitle(lt, key)) continue;
    const data = wiki.getTiddlerData(lt);
    if (data && typeof data === 'object') n += Object.keys(data).length;
  }
  return n;
}""",
"""/** 今日复习卡数：遍历全部牌组日志单文件，按今天的日期前缀计数（契约见 core/ns） */
function todayReviewCount(wiki: any): number {
  const key = ns.todayKey();
  let n = 0;
  for (const lt of wiki.filterTiddlers(`[prefix[${ns.DECK_PREFIX}]]`)) {
    if (!ns.isDeckLogTitle(lt)) continue;
    const data = wiki.getTiddlerData(lt);
    if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) if (String(k).startsWith(key)) n += 1;
    }
  }
  return n;
}"""
)],
# 4. stats-panel：日志标题口径 v2
"src/tidme/import/widgets/stats-panel.ts": [(
"        // log tiddler title 形如 $:/Deck/<deck>/log/YYYY0MM0DD（repeat.tid 写入），用 prefix + JS 后过滤匹配\n        const logTitles = wiki.filterTiddlers('[all[shadows+tiddlers]prefix[$:/Deck/]]')\n          .filter((t: string) => /\\/log\\/\\d{8}$/.test(t));",
"        // log tiddler title 形如 $:/Deck/<deck>/log（repeat.tid 写入，单文件），用 prefix + JS 后过滤匹配\n        const logTitles = wiki.filterTiddlers('[all[shadows+tiddlers]prefix[$:/Deck/]]')\n          .filter((t: string) => /\\/log$/.test(t));"
)],
# 5. reactive.ts：新日志标题同样不触发列表类面板
"src/tidme/core/reactive.ts": [(
"  if (title.startsWith(ns.DECK_PREFIX)) return !title.includes('/log/') && !title.includes('/study');",
"  if (title.startsWith(ns.DECK_PREFIX))\n    return !title.endsWith(ns.DECK_LOG_SUFFIX) && !title.includes('/log/') && !title.includes('/study');"
)],
# 6. stats.ts：头注释口径同步
"src/tidme/core/stats.ts": [(
"review log 行格式（fsrs4tw repeat 写入 $:/Deck/<deck>/log/YYYY0MMDD，index=时间）：",
"review log 行格式（repeat 写入 $:/Deck/<deck>/log 单文件，键 = 17 位复习时刻）："
)],
# 7. deck.ts：删除牌组时清理其复习日志
"src/tidme/core/deck.ts": [(
"""  wiki.deleteTiddler(deck.title);
  return removed;
}""",
"""  wiki.deleteTiddler(deck.title);
  wiki.deleteTiddler(ns.deckLogTitle(deck.title)); // 复习日志随牌组删除
  return removed;
}"""
)],
# 8. config.ts：日志保留天数
"src/tidme/core/config.ts": [(
"""// ---------- 默认牌组参数 ----------""",
"""// ---------- 复习日志保留 ----------

/** 复习日志保留天数默认值（启动调度器按此修剪旧条目；0 = 永久保留） */
export const LOG_RETENTION_DEFAULT_DAYS = 90;
export const LOG_RETENTION_TITLE = '$:/config/Tidme/LogRetention';

export function readLogRetentionDays(wiki: any): number {
  const raw = Number(wiki.getTiddlerText?.(LOG_RETENTION_TITLE, ''));
  if (!Number.isFinite(raw) || raw < 0) return LOG_RETENTION_DEFAULT_DAYS;
  return Math.floor(raw);
}

export function writeLogRetentionDays(wiki: any, days: number): void {
  if (!wiki) return;
  const n = Math.max(0, Math.floor(Number(days) || 0));
  wiki.addTiddler({ title: LOG_RETENTION_TITLE, text: String(n) });
}

// ---------- 默认牌组参数 ----------"""
)],
# 9. settings.ts：复习日志保留天数行（复习调度分区末尾）
"src/tidme/manager/widgets/settings.ts": [(
"""      row(schedule, '过载触发阈值', numberInput(Number(ap.maxOverdueThreshold), 0, 9999, 1, (v) => config.writeAutoPostpone(wiki, { maxOverdueThreshold: v })), '逾期卡超过该数量才触发顺延（0 = 无门槛）');""",
"""      row(schedule, '过载触发阈值', numberInput(Number(ap.maxOverdueThreshold), 0, 9999, 1, (v) => config.writeAutoPostpone(wiki, { maxOverdueThreshold: v })), '逾期卡超过该数量才触发顺延（0 = 无门槛）');
      row(schedule, '复习日志保留天数', numberInput(config.readLogRetentionDays(wiki), 0, 3650, 1, (v) => config.writeLogRetentionDays(wiki, v)), '超过该天数的复习日志启动时自动清理（0 = 永久保留）');"""
)],
}
errs = []
for f, pairs in R.items():
    s = open(f, encoding="utf-8", newline="").read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            errs.append(f"{f}: count={n}: {old[:70]}")
        else:
            s = s.replace(old, new)
    open(f, "w", encoding="utf-8", newline="").write(s)
if errs:
    raise SystemExit("ERRORS:\n" + "\n".join(errs))
print("ok: 9 files patched")
