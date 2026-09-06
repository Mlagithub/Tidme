# -*- coding: utf-8 -*-
# 修复 reading-list 半改区域 + today.ts 进度聚合
f = "src/tidme/import/widgets/reading-list.ts"
s = open(f, encoding="utf-8", newline="").read()
start = s.find("      for (const g of groups) {")
end_marker = "\n\n    refresh(changedTiddlers"
end = s.find(end_marker)
assert start != -1 and end != -1 and start < end, (start, end)
correct = """      for (const g of groups) {
        const det = el(doc, 'details', 'tm-rl-doc');
        // 文档组默认折叠（两本书也不占长页面）；summary = 名 + 进度 + 继续阅读
        const docAll = sectionsOfDoc(wiki, g.doc);
        const docDone = docAll.filter((t) => sched.isCardDone(wiki.getTiddler(t)?.fields)).length;
        // 真实 doc tiddler title（命名空间路径，folder 冲突时含 ~docId 后缀）：
        // 按 docId 查真实文档页（B1），不再由书名+docId 重算（slug 规则一变即失配）
        const bookTitle = g.cards[0].breadcrumb.split(ns.CRUMB_SEP)[0] || '';
        const docTiddlerTitle = docOps.docPageOfDoc(wiki, g.doc) ||
          (bookTitle ? paths.bookRoot(bookTitle, g.doc) : '');
        const docLabel = bookTitle || g.doc;

        const sum = el(doc, 'summary', 'tm-rl-doc-head');
        const name = el(doc, 'a', 'tc-tiddlylink tm-rl-doc-name', docLabel);
        name.href = '#';
        name.title = docTiddlerTitle ? `打开文档页：${docLabel}` : `文档页已删除（仅剩摘录/手动内容）`;
        name.addEventListener('click', (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          if (docTiddlerTitle) this.dispatchEvent({ type: 'tm-navigate', navigateTo: docTiddlerTitle });
        });
        sum.appendChild(name);

        sum.appendChild(el(doc, 'span', 'tm-rl-doc-count', `${g.cards.length} 张待读`));
        if (!compact && docAll.length) {
          sum.appendChild(el(doc, 'span', 'tm-rl-doc-prog', `${docDone}/${docAll.length} 节已读`));
          const barWrap = el(doc, 'span', 'tm-stat-bar tm-rl-doc-bar', '');
          const bar = el(doc, 'span', 'tm-stat-bar-fill', '');
          bar.style.width = `${Math.round((docDone / docAll.length) * 100)}%`;
          barWrap.appendChild(bar);
          sum.appendChild(barWrap);
        }

        // 继续阅读跳到第一张"当前可读"卡（scheduler.isDueNow，与 section-bar/doc-resume 一致）；
        // 全部未来排期时退回第一张（允许显式打开）
        const firstUnread = g.cards.find((c) => sched.isDueNow(c.fields)) || g.cards[0];
        const cont = el(doc, 'button', 'tm-btn', '▶ 继续阅读');
        cont.title = '从本组第一张待读卡开始';
        cont.addEventListener('click', (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          this.dispatchEvent({ type: 'tm-navigate', navigateTo: firstUnread.title });
        });
        sum.appendChild(cont);

        // 删除阅读材料（文档页 + 节卡/大纲新节）；摘录/挖空/问答/手动散卡等知识产物保留
        const del = icons.iconButton(doc, 'tm-btn tm-rl-del', 'trash', '清理阅读');
        del.title = '删除本书阅读材料（文档页 + 全部普通节卡）；已提取的知识（摘录/挖空/问答）保留在复习流';
        del.addEventListener('click', async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          if (
            await dialog.confirmDialog(doc, {
              title: '清理阅读材料',
              message: `删除《${docLabel}》的阅读材料？

将删除文档页与全部普通节卡（含大纲手动插入的新节）。
已提取的知识（摘录/挖空/问答/手动卡）会保留，不受影响。
此操作不可恢复。`,
              confirmLabel: '删除',
              danger: true,
            })
          ) {
            const n = docOps.deleteDocContent(wiki, g.doc);
            if (n === 0) await dialog.alertDialog(doc, { message: '没有可删除的阅读材料（本书只剩摘录/知识卡，已全部保留）。' });
          }
        });
        sum.appendChild(del);
        det.appendChild(sum);
        root.appendChild(det);

        // 卡片表格按需渲染：文档组默认折叠，首次展开才建行（大库下省掉不可见 DOM）
        let tableRendered = false;
        const renderTable = () => {
          if (tableRendered) return;
          tableRendered = true;
          // 卡片表格（列式紧凑，避免竖排条目拉长页面；compact 只留 类型/标题 两列）
          const table = el(doc, 'table', 'tm-rl-table');
          const thead = el(doc, 'thead', '');
          const htr = el(doc, 'tr', '');
          htr.appendChild(el(doc, 'th', '', ''));
          htr.appendChild(el(doc, 'th', '', '卡片'));
          if (!compact) {
            htr.appendChild(el(doc, 'th', '', '优先'));
            htr.appendChild(el(doc, 'th', '', '状态'));
          }
          thead.appendChild(htr);
          table.appendChild(thead);
          const tbody = el(doc, 'tbody', '');
          for (const c of g.cards) {
            const tr = el(doc, 'tr', 'tm-rl-row');
            const kindTd = el(doc, 'td', '', '');
            const mark = el(doc, 'span', c.kind === 'extract' ? 'tm-rl-kind tm-rl-kind-extract' : 'tm-rl-kind', c.kind === 'extract' ? '摘' : '节');
            mark.title = c.kind === 'extract' ? '摘录卡（阅读材料）' : '节卡（阅读单元）';
            kindTd.appendChild(mark);
            tr.appendChild(kindTd);

            const titleTd = el(doc, 'td', '', '');
            const titleLink = el(doc, 'a', 'tc-tiddlylink tm-rl-title', display.displayTitle(c.fields, c.title));
            titleLink.href = '#';
            titleLink.title = '打开阅读';
            titleLink.addEventListener('click', (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              this.dispatchEvent({ type: 'tm-navigate', navigateTo: c.title });
            });
            titleTd.appendChild(titleLink);
            tr.appendChild(titleTd);

            if (!compact) {
              const priTd = el(doc, 'td', 'tm-rl-pri', `P${c.priority}`);
              priTd.title = `优先级 ${c.priority}（0 最高）`;
              tr.appendChild(priTd);
              const dueTd = el(doc, 'td', '', '');
              // 状态徽章统一走 core/display.badgeOf（本页已过滤 done/suspended，无 ✓/⏸ 分支）
              const bd = badgeOf(c.fields);
              dueTd.appendChild(el(doc, 'span', `tm-badge ${bd.cls}`, bd.text));
              tr.appendChild(dueTd);
            }

            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
          const scrollBox = el(doc, 'div', 'tm-scroll');
          scrollBox.appendChild(table);
          det.appendChild(scrollBox);
        };
        if ((det as any).open) renderTable();
        else det.addEventListener('toggle', () => { if ((det as any).open) renderTable(); });
      }
"""
s = s[:start] + correct + s[end:]
open(f, "w", encoding="utf-8", newline="").write(s)

