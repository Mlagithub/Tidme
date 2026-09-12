const { lingo } = require('$:/plugins/keepone/tidme/core/lingo.js');
/*
manager/widgets/deck-ui.ts — 牌组 UI 组件（与今天页 tm 风格统一）

- <$deck-create/> ：「＋ 新建牌组」折叠表单 —— 名称/显示名/成员来源（自定义过滤器
  或全库测试卡）+ 成员实时预览（命中数/跨牌组重叠）→ core/deck.createDeck
  （数据层唯一入口）；成功即打开新牌组。
- <$deck-delete deck="<完整标题>"/>：确认删除牌组（默认仅删容器、卡保留；
  subset 提供连卡选项）→ core/deck.deleteDeck。
- <$deck-fsrs-save/>：牌组「选项」弹窗保存链前置动作——把弹窗友好输入合并进
  temp 的 p JSON（core/config.mergeDeckPJson），落库仍走原生 temp → 牌组覆写。
编辑参数仍走原有 牌组「选项」弹窗（modal/options，字段级 + default 继承）。
*/

declare function require(module: string): any;
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const deckEngine = require('$:/plugins/keepone/tidme/core/deck-engine.js');
const configMod = require('$:/plugins/keepone/tidme/core/config.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const dialog = require('$:/plugins/keepone/tidme/ui/base/dialog.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;
const showToast = dom.showToast;
const navigateTo = dom.navigateTo;
const closeTiddler = dom.closeTiddler;
const notify = dom.notify;
const captionText = display.captionText;

function toastIn(wrap: HTMLElement, doc: Document, msg: string, kind: '' | 'ok' | 'err' = '') {
  showToast(doc, wrap, msg, kind, 3000);
}

/** ＋ 新建牌组 */
function makeDeckCreate(): WidgetCtor {
  class DeckCreateWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const wrap = el(doc, 'div', 'tm-decks-create');

      const details = el(doc, 'details', 'tm-decks-create-box');
      const summary = el(doc, 'summary', 'tm-btn tm-btn--primary', lingo(wiki, 'deck.create', '+ New Deck'));
      details.appendChild(summary);

      // 表单复用设置页的 tm-setting 行结构（标签左、控件右；宽输入上下排），
      // 展开态由 wrap 上的 tm-decks-create--open 驱动 CSS 占满整行（见 styles）
      const form = el(doc, 'div', 'tm-setting-card tm-decks-create-form');
      const rowOf = (label: string, control: HTMLElement, stack = false) => {
        const row = el(doc, 'div', 'tm-setting-row' + (stack ? ' tm-setting-row--stack' : ''));
        const info = el(doc, 'div', 'tm-setting-info');
        info.appendChild(el(doc, 'div', 'tm-setting-title', label));
        row.appendChild(info);
        const ctl = el(doc, 'div', 'tm-setting-control');
        ctl.appendChild(control);
        row.appendChild(ctl);
        return row;
      };
      const nameIn = doc.createElement('input');
      nameIn.className = 'tm-input';
      nameIn.placeholder = lingo(wiki, 'deck.name.placeholder', 'Name, e.g. Vocabulary');
      const capIn = doc.createElement('input');
      capIn.className = 'tm-input';
      capIn.placeholder = lingo(wiki, 'deck.caption.placeholder', 'Caption (leave blank to use name)');
      const srcSel = doc.createElement('select');
      srcSel.className = 'tm-select';
      for (
        const [v, l] of [['custom', lingo(wiki, 'deck.src.custom', 'Custom Filter')], [
          'item',
          lingo(wiki, 'deck.src.item', 'All Knowledge Cards (same as the global queue, usually no need)'),
        ]] as const
      ) {
        const o = doc.createElement('option');
        o.value = v;
        o.textContent = l;
        srcSel.appendChild(o);
      }
      const customIn = doc.createElement('textarea');
      customIn.className = 'tm-textarea';
      customIn.rows = 3;
      customIn.value = deckMod.DEFAULT_CARD_FILTER || '';
      srcSel.addEventListener('change', () => {
        customIn.style.display = srcSel.value === 'custom' ? '' : 'none';
      });
      form.appendChild(rowOf(lingo(wiki, 'col.title', 'Name'), nameIn));
      form.appendChild(rowOf(lingo(wiki, 'deck.caption', 'Caption'), capIn));
      form.appendChild(rowOf(lingo(wiki, 'deck.membersrc', 'Member Source'), srcSel));
      form.appendChild(rowOf(lingo(wiki, 'deck.filter', 'Filter'), customIn, true));
      // 成员预览：创建前即可看到命中数与跨牌组重叠（牌组是筛选视图，同一张卡
      // 会出现在所有匹配它的牌组里、进度共享——重叠是正常现象，但要可见）
      const preview = el(doc, 'div', 'tm-decks-preview', '');
      form.appendChild(preview);
      let previewTimer: any = null;
      const updatePreview = () => {
        const card = srcSel.value === 'custom' ? customIn.value.trim() : deckMod.DEFAULT_CARD_FILTER || '';
        const r = deckMod.previewMembership(wiki, card);
        preview.textContent = r.hits < 0
          ? lingo(wiki, 'deck.filter.error', 'Filter evaluation failed (check syntax)')
          : `${r.hits} ${lingo(wiki, 'deck.hits', 'cards matched')}` +
            (r.overlap > 0 ? ` (${r.overlap} ${lingo(wiki, 'deck.overlap', 'overlap with other decks')})` : '');
      };
      srcSel.addEventListener('change', updatePreview);
      customIn.addEventListener('input', () => {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updatePreview, 250);
      });
      updatePreview();
      const btnRow = el(doc, 'div', 'tm-decks-create-actions');
      const ok = el(doc, 'button', 'tm-btn tm-btn--primary', lingo(wiki, 'action.create', '✔ Create'));
      const cancel = el(doc, 'button', 'tm-btn', lingo(wiki, 'action.cancel', 'Cancel'));
      ok.addEventListener('click', () => {
        const name = nameIn.value.trim();
        if (!name) {
          toastIn(wrap, doc, lingo(wiki, 'deck.name.empty', 'Please enter a deck name'), 'err');
          return;
        }
        try {
          const title = deckMod.createDeck(wiki, {
            name,
            caption: capIn.value.trim() || undefined,
            card: srcSel.value === 'custom' ? (customIn.value.trim() || undefined) : undefined,
          });
          details.open = false;
          toastIn(wrap, doc, `${lingo(wiki, 'deck.created', '✔ Created')} "${name}"`, 'ok');
          navigateTo(this, title);
        } catch (e: any) {
          toastIn(wrap, doc, lingo(wiki, 'deck.create.failed', 'Creation failed:') + ' ' + String(e?.message || e), 'err');
        }
      });
      cancel.addEventListener('click', () => {
        details.open = false;
      });
      btnRow.appendChild(ok);
      btnRow.appendChild(cancel);
      form.appendChild(btnRow);
      details.appendChild(form);
      details.addEventListener('toggle', () => {
        wrap.classList.toggle('tm-decks-create--open', details.open);
      });
      wrap.appendChild(details);

      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }
    refresh() {
      return false;
    }
  }
  return DeckCreateWidget as any;
}

