/*
widgets/queue-ops.ts — 牌组批量操作

<$queue-ops/> 对每个 TidmeDeck 列出批量动作：
  顺延(7天) / 提前(今天) / 忽略(出队) / 搁置(暂停) / 恢复 / 遗忘(回新卡)
动作基于 core scheduler 纯函数，对 deck.card 过滤出的卡片批量写字段。
事件总线：操作后发 tm-tidme-queue-changed；监听队列变化重建列表（计数保持最新）。
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const primitives = require('$:/plugins/keepone/tidme/ui/components/ui-primitives.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

// 共享 DOM/显示/组件工具（实现收敛于 ui/base/dom、ui/components/ui-primitives、core/display）
const el = dom.el;
const showToast = dom.showToast;
const renderEmpty = primitives.renderEmpty;
const bindWidgetRefresh = primitives.bindWidgetRefresh;
const captionText = display.captionText;

function makeQueueOps(): WidgetCtor {
  class QueueOpsWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const wrap = el(doc, 'div', 'tm-queue-ops');

      const toast = (msg: string, kind: '' | 'ok' | 'err' = '') => showToast(doc, wrap, msg, kind);

      wrap.appendChild(el(doc, 'h3', '', lingoMod.lingo(wiki, 'queueops.title', 'Deck Batch Operations (Priority Scheduling)')));
      wrap.appendChild(
        el(
          doc,
          'div',
          'tm-import-muted',
          lingoMod.lingo(wiki, 'queueops.desc', 'Postpone = due+7d · Advance = review today · Ignore = remove from queue · Suspend = pause · Forget = reset to new'),
        ),
      );

      // 手动触发 auto-postpone（启动与每小时自动执行；开关与参数在「设置」页集中配置）
      const autoRow = el(doc, 'div', 'tm-import-actions', '');
      const autoStatus = el(doc, 'span', 'tm-import-muted', '');
      const lastRun = el(doc, 'div', 'tm-import-muted', '');
      const runAuto = icons.iconButton(doc, 'tm-btn tm-btn--primary', 'zap', lingoMod.lingo(wiki, 'queueops.autopostpone', 'Auto-Postpone Now'));
      runAuto.title = lingoMod.lingo(
        wiki,
        'manager.autopostpone.tip',
        'Manually trigger: postpone low-priority overdue cards by postponeDays, preserving top N high-priority cards',
      );
      runAuto.addEventListener('click', () => {
        const cfg = config.readAutoPostpone(wiki);
        const cards = wiki.filterTiddlers('[all[shadows+tiddlers]!is[draft]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]has[due]]')
          .map((t: string) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
        const result = sched.autoPostpone(cards, cfg);
        for (const p of result.patches) {
          const existing = wiki.getTiddler(p.title);
          if (existing) wiki.addTiddler({ ...existing.fields, ...p.fields });
        }
        autoStatus.textContent = `✓ Overdue: ${result.stats.overdue} · Postponed: ${result.stats.postponed} · Retained: ${result.stats.kept}`;
        renderList();
      });
      autoRow.appendChild(runAuto);
      autoRow.appendChild(autoStatus);
      wrap.appendChild(autoRow);

      // 上次自动顺延记录（启动/每小时任务写入 $:/temp/tidme/autopostpone/last）：
      // 顺延会悄悄改到期日，用户需要能看到"什么时候被顺延过、顺延了多少张"
      const lastRaw = wiki.getTiddlerText?.(ns.AUTOPOSTPONE_LAST_TITLE, '') || '';
      if (lastRaw) {
        try {
          const last = JSON.parse(lastRaw);
          const when = last && last.at ? String(last.at).replace('T', ' ').replace(/\..*$/, '') : '';
          lastRun.textContent = `${lingoMod.lingo(wiki, 'queueops.lastrun', 'Last run:')} ${when} · ${lingoMod.lingo(wiki, 'queueops.postponed', 'Postponed')} ${
            Number(last && last.postponed) || 0
          }`;
        } catch {
          lastRun.textContent = '';
        }
      }
      wrap.appendChild(lastRun);

      const list = el(doc, 'div', 'tm-queue-ops-list');
      wrap.appendChild(list);

      const renderList = () => {
        list.textContent = '';
        const decks = deckMod.listDecks(wiki);
        if (!decks.length) {
          list.appendChild(renderEmpty(doc, { text: lingoMod.lingo(wiki, 'manager.nodecks', 'No decks found.'), icon: '🃏' }));
          return;
        }
        for (const deck of decks) {
          const cards = deckMod.deckCards(wiki, deck);
          // 每牌组一张卡片（名称 + 计数 + 动作组）
          const card = el(doc, 'div', 'tm-queue-card');
          const head = el(doc, 'div', 'tm-queue-card-head');
          const caption = captionText(wiki, wiki.getTiddler(deck)?.fields?.caption || deck.split('/').pop() || deck, this);
          head.appendChild(el(doc, 'strong', '', caption));
          head.appendChild(el(doc, 'span', 'tm-queue-card-count', `${cards.length} cards`));
          head.title = deck;
          card.appendChild(head);
          const btns = el(doc, 'div', 'tm-queue-card-btns');
          const apply = (op: (f: Record<string, any>) => Record<string, any>, label: string) => {
            const b = el(doc, 'button', 'tm-btn', label);
            b.addEventListener('click', () => {
              let n = 0;
              for (const title of cards) {
                const t = wiki.getTiddler(title);
                if (!t) continue;
                wiki.addTiddler({ ...t.fields, ...op(t.fields) });
                n++;
              }
              renderList();
              toast(`${label}: processed ${n} cards`, 'ok');
            });
            return b;
          };
          btns.appendChild(apply((f) => sched.postponeCard(f, 7), lingoMod.lingo(wiki, 'manager.postpone7d', 'Postpone 7d')));
          btns.appendChild(apply(() => sched.advanceCard(), lingoMod.lingo(wiki, 'manager.advance', 'Advance')));
          btns.appendChild(apply(() => sched.ignoreCard(), lingoMod.lingo(wiki, 'read.ignore', 'Ignore')));
          btns.appendChild(apply(() => sched.suspendCard(), lingoMod.lingo(wiki, 'manager.suspend', 'Suspend')));
          btns.appendChild(apply(() => sched.resumeCard(), lingoMod.lingo(wiki, 'manager.restore', 'Restore')));
          btns.appendChild(apply(() => sched.forgetCard(), lingoMod.lingo(wiki, 'manager.forget', 'Forget')));
          card.appendChild(btns);
          list.appendChild(card);
        }
      };
      renderList();

      this._renderList = renderList;

      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }
    refresh(changedTiddlers: Record<string, any>) {
      return bindWidgetRefresh(this, changedTiddlers, () => this._renderList?.());
    }
  }
  return QueueOpsWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports['queue-ops'] = makeQueueOps();
