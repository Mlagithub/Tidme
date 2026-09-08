/*
widgets/card-viewer.ts — 统一卡片学习交互引擎
接管复习卡片的翻转状态、按键监听、评分流转与学习数据展示。
*/

declare function require(module: string): any;
const Widget = require('$:/core/modules/widgets/widget.js').widget;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const session = require('$:/plugins/keepone/tidme/core/session.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
function lingo(wiki: any, key: string, fallback: string): string {
  return lingoMod ? lingoMod.lingo(wiki, key, fallback) : fallback;
}
const fsrs = require('$:/plugins/keepone/tidme/core/fsrs.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const stats = require('$:/plugins/keepone/tidme/core/stats.js');

const el = dom.el;

/** 相对时间可读格式化 */
function formatRelativeTime(targetDate: Date, now = new Date()): string {
  const diffSec = Math.round((targetDate.getTime() - now.getTime()) / 1000);
  if (diffSec <= 0) return 'now';
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  const diffYears = Math.round(diffDays / 365);
  return `${diffYears}y`;
}

/** 预测四档评分下次复习时间 */
function getPredictedIntervals(cardFields: Record<string, any>, p?: string): Record<string, string> {
  try {
    const jsonStr = fsrs.repeat(cardFields, { p });
    const data = JSON.parse(jsonStr);
    const now = new Date();
    const result: Record<string, string> = { Again: '', Hard: '', Good: '', Easy: '' };
    const ratings = ['Again', 'Hard', 'Good', 'Easy'];
    for (const r of ratings) {
      const key = data.Rating?.[r] ?? r;
      const card = data.Cards?.[key]?.card;
      if (card && card.due) {
        const dueDate = schema.parseTwDate(card.due);
        result[r] = formatRelativeTime(dueDate, now);
      }
    }
    return result;
  } catch {
    return { Again: '', Hard: '', Good: '', Easy: '' };
  }
}

function makeCardViewer(): any {
  class CardViewerWidget extends Widget {
    cardTitle: string = '';
    deckTitle: string = '';
    _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    _container: HTMLElement | null = null;
    _startTime: number = 0;

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      this._startTime = Date.now();

      this.cardTitle = this.getAttribute('tiddler') ||
        this.getVariable('studyTiddler') ||
        this.getVariable('currentTiddler') || '';

      this.deckTitle = this.getAttribute('deck') ||
        this.getVariable('deckTiddler') ||
        deckMod.DEFAULT_DECK;

      const doc = this.document;
      const root = el(doc, 'div', 'tm-card-viewer');
      this._container = root;
      this.domNodes.push(root);
      parent.insertBefore(root, nextSibling);

      this.unbindKeyboard();
      this.build();
      this.bindKeyboard();
    }

    execute() {
      // 构造子 widget 供折叠展开渲染
      this.makeChildWidgets();
    }

    isFolded(): boolean {
      const foldState = this.wiki.getTiddlerText(ns.FOLDED_STATE_PREFIX + this.cardTitle);
      return foldState !== 'show';
    }

    toggleFold() {
      const current = this.isFolded();
      const nextState = current ? 'show' : 'hide';
      this.wiki.addTiddler({
        title: ns.FOLDED_STATE_PREFIX + this.cardTitle,
        text: nextState,
      });
      this.build();
    }

    build() {
      const root = this._container;
      if (!root) return;
      root.textContent = '';
      const doc = this.document;
      const f = this.wiki.getTiddler(this.cardTitle)?.fields || {};
      const folded = this.isFolded();

      // 1. 顶部状态横幅与翻转按钮
      const header = el(doc, 'div', 'tm-card-viewer-header');
      const badgeInfo = display.badgeOf(f);
      const badge = el(doc, 'span', `tm-badge ${badgeInfo.cls}`, badgeInfo.text);
      header.appendChild(badge);

      const deckCaption = display.displayTitle(this.wiki.getTiddler(this.deckTitle)?.fields, this.deckTitle);
      const deckName = el(doc, 'span', 'tm-card-viewer-deck', deckCaption);
      header.appendChild(deckName);

      const bannerBtn = el(
        doc,
        'button',
        'tm-btn tm-card-fold-banner' + (folded ? ' is-folded' : ' is-expanded'),
        folded ? lingo(this.wiki, 'viewer.showanswer', 'Show Answer (Space)') : lingo(this.wiki, 'viewer.hideanswer', 'Hide Answer (Space)'),
      );
      bannerBtn.type = 'button';
      bannerBtn.addEventListener('click', () => this.toggleFold());
      header.appendChild(bannerBtn);
      root.appendChild(header);

      // 2. 正文区域
      const body = el(doc, 'div', 'tm-card-viewer-body');
      if (folded) {
        // 问题态：优先显示 caption
        const qBox = el(doc, 'div', 'tm-card-viewer-question');
        const cap = f.caption ? String(f.caption) : lingo(this.wiki, 'viewer.nocaption', '(No caption, view text)');
        qBox.textContent = cap;
        body.appendChild(qBox);
      } else {
        // 答案态：展开完整内容
        const aBox = el(doc, 'div', 'tm-card-viewer-answer');
        // 若定义了子 widget，直接装配子级 DOM
        this.renderChildren(aBox, null);
        if (aBox.childNodes.length === 0) {
          // 兜底纯文本显示
          aBox.textContent = String(f.text || f.caption || '');
        }
        body.appendChild(aBox);
      }
      root.appendChild(body);

      // 3. 底部评分控制条（展开态提供评分按钮）
      const footer = el(doc, 'div', 'tm-card-viewer-footer');
      const df = this.wiki.getTiddler(this.deckTitle)?.fields || {};
      const intervals = getPredictedIntervals(f, df.p);

      const ratingsConfig = [
        { key: 'Again', label: lingo(this.wiki, 'rate.again', 'Again') + ' (1)', cls: 'tm-btn--again', color: 'var(--tm-danger, #ef4444)' },
        { key: 'Hard', label: lingo(this.wiki, 'rate.hard', 'Hard') + ' (2)', cls: 'tm-btn--hard', color: 'var(--tm-warning, #f59e0b)' },
        { key: 'Good', label: lingo(this.wiki, 'rate.good', 'Good') + ' (3)', cls: 'tm-btn--good', color: 'var(--tm-success, #10b981)' },
        { key: 'Easy', label: lingo(this.wiki, 'rate.easy', 'Easy') + ' (4)', cls: 'tm-btn--easy', color: 'var(--tm-accent, #3b82f6)' },
      ];

      const btnGrid = el(doc, 'div', 'tm-card-viewer-ratings');
      for (const r of ratingsConfig) {
        const btn = el(doc, 'button', `tm-btn ${r.cls}`);
        btn.type = 'button';
        btn.disabled = folded; // 折叠态下不可评分，避免盲评
        if (folded) btn.classList.add('is-disabled');

        const titleSpan = el(doc, 'span', 'tm-rating-title', r.label);
        const timeSpan = el(doc, 'span', 'tm-rating-time', intervals[r.key] || '—');
        btn.appendChild(titleSpan);
        btn.appendChild(timeSpan);

        btn.addEventListener('click', () => {
          this.rateCard(r.key);
        });
        btnGrid.appendChild(btn);
      }
      footer.appendChild(btnGrid);

      // 4. 统计数据详情
      const details = el(doc, 'details', 'tm-card-stats');
      const summary = el(doc, 'summary', '', lingo(this.wiki, 'viewer.stats', '📊 Study Data & Metrics'));
      details.appendChild(summary);

      const grid = el(doc, 'div', 'tm-card-stats-grid');
      const addStat = (label: string, val: string | number) => {
        const row = el(doc, 'div', 'tm-stat-item');
        const k = el(doc, 'strong', '', `${label}: `);
        const v = el(doc, 'span', '', String(val));
        row.appendChild(k);
        row.appendChild(v);
        grid.appendChild(row);
      };

      addStat(lingo(this.wiki, 'col.state', 'State'), display.stateLabel(f));
      addStat(lingo(this.wiki, 'col.due', 'Due'), display.dueLabel(f));
      addStat(lingo(this.wiki, 'col.interval', 'Interval'), display.intervalLabel(f));
      addStat(lingo(this.wiki, 'field.stability', 'Stability'), f.stability ? String(f.stability) : '—');
      addStat(lingo(this.wiki, 'col.diff', 'Difficulty'), display.diffLabel(f));
      addStat(lingo(this.wiki, 'col.reps', 'Reps'), display.repsLabel(f));
      addStat(lingo(this.wiki, 'col.lapses', 'Lapses'), display.lapsesLabel(f));
      addStat(lingo(this.wiki, 'col.priority', 'Priority'), `p${sched.normalizePriority(f['tidme.priority'])}`);

      details.appendChild(grid);
      footer.appendChild(details);
      root.appendChild(footer);
    }

    bindKeyboard() {
      const doc = this.document;
      if (!doc || typeof doc.addEventListener !== 'function') return;

      this._keyHandler = (e: KeyboardEvent) => {
        // 避免在输入框输入时拦截按键
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName ? target.tagName.toUpperCase() : '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
            return;
          }
        }

        const key = e.key;
        if (key === ' ' || e.code === 'Space') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (this.isFolded()) {
            this.toggleFold();
          } else {
            this.rateCard('Good');
          }
        } else if (!this.isFolded()) {
          if (key === '1') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            this.rateCard('Again');
          } else if (key === '2') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            this.rateCard('Hard');
          } else if (key === '3') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            this.rateCard('Good');
          } else if (key === '4') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            this.rateCard('Easy');
          }
        }
      };

      doc.addEventListener('keydown', this._keyHandler);
    }

    unbindKeyboard() {
      if (this._keyHandler && this.document && typeof this.document.removeEventListener === 'function') {
        this.document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
      }
    }

    /**
     * 核心评分执行流
     */
    rateCard(rating: string) {
      const wiki = this.wiki;
      const f = wiki.getTiddler(this.cardTitle)?.fields;
      if (!f) return;

      const df = wiki.getTiddler(this.deckTitle)?.fields || {};
      let targetData: any = null;

      try {
        const jsonStr = fsrs.repeat(f, { p: df.p });
        const parsed = JSON.parse(jsonStr);
        const ratingKey = parsed.Rating?.[rating] ?? rating;
        targetData = parsed.Cards?.[ratingKey];
      } catch {
        targetData = null;
      }

      if (!targetData || !targetData.card) return;

      // 1. 写回卡片 FSRS 字段
      const patch = { ...targetData.card };
      wiki.addTiddler({ ...f, ...patch });

      // 2. 写回 deck log 与专注时长记录
      if (this._startTime) {
        const elapsedSec = (Date.now() - this._startTime) / 1000;
        this._startTime = Date.now();
        const sec = Math.max(1, Math.min(300, Math.round(elapsedSec)));
        const docId = String(f['tidme.doc'] || '');
        if (stats && typeof stats.recordReadTime === 'function') {
          stats.recordReadTime(wiki, docId, sec);
        }
      }
      const logTitle = `${this.deckTitle}/log`;
      const nowTw = schema.twDateString(new Date());
      wiki.setText(logTitle, null, nowTw, JSON.stringify(targetData.review_log));

      // 3. 动态优先级调整
      const pDelta = sched.priorityDeltaForRating(rating);
      const curP = sched.normalizePriority(f['tidme.priority']);
      const newP = Math.max(0, Math.min(100, curP + pDelta));
      wiki.setText(this.cardTitle, 'tidme.priority', null, String(newP));

      // 4. 更新学习会话列表
      const sess = wiki.getTiddler(session.SESSION_TIDDLER);
      let list: string[] = Array.isArray(sess?.fields.list) ? [...sess.fields.list] : [];
      list = list.filter((t) => t !== this.cardTitle);
      if (rating === 'Again') {
        list.push(this.cardTitle);
      }
      wiki.addTiddler({ ...(sess?.fields || { title: session.SESSION_TIDDLER }), list });

      // 5. 清理折叠标记
      wiki.deleteTiddler(ns.FOLDED_STATE_PREFIX + this.cardTitle);

      // 6. 关闭当前卡并切换
      dom.closeTiddler(this, this.cardTitle);

      if (list.length > 0) {
        const next = list[0];
        docOps.prepareCardFold(wiki, next);
        dom.navigateTo(this, next);
      } else {
        this.dispatchEvent({ type: 'tm-confetti-launch' });
        dom.notify(this, ns.NOTIFY_CONGRATULATION);
        dom.navigateTo(this, ns.PAGE_TODAY);
      }
    }

    refresh(changedTiddlers: Record<string, any>): boolean {
      const changed = Object.keys(changedTiddlers || {});
      const myFoldState = ns.FOLDED_STATE_PREFIX + this.cardTitle;
      if (changed.includes(this.cardTitle) || changed.includes(myFoldState) || changed.includes(this.deckTitle)) {
        this.build();
        return true;
      }
      return this.refreshChildren(changedTiddlers);
    }

    removeChildDomNodes() {
      this.unbindKeyboard();
      super.removeChildDomNodes?.();
    }

    destroy() {
      this.unbindKeyboard();
      super.destroy?.();
    }
  }

  return CardViewerWidget as any;
}

exports['tidme-card-viewer'] = makeCardViewer();