/** <$deck-fsrs-save/>：牌组选项弹窗「保存」的前置动作。把弹窗友好输入（temp 字段
 *  request_retention_pct / maximum_interval）合并进 temp 的 p JSON，真正落库仍由随后的
 *  原生 action-createtiddler（temp → 牌组整体覆写）完成。量纲换算与 clamp 都在
 *  core/config.mergeDeckPJson；两键都未填或没产生变化时是 no-op（helper 字段仍会清理，
 *  避免覆写把杂散字段落到牌组 tiddler 上）。Cancel（删 temp）不留任何痕迹。 */
function makeDeckFsrsSave(): WidgetCtor {
  class DeckFsrsSaveAction extends Widget {
    render() {
      this.computeAttributes();
    }

    refresh() {
      return false;
    }

    invokeAction() {
      const TEMP = '$:/temp/tidme/options';
      const fields = this.wiki.getTiddler(TEMP)?.fields;
      if (!fields) return true;
      const merged = configMod.mergeDeckPJson(fields.p, {
        retentionPct: fields.request_retention_pct,
        maximumInterval: fields.maximum_interval,
      });
      if (merged === null && fields.request_retention_pct === undefined && fields.maximum_interval === undefined) return true;
      const out: Record<string, any> = { ...fields };
      delete out.request_retention_pct;
      delete out.maximum_interval;
      if (merged !== null) out.p = merged;
      this.wiki.addTiddler(out);
      return true; // 后续 action-createtiddler 继续执行
    }
  }
  return DeckFsrsSaveAction as any;
}

