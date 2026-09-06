# -*- coding: utf-8 -*-
# 性能修复补丁：精化谓词接线 + 合并重建 + O(n²) 去重修复 + 按需渲染 + 漏斗输入收窄 + 进度聚合
R = {
"src/tidme/manager/widgets/card-manager.ts": [
("""  const { wiki, st } = ctx;
  st.allCards = wiki.filterTiddlers(CARD_FILTER)
    .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i)
    .map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }));""",
"""  const { wiki, st } = ctx;
  // 两个 run 按 tidme.kind 互斥（item / 无 kind 手动卡），TW 按标题去重，无需再过滤
  st.allCards = wiki.filterTiddlers(CARD_FILTER)
    .map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }));"""),
("""    details.appendChild(ds);
    for (const [docKey, docCards] of docGroupsOf(deckCards)) {
      details.appendChild(docDetails(ctx, 'deck', d.title + '/' + docKey, docCards));
    }
    treeBox.appendChild(details);""",
"""    details.appendChild(ds);
    // 文档分组按需渲染：折叠的牌组不建行（大库下省掉不可见 DOM），首次展开时补建
    let docGroupsRendered = false;
    const renderDocGroups = () => {
      if (docGroupsRendered) return;
      docGroupsRendered = true;
      for (const [docKey, docCards] of docGroupsOf(deckCards)) {
        details.appendChild(docDetails(ctx, 'deck', d.title + '/' + docKey, docCards));
      }
    };
    if (details.open) renderDocGroups();
    else details.addEventListener('toggle', () => { if (details.open) renderDocGroups(); });
    treeBox.appendChild(details);"""),
("""  os.appendChild(el(doc, 'strong', '', ` 未入组（${orphans.length}）`));
  os.title = '不属于任何牌组队列的卡片：已读、搁置或手动创建的散卡';
  ob.appendChild(os);
  for (const [docKey, docCards] of docGroupsOf(orphans)) {
    ob.appendChild(docDetails(ctx, 'deck', '__orphan__/' + docKey, docCards));
  }
  treeBox.appendChild(ob);""",
"""  os.appendChild(el(doc, 'strong', '', ` 未入组（${orphans.length}）`));
  os.title = '不属于任何牌组队列的卡片：已读、搁置或手动创建的散卡';
  ob.appendChild(os);
  let orphansRendered = false;
  const renderOrphanGroups = () => {
    if (orphansRendered) return;
    orphansRendered = true;
    for (const [docKey, docCards] of docGroupsOf(orphans)) {
      ob.appendChild(docDetails(ctx, 'deck', '__orphan__/' + docKey, docCards));
    }
  };
  if (ob.open) renderOrphanGroups();
  else ob.addEventListener('toggle', () => { if (ob.open) renderOrphanGroups(); });
  treeBox.appendChild(ob);"""),
("""    refresh(changedTiddlers: Record<string, any>) {
      const ctx = this._ctx;
      if (!ctx) return false;
      // 刷新：唯一机制（TW 原生 refresh 嗅探 + core/reactive 谓词）
      const need = reactive.hasRelevantChange(ctx.wiki, changedTiddlers);
      if (need) render(ctx);
      return need;
    }""",
"""    refresh(changedTiddlers: Record<string, any>) {
      const ctx = this._ctx;
      if (!ctx) return false;
      // 刷新：列表类精化谓词（复习日志/会话写入不重建列表）+ 合并重建（评分链路连写 4+ tiddler）
      if (!reactive.hasCardDataChange(ctx.wiki, changedTiddlers)) return false;
      return reactive.rebuildSoon(() => render(ctx));
    }"""),
],
"src/tidme/import/widgets/reading-list.ts": [
("""    refresh(changedTiddlers: Record<string, any>) {
      // 即时刷新：任何 topic/衍生卡变化 → 重建列表
      if (!this._root) return false;
      let need = false;
      for (const title of Object.keys(changedTiddlers || {})) {
        if (title.startsWith(docOps.READPOINT_PREFIX)) {
          need = true;
          break;
        }
        const f = this.wiki.getTiddler(title)?.fields;
        if (!f) continue;
        if (f['tidme.kind']) {
          need = true;
          break;
        }
      }
      if (need) {
        this.build();
        return true;
      }
      return false;
    }""",
"""    refresh(changedTiddlers: Record<string, any>) {
      // 即时刷新：卡片/续读点/文档页变化 → 重建（精化谓词：复习日志与会话写入不重建）
      if (!this._root) return false;
      if (!reactive.hasCardDataChange(this.wiki, changedTiddlers)) return false;
      return reactive.rebuildSoon(() => this.build());
    }"""),
("""        det.appendChild(sum);

        // 卡片表格（列式紧凑，避免竖排条目拉长页面；compact 只留 类型/标题 两列）
        const table = el(doc, 'table', 'tm-rl-table');""",
"""        det.appendChild(sum);

        // 卡片表格按需渲染：文档组默认折叠，首次展开才建行（大库下省掉不可见 DOM）
        let tableRendered = false;
        const renderTable = () => {
          if (tableRendered) return;
          tableRendered = true;
        // 卡片表格（列式紧凑，避免竖排条目拉长页面；compact 只留 类型/标题 两列）
        const table = el(doc, 'table', 'tm-rl-table');"""),
("""        const scrollBox = el(doc, 'div', 'tm-scroll');
        scrollBox.appendChild(table);
        det.appendChild(scrollBox);
      }
    }""",
"""        const scrollBox = el(doc, 'div', 'tm-scroll');
        scrollBox.appendChild(table);
        det.appendChild(scrollBox);
        };
        if ((det as any).open) renderTable();
        else det.addEventListener('toggle', () => { if ((det as any).open) renderTable(); });
      }
    }"""),
],
"src/tidme/manager/widgets/queue-ops.ts": [(
"""    refresh(changedTiddlers: Record<string, any>) {
      const need = reactive.hasRelevantChange(this.wiki, changedTiddlers);
      if (need && this._renderList) this._renderList();
      return need;
    }""",
"""    refresh(changedTiddlers: Record<string, any>) {
      // 列表类精化谓词：复习日志/会话写入不重建队列；重建合并到宏任务
      if (!reactive.hasCardDataChange(this.wiki, changedTiddlers)) return false;
      if (this._renderList) return reactive.rebuildSoon(() => this._renderList?.());
      return false;
    }"""
)],
"src/tidme/import/widgets/stats-panel.ts": [
("        const all = cardLikes('[!is[system]]');",
 "        // 漏斗只消费卡片与文档页（[!is[system]] 会把状态/配置/临时 tiddler 全部载入）\n        const all = cardLikes('[all[shadows+tiddlers]!is[draft]has[tidme.kind]] [all[shadows+tiddlers]!is[draft]tag[tidme-import-doc]]');"),
("""    refresh(changedTiddlers: Record<string, any>) {
      const need = reactive.hasRelevantChange(this.wiki, changedTiddlers);
      if (need && this._wrap && this._wrap.parentNode) {
        this._wrap.textContent = '';
        this._build?.();
      }
      return need;
    }""",
"""    refresh(changedTiddlers: Record<string, any>) {
      // 面板读复习日志（保留率），保持宽谓词；重建合并到宏任务（评分链路连写 4+ tiddler）
      const need = reactive.hasRelevantChange(this.wiki, changedTiddlers);
      if (need && this._wrap && this._wrap.parentNode) {
        return reactive.rebuildSoon(() => {
          this._wrap.textContent = '';
          this._build?.();
        });
      }
      return need;
    }"""
)],
"src/tidme/review/widgets/today.ts": [(
"""      const need = reactive.hasRelevantChange(this.wiki, changedTiddlers);
      if (need) this.build();
      return need;""",
"""      // 反馈条读牌组日志（宽谓词）；重建合并到宏任务（评分链路连写 4+ tiddler）
      const need = reactive.hasRelevantChange(this.wiki, changedTiddlers);
      if (need) return reactive.rebuildSoon(() => this.build());
      return need;"""
)],
"src/tidme/core/doc-ops.ts": [(
"""/** 某 book folder（Tidme/Books/<slug>）下第一张带 tidme.doc 的卡所属 docId（无占用返回 null）——同名书冲突探测 */""",
"""/** 各书的章节进度（一次全库扫描按书聚合；口径与 sectionsOfDoc 一致：topic 且非摘录）。
 * 供「最近阅读」等聚合视图使用——避免每书一次全库扫描（书多时 O(书数×全库)）。 */
export function sectionsProgressByDoc(wiki: any): Map<string, { done: number; total: number }> {
  const agg = new Map<string, { done: number; total: number }>();
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return agg;
  const secs = wiki.filterTiddlers('[has[tidme.doc]nsort[tidme.order]]');
  for (const t of secs) {
    const f = wiki.getTiddler(t)?.fields;
    if (!f) continue;
    if (f['tidme.kind'] !== 'topic' || String(f['tidme.subkind'] || '') === 'extract') continue;
    const docId = String(f['tidme.doc'] || '');
    const a = agg.get(docId) || { done: 0, total: 0 };
    a.total += 1;
    if (sched.isCardDone(f)) a.done += 1;
    agg.set(docId, a);
  }
  return agg;
}

/** 某 book folder（Tidme/Books/<slug>）下第一张带 tidme.doc 的卡所属 docId（无占用返回 null）——同名书冲突探测 */"""
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
print("ok: 6 files patched")
