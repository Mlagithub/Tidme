/*
widgets/today.ts — 「今天」主入口页组件

产品定位：打开今天 = 回答"现在该做什么"。
- today-hero：双主 CTA（开始学习 / 继续阅读）+ 今日反馈条（复习卡数/专注时长）。
  数据全部来自 core（deck-engine 计数、ns.TOPIC_QUEUE_FILTER、workflow 目标、
  stats 今日统计）；点击只调 core action，不复制任何调度逻辑。
- today-recent：最近阅读（有节卡进度且未读完的文档，前 3 本），进度条 + 继续。
刷新：唯一机制（TW 原生 refresh 嗅探 + core/reactive 谓词）。
*/

declare function require(module: string): any;
const stats = require('$:/plugins/keepone/tidme/core/stats.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const workflow = require('$:/plugins/keepone/tidme/review/widgets/workflow.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const drill = require('$:/plugins/keepone/tidme/core/drill.js');
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
      // 算数与口径全在 core/stats（todayWorkload）；widget 只渲染
      const c = stats.todayWorkload(wiki);
      const toStudy = c.todayToStudy;

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

      const studySub = toStudy > 0
        ? `${toStudy} ${lingo(wiki, 'today.cardstostudy', 'cards to study today')}`
        : lingo(wiki, 'today.noduecards', 'No due cards, free to review');
      const studyTip = `${lingo(wiki, 'today.startstudy', 'Start Review')} — ${lingo(wiki, 'today.cardstostudy', 'cards to study today')}: ${toStudy} (${
        lingo(wiki, 'today.breakdown.review', 'Review')
      }: ${c.due}/${c.totalDue}, ${lingo(wiki, 'today.breakdown.new', 'New')}: ${c.newly}/${c.totalNew}, ${lingo(wiki, 'today.breakdown.learn', 'Learning')}: ${c.learn}; ${
        lingo(wiki, 'today.breakdown.total', 'Total Vault')
      }: ${c.totalPool})`;

      const studyBtn = mkCta(
        'tm-today-cta--study',
        'study',
        lingo(wiki, 'today.startstudy', 'Start Review'),
        studySub,
        () => workflow.startGlobalLearning(wiki, this),
      );
      studyBtn.title = studyTip;
      grid.appendChild(studyBtn);

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

      // 日末操练（SuperMemo final drill）：当天评档 < Good 的卡进队列，操练到每张 ≥ Good 才清账。
      // 队列由 core/scheduler 维护（评分时入队/达标出队），此处只提供入口，无卡时不占位。
      const drillCount = drill.getFinalDrillQueue(wiki).length;
      if (drillCount > 0) {
        const drillBtn = mkCta(
          'tm-today-cta--drill',
          'study',
          lingo(wiki, 'today.drill', 'Final Drill'),
          `${drillCount} ${lingo(wiki, 'today.cardstostudy', 'cards to study today')}`,
          () => {
            const started = sessionMod.startFinalDrill(wiki);
            if (started) navigateTo(this, started.list[0]);
          },
        );
        drillBtn.title = lingo(wiki, 'today.drill.tip', "Clear today's below-Good cards (SuperMemo final drill)");
        grid.appendChild(drillBtn);
      }
      container.appendChild(grid);

      // 今日反馈条
      const rt = stats.getReadTimeStats(wiki);
      const reviewed = stats.reviewCountToday(wiki);
      // 专注时长如实回显记录值：记录侧已有「快刷保底 1 秒 / 超上限整段丢弃」口径
      // （core/session 的锚点结算），此处不再为 0 秒补假时间
      const revTpl = lingo(wiki, 'today.reviewedsummary', '${count} cards reviewed today');
      const reviewedStr = revTpl.replace('${count}', String(reviewed)).replace('$(count)$', String(reviewed));
      const focTpl = lingo(wiki, 'today.focussummary', 'Focus ${duration}');
      const focusStr = focTpl.replace('${duration}', stats.formatDuration(rt.todaySeconds)).replace('$(duration)$', stats.formatDuration(rt.todaySeconds));
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
      const docs = wiki.filterTiddlers('[tag[tidme-doc]]');
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
      const rows: { title: string; label: string; done: number; total: number; last: number; text?: string }[] = [];
      for (const d of docs) {
        const docId = String(wiki.getTiddler(d)?.fields['tidme.doc'] || '');
        if (!docId) continue;
        const prog = docOps.docReadingProgress(wiki, docId);
        if (!prog) continue;
        if (prog.total > 0 && prog.current >= prog.total) continue;
        if (prog.total === 0 && prog.current === 0) continue;
        const f = wiki.getTiddler(d)?.fields || {};
        rows.push({
          title: d,
          label: display.displayTitle(f, d),
          done: prog.current,
          total: prog.total,
          last: lastOpen(docId),
          text: prog.doneText,
        });
      }
      rows.sort((a, b) => b.last - a.last || (a.total > 0 ? a.done / a.total : 0) - (b.total > 0 ? b.done / b.total : 0) || b.total - a.total);
      const top = rows.slice(0, 3);

      const items: any[] = top.map((r) => {
        const docId = String(wiki.getTiddler(r.title)?.fields['tidme.doc'] || '');
        const target = docOps.docReadingTarget(wiki, docId) || r.title;
        const syncPdfPage = () => {
          const rp = docOps.parseReadPoint(wiki, docId);
          const page = rp ? docOps.parsePagePosition(rp.s) : null;
          if (page && docId) {
            wiki.addTiddler({ title: ns.pdfPageStateTitle(docId), text: String(page) });
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
          progress: { done: r.done, total: r.total, text: r.text },
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
// 不再向测试暴露内部计数函数：算数与口径都在 core/stats（todayWorkload / reviewCountToday），
// 测试直接打 core；widget 保持"只渲染"。