/** 确认删除牌组（options 弹窗 footer 用） */
function makeDeckDelete(): WidgetCtor {
  class DeckDeleteWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const deckTitle = String(this.getAttribute('deck', '') || '');
      const label = this.getAttribute('label', lingo(wiki, 'deck.delete', 'Delete Deck'));
      const btn = el(doc, 'button', 'tm-btn tm-btn--danger', label);
      btn.title = lingo(wiki, 'deck.delete.tip', 'Delete deck definition (cards are kept and reviewed in the global queue)');
      const d = deckTitle ? deckMod.getDeck(wiki, deckTitle) : null;
      if (!d) {
        btn.setAttribute('disabled', 'true');
        btn.title = lingo(wiki, 'deck.notfound', 'Deck not found');
      } else if (deckMod.SYSTEM_DECKS.includes(d.title)) {
        btn.setAttribute('disabled', 'true');
        btn.title = lingo(wiki, 'deck.nodeletedefault', 'All Cards (global queue) cannot be deleted');
      }
      btn.addEventListener('click', async () => {
        if (!deckTitle || !d) return;
        const subset = deckMod.isSubset(d);
        let also = false;
        if (subset) {
          also = await dialog.confirmDialog(doc, {
            title: lingo(wiki, 'deck.subset', 'Subset Deck'),
            message: `《${captionText(wiki, d.fields.caption || d.name, this) || d.name}》是子集牌组。
连成员卡一起删除？
（确定 = 连卡删；取消 = 仅删牌组定义）`,
            confirmLabel: lingo(wiki, 'deck.deletecards', 'Delete Cards'),
            danger: true,
          });
        }
        const msg = subset
          ? `删除子集牌组${also ? '及其成员卡' : '（卡片保留）'}？`
          : `删除牌组「${captionText(wiki, d.fields.caption || d.name, this) || d.name}」的定义？\n成员卡会保留（挖空/问答卡仍由全局队列「全部卡片」收录）。`;
        if (
          !(await dialog.confirmDialog(doc, {
            title: lingo(wiki, 'deck.delete', 'Delete Deck'),
            message: msg,
            confirmLabel: lingo(wiki, 'manager.delete', 'Delete'),
            danger: true,
          }))
        ) return;
        try {
          const n = deckMod.deleteDeck(wiki, deckTitle, { alsoCards: also });
          closeTiddler(this);
          notify(
            this,
            also
              ? `${lingo(wiki, 'deck.deletedwithcards', 'Deleted deck and')} ${n} ${lingo(wiki, 'deck.cardscount', 'cards')}`
              : lingo(wiki, 'deck.deletedkeepcards', '✔ Deck deleted (cards kept)'),
          );
        } catch (e: any) {
          await dialog.alertDialog(doc, { title: lingo(wiki, 'action.deletefailed', 'Delete failed'), message: String((e as any)?.message || e) });
        }
      });
      parent.insertBefore(btn, nextSibling);
      this.domNodes.push(btn);
    }
    refresh() {
      return false;
    }
  }
  return DeckDeleteWidget as any;
}

/** 牌组三状态计数徽章组件（学习/到期/新卡） */
function makeDeckBadges(): WidgetCtor {
  class DeckBadgesWidget extends Widget {
    deckTitle: string = '';

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const deckTitle = this.deckTitle;

      const cls = this.getAttribute('class') || 'tm-deck-counts';
      const wrap = el(doc, 'span', cls);

      if (deckTitle) {
        const df = wiki.getTiddler(deckTitle)?.fields || {};
        const f = deckEngine.composeDeckFilters(deckTitle, df);
        const count = (filter: string) => (filter ? wiki.filterTiddlers(filter).length : 0);

        const learnN = count(f.learn);
        const dueN = count(f.due);
        const newN = count(f.newly);

        const lLearn = wiki.getTiddlerText('$:/language/tidme/learn') || 'Learn';
        const lDue = wiki.getTiddlerText('$:/language/tidme/due') || 'Due';
        const lNew = wiki.getTiddlerText('$:/language/tidme/new') || 'New';

        const learnBadge = el(doc, 'span', 'tm-badge tm-badge-learn', `${lLearn}: ${learnN}`);
        const dueBadge = el(doc, 'span', 'tm-badge tm-badge-due', `${lDue}: ${dueN}`);
        const newBadge = el(doc, 'span', 'tm-badge tm-badge-new', `${lNew}: ${newN}`);

        wrap.appendChild(learnBadge);
        wrap.appendChild(doc.createTextNode(' '));
        wrap.appendChild(dueBadge);
        wrap.appendChild(doc.createTextNode(' '));
        wrap.appendChild(newBadge);
      }

      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }

    execute() {
      this.deckTitle = this.getAttribute('deck') || this.getVariable('deckTiddler') || this.getVariable('currentTiddler') || '';
    }

    refresh(changedTiddlers: any) {
      const changed = this.computeAttributes();
      if (changed.deck || Object.keys(changedTiddlers || {}).length > 0) {
        this.refreshSelf();
        return true;
      }
      return false;
    }
  }
  return DeckBadgesWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports['deck-create'] = makeDeckCreate();
exports['deck-delete'] = makeDeckDelete();
exports['deck-fsrs-save'] = makeDeckFsrsSave();
exports['tidme-deck-badges'] = makeDeckBadges();