# today.ts：最近阅读进度聚合（单次扫描）——两个 widget 的 refresh 均改为合并重建
f = "src/tidme/review/widgets/today.ts"
s = open(f, encoding="utf-8", newline="").read()
old = """      const docs = wiki.filterTiddlers('[tag[tidme-import-doc]]');
      const rows: { title: string; label: string; done: number; total: number; last: number }[] = [];
      for (const d of docs) {
        const docId = wiki.getTiddler(d)?.fields['tidme.doc'];
        if (!docId) continue;
        const secs = wiki.filterTiddlers(`[tidme.doc[${docId}]tidme.kind[topic]!tidme.subkind[extract]]`);
        const total = secs.length;
        if (!total) continue;
        const done = secs.filter((t: string) => sched.isCardDone(wiki.getTiddler(t)?.fields)).length;
        const f = wiki.getTiddler(d)?.fields || {};
        rows.push({ title: d, label: display.displayTitle(f, d), done, total, last: lastOpen(String(docId)) });
      }"""
new = """      const docs = wiki.filterTiddlers('[tag[tidme-import-doc]]');
      const progress = docOps.sectionsProgressByDoc(wiki);
      const rows: { title: string; label: string; done: number; total: number; last: number }[] = [];
      for (const d of docs) {
        const docId = String(wiki.getTiddler(d)?.fields['tidme.doc'] || '');
        if (!docId) continue;
        const prog = progress.get(docId);
        if (!prog || !prog.total) continue;
        const f = wiki.getTiddler(d)?.fields || {};
        rows.push({ title: d, label: display.displayTitle(f, d), done: prog.done, total: prog.total, last: lastOpen(docId) });
      }"""
assert s.count(old) == 1, f"today rows: {s.count(old)}"
s = s.replace(old, new)
old2 = """      const need = reactive.hasRelevantChange(this.wiki, changedTiddlers);
      if (need) this.build();
      return need;"""
assert s.count(old2) == 2, f"today refresh: {s.count(old2)}"
s = s.replace(old2, """      // 反馈条读牌组日志（宽谓词）；重建合并到宏任务（评分链路连写 4+ tiddler）
      const need = reactive.hasRelevantChange(this.wiki, changedTiddlers);
      if (need) return reactive.rebuildSoon(() => this.build());
      return need;""")
open(f, "w", encoding="utf-8", newline="").write(s)
print("ok: reading-list region fixed + today.ts patched")
