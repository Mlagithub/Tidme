/*
manager/widgets/deck-ui.ts — 牌组 UI 组件（与今天页 tm 风格统一）

- <$deck-create/> ：「＋ 新建牌组」折叠表单 —— 名称/显示名/成员来源（自定义过滤器
  或全库测试卡）+ 成员实时预览（命中数/跨牌组重叠）→ core/deck.createDeck
  （数据层唯一入口）；成功即打开新牌组。
- <$deck-delete deck="<完整标题>"/>：确认删除牌组（默认仅删容器、卡保留；
  subset 提供连卡选项）→ core/deck.deleteDeck。
编辑参数仍走原有 牌组「选项」弹窗（modal/options，字段级 + default 继承）。
*/

declare function require(module: string): any;
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const deckEngine = require('$:/plugins/keepone/tidme/core/deck-engine.js');
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
      const summary = el(doc, 'summary', 'tm-btn tm-btn--primary', '＋ 新建牌组');
      details.appendChild(summary);

      const form = el(doc, 'div', 'tm-dashboard-card tm-decks-create-form');
      form.style.cssText = 'margin:6px 0 0;padding:10px 14px;';
      const rowOf = (label: string, input: HTMLElement) => {
        const r = el(doc, 'div', 'tm-decks-create-row');
        r.style.cssText = 'display:flex;gap:8px;align-items:center;margin:4px 0;flex-wrap:wrap;';
        r.appendChild(el(doc, 'span', 'tm-import-muted', label));
        r.appendChild(input);
        return r;
      };
      const nameIn = doc.createElement('input');
      nameIn.className = 'tm-input';
      nameIn.placeholder = '名称，如 六级词汇';
      const capIn = doc.createElement('input');
      capIn.className = 'tm-input';
      capIn.placeholder = '显示名（留空 = 名称）';
      const srcSel = doc.createElement('select');
      srcSel.className = 'tm-input';
      for (const [v, l] of [['custom', '自定义过滤器'], ['item', '全库测试卡（与默认牌组相同，通常无需另建）']] as const) {
        const o = doc.createElement('option');
        o.value = v;
        o.textContent = l;
        srcSel.appendChild(o);
      }
      const customIn = doc.createElement('textarea');
      customIn.className = 'tm-input';
      customIn.rows = 2;
      customIn.value = deckMod.DEFAULT_CARD_FILTER || '';
      srcSel.addEventListener('change', () => {
        customIn.style.display = srcSel.value === 'custom' ? '' : 'none';
      });
      form.appendChild(rowOf('名称', nameIn));
      form.appendChild(rowOf('显示名', capIn));
      form.appendChild(rowOf('成员来源', srcSel));
      form.appendChild(rowOf('过滤器', customIn));
      // 成员预览：创建前即可看到命中数与跨牌组重叠（牌组是筛选视图，同一张卡
      // 会出现在所有匹配它的牌组里、进度共享——重叠是正常现象，但要可见）
      const preview = el(doc, 'div', 'tm-decks-preview', '');
      form.appendChild(preview);
      let previewTimer: any = null;
      const updatePreview = () => {
        const card = srcSel.value === 'custom' ? customIn.value.trim() : deckMod.DEFAULT_CARD_FILTER || '';
        const r = deckMod.previewMembership(wiki, card);
        preview.textContent = r.hits < 0
          ? '过滤器暂无法求值（请检查语法）'
          : `命中 ${r.hits} 张在队测试卡` +
            (r.overlap > 0 ? `，其中 ${r.overlap} 张也与其它牌组匹配（进度共享，不会重复复习）` : '，与其它牌组无重叠');
      };
      srcSel.addEventListener('change', updatePreview);
      customIn.addEventListener('input', () => {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updatePreview, 250);
      });
      updatePreview();
      const btnRow = el(doc, 'div', 'tm-decks-create-actions');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
      const ok = el(doc, 'button', 'tm-btn tm-btn--primary', '✔ 创建');
      const cancel = el(doc, 'button', 'tm-btn', '取消');
      ok.addEventListener('click', () => {
        const name = nameIn.value.trim();
        if (!name) {
          toastIn(wrap, doc, '请输入牌组名称', 'err');
          return;
        }
        try {
          const title = deckMod.createDeck(wiki, {
            name,
            caption: capIn.value.trim() || undefined,
            card: srcSel.value === 'custom' ? (customIn.value.trim() || undefined) : undefined,
          });
          details.open = false;
          toastIn(wrap, doc, `✔ 已创建「${name}」，可点行内「选项」配置参数`, 'ok');
          navigateTo(this, title);
        } catch (e: any) {
          toastIn(wrap, doc, '创建失败：' + String(e?.message || e), 'err');
        }
      });
      cancel.addEventListener('click', () => {
        details.open = false;
      });
      btnRow.appendChild(ok);
      btnRow.appendChild(cancel);
      form.appendChild(btnRow);
      details.appendChild(form);
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
      const label = this.getAttribute('label', '删除牌组');
      const btn = el(doc, 'button', 'tm-btn tm-btn--danger', label);
      btn.title = '删除牌组定义（成员卡保留，仍由默认牌组复习）';
      const d = deckTitle ? deckMod.getDeck(wiki, deckTitle) : null;
      if (!d) {
        btn.setAttribute('disabled', 'true');
        btn.title = '牌组不存在';
      } else if (d.title === deckMod.DEFAULT_DECK) {
        btn.setAttribute('disabled', 'true');
        btn.title = '默认牌组不可删除';
      }
      btn.addEventListener('click', async () => {
        if (!deckTitle || !d) return;
        const subset = deckMod.isSubset(d);
        let also = false;
        if (subset) {
          also = await dialog.confirmDialog(doc, {
            title: '子集牌组',
            message: `《${captionText(wiki, d.fields.caption || d.name, this) || d.name}》是子集牌组。
连成员卡一起删除？
（确定 = 连卡删；取消 = 仅删牌组定义）`,
            confirmLabel: '连卡删',
            danger: true,
          });
        }
        const msg = subset
          ? `删除子集牌组${also ? '及其成员卡' : '（卡片保留）'}？`
          : `删除牌组「${captionText(wiki, d.fields.caption || d.name, this) || d.name}」的定义？\n成员卡会保留（挖空/问答卡仍由默认牌组收录）。`;
        if (!(await dialog.confirmDialog(doc, { title: '删除牌组', message: msg, confirmLabel: '删除', danger: true }))) return;
        try {
          const n = deckMod.deleteDeck(wiki, deckTitle, { alsoCards: also });
          closeTiddler(this);
          notify(this, also ? `已删除牌组及 ${n} 张成员卡` : '✔ 已删除牌组（卡片保留）');
        } catch (e: any) {
          await dialog.alertDialog(doc, { title: '删除失败', message: String((e as any)?.message || e) });
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

        const lLearn = wiki.getTiddlerText('$:/language/tidme/learn') || '学习';
        const lDue = wiki.getTiddlerText('$:/language/tidme/due') || '到期';
        const lNew = wiki.getTiddlerText('$:/language/tidme/new') || '新卡';

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
exports['tidme-deck-badges'] = makeDeckBadges();
