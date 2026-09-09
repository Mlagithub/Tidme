/*
widgets/today.ts — 「今天」主入口页组件

产品定位：打开今天 = 回答"现在该做什么"。
- today-hero：双主 CTA（开始学习 / 继续阅读）+ 今日反馈条（复习卡数/专注时长）。
  数据全部来自 core（deck-engine 计数、scheduler.TOPIC_QUEUE_FILTER、workflow 目标、
  stats 今日统计）；点击只调 core action，不复制任何调度逻辑。
- today-recent：最近阅读（有节卡进度且未读完的文档，前 3 本），进度条 + 继续。
刷新：唯一机制（TW 原生 refresh 嗅探 + core/reactive 谓词）。
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const stats = require('$:/plugins/keepone/tidme/core/stats.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const deckEngine = require('$:/plugins/keepone/tidme/core/deck-engine.js');
const workflow = require('$:/plugins/keepone/tidme/review/widgets/workflow.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
function lingo(wiki: any, key: string, fallback: string): string {
  return lingoMod ? lingoMod.lingo(wiki, key, fallback) : fallback;
}
const primitives = require('$:/plugins/keepone/tidme/ui/components/ui-primitives.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;
const navigateTo = dom.navigateTo;
const bindWidgetRefresh = primitives.bindWidgetRefresh;

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

/** 今日复习卡数：遍历全部牌组日志单文件，按今天的日期前缀计数（契约见 core/ns） */
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
}

/** 待学数（全局学习队列 = learn+due+new）与待读数（topic 在队） */
function todayCounts(wiki: any): { learn: number; due: number; newly: number; toRead: number } {
  const f = deckEngine.composeDeckFilters(deckMod.DEFAULT_DECK);
  const count = (filter: string) => wiki.filterTiddlers(filter).length;
  return {
    learn: count(f.learn),
    due: count(f.due),
    newly: count(f.newly),
    toRead: count(sched.TOPIC_QUEUE_FILTER),
  };
}

// ---------- today-hero：双 CTA + 今日反馈条 ----------

function makeTodayHero(): WidgetCtor {
  class TodayHeroWidget extends Widget {
    _container: HTMLElement | null = null;

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      this._container = el(this.document, 'div', 'tm-today-hero');
      parent.insertBefore(this._container, nextSibling);
      this.domNodes.push(this._container);
      this.build();
    }

    build() {
      const container = this._container;
      if (!container) return;
      const doc = this.document;
      const wiki = this.wiki;
      container.textContent = '';
      const c = todayCounts(wiki);
      const toStudy = c.learn + c.due + c.newly;

      // 双主 CTA
      const grid = el(doc, 'div', 'tm-today-ctas');
      const mkCta = (cls: string, iconName: string, label: string, sub: string, onClick: () => void) => {
        const card = el(doc, 'button', 'tm-today-cta ' + cls);
        card.appendChild(icons.iconEl(doc, iconName, 'tm-today-cta-icon'));
        card.appendChild(el(doc, 'div', 'tm-today-cta-label', label));
        card.appendChild(el(doc, 'div', 'tm-today-cta-sub', sub));
        card.addEventListener('click', onClick);
        return card;
      };
      grid.appendChild(
        mkCta(
          'tm-today-cta--study',
          'study',
          lingo(wiki, 'today.startstudy', 'Start Review'),
          toStudy > 0 ? `${toStudy} ${lingo(wiki, 'today.cardsdue', 'cards due')}` : lingo(wiki, 'today.noduecards', 'No due cards, free to review'),
          () => workflow.startGlobalLearning(wiki, this),
        ),
      );
      const readTarget = workflow.globalReadingTarget(wiki);
      grid.appendChild(
        mkCta(
          'tm-today-cta--read',
          'read',
          lingo(wiki, 'read.resume', 'Continue Reading'),
          c.toRead > 0 ? `${c.toRead} ${lingo(wiki, 'today.sectionsleft', 'sections left')}` : lingo(wiki, 'today.noreading', 'No reading materials'),
          () => navigateTo(this, readTarget),
        ),
      );
      container.appendChild(grid);

      // 今日反馈条
      const rt = stats.getReadTimeStats(wiki);
      const reviewed = todayReviewCount(wiki);
      // 容错补偿：若今日已有复习记录但专注时间为 0（因历史版本卡片复习流未挂载计时器），
      // 按每卡至少 1 秒给予基础时间，杜绝"已复习45卡 专注0秒"的反常现象
      const effectiveSec = Math.max(rt.todaySeconds, reviewed > 0 && rt.todaySeconds === 0 ? reviewed : 0);
      const revTpl = lingo(wiki, 'today.reviewedsummary', '${count} cards reviewed today');
      const reviewedStr = revTpl.replace('${count}', String(reviewed)).replace('$(count)$', String(reviewed));
      const focTpl = lingo(wiki, 'today.focussummary', 'Focus ${duration}');
      const focusStr = focTpl.replace('${duration}', stats.formatDuration(effectiveSec)).replace('$(duration)$', stats.formatDuration(effectiveSec));
      const feed = el(doc, 'div', 'tm-today-feed', `${reviewedStr} · ${focusStr}`);
      container.appendChild(feed);
    }

    refresh(changedTiddlers: Record<string, any>) {
      if (!this._container) return false;
      return bindWidgetRefresh(this, changedTiddlers, () => this.build(), {
        checkRelevant: reactive.hasRelevantChange,
      });
    }
  }
  return TodayHeroWidget as any;
}

// ---------- today-recent：最近阅读 ----------

function makeTodayRecent(): WidgetCtor {
  class TodayRecentWidget extends Widget {
    _container: HTMLElement | null = null;

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      this._container = el(this.document, 'div', 'tm-today-recent');
      parent.insertBefore(this._container, nextSibling);
      this.domNodes.push(this._container);
      this.build();
    }

    build() {
      const container = this._container;
      if (!container) return;
      const doc = this.document;
      const wiki = this.wiki;
      container.textContent = '';

      container.appendChild(el(doc, 'div', 'tm-today-section-title', lingo(wiki, 'read.recent', 'Recent Reading')));
      const docs = wiki.filterTiddlers('[tag[tidme-import-doc]]');
      // 最近打开时间：全局续读点所属书置顶（每次打开阅读卡都会刷新全局续读点）；
      // 其余书回退各自续读点的写入时间（制卡/设续读点时更新）
      const globalFields = wiki.getTiddler(docOps.GLOBAL_READPOINT)?.fields || {};
      const globalCard = wiki.getTiddler(String(globalFields.text || ''));
      const globalDoc = String(globalCard?.fields?.['tidme.doc'] || '');
      const globalTime = globalFields.modified ? new Date(globalFields.modified).getTime() : 0;
      const lastOpen = (docId: string): number => {
        if (docId && docId === globalDoc) return globalTime;
        const m = wiki.getTiddler(docOps.READPOINT_PREFIX + docId)?.fields?.modified;
        return m ? new Date(m).getTime() : 0;
      };
      const rows: { title: string; label: string; done: number; total: number; last: number }[] = [];
      for (const d of docs) {
        const docId = String(wiki.getTiddler(d)?.fields['tidme.doc'] || '');
        if (!docId) continue;
        const prog = docOps.sectionsProgressByDoc(wiki).get(docId);
        if (!prog || !prog.total) continue;
        const f = wiki.getTiddler(d)?.fields || {};
        rows.push({ title: d, label: display.displayTitle(f, d), done: prog.done, total: prog.total, last: lastOpen(docId) });
      }
      rows.sort((a, b) => b.last - a.last || (a.done / a.total) - (b.done / b.total) || b.total - a.total);
      const top = rows.filter((r) => r.done < r.total).slice(0, 3);

      const items: any[] = top.map((r) => {
        const docId = String(wiki.getTiddler(r.title)?.fields['tidme.doc'] || '');
        const target = docOps.docReadingTarget(wiki, docId) || r.title;
        const syncPdfPage = () => {
          const rp = docOps.parseReadPoint(wiki, docId);
          const pageMatch = rp?.s && /^p(\d+)$/.exec(rp.s);
          if (pageMatch && docId) {
            wiki.addTiddler({ title: ns.pdfPageStateTitle(docId), text: pageMatch[1] });
          }
        };
        return {
          id: r.title,
          title: r.label,
          titleTooltip: `${lingo(wiki, 'read.opendoc', 'Open document: ')}${r.label}`,
          onTitleClick: () => {
            syncPdfPage();
            navigateTo(this, r.title);
          },
          progress: { done: r.done, total: r.total },
          action: {
            label: lingo(wiki, 'read.continue', 'Continue'),
            onClick: () => {
              syncPdfPage();
              navigateTo(this, target);
            },
          },
        };
      });
      primitives.renderActionList(doc, container, items, lingo(wiki, 'today.norecentbooks', 'No reading in progress - Add materials from Import Center.'));
    }

    refresh(changedTiddlers: Record<string, any>) {
      if (!this._container) return false;
      return bindWidgetRefresh(this, changedTiddlers, () => this.build(), {
        checkRelevant: reactive.hasRelevantChange,
      });
    }
  }
  return TodayRecentWidget as any;
}

exports['tidme-today-hero'] = makeTodayHero();
exports['tidme-today-recent'] = makeTodayRecent();
exports.todayReviewCount = todayReviewCount; // 供测试/复用
