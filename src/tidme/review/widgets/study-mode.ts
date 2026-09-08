/*
widgets/study-mode.ts — 学习模式条（固定底部 pill；会话激活时常驻全局可见）

产品语义：学习是一个**模式**而非页面——会话激活期间无论在看哪个 tiddler，
模式条都提供进度与「结束学习」出口（修复"复习中无结束按钮"断点）。

- 可见性：core/session.getActiveStudy 判定；刷新走唯一机制（core/reactive 谓词嗅探）
- 进度：currentTiddler 在活动队列中的位置；不在队列时只显示"学习中"
- 结束学习：core/session.endSession 统一清场（全局会话 + 全部 <deck>/study +
  $:/temp/tidme/*）→ 导航回今天 → 轻通知
*/

declare function require(module: string): any;
const session = require('$:/plugins/keepone/tidme/core/session.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
function lingo(wiki: any, key: string, fallback: string): string {
  return lingoMod ? lingoMod.lingo(wiki, key, fallback) : fallback;
}
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const el = dom.el;
const navigateTo = dom.navigateTo;
const notify = dom.notify;

/** 结束后返回的页面（今天页）+ 结束通知 */
const EXIT_TARGET = ns.PAGE_TODAY;
const NOTIFY_ENDED = ns.NOTIFY_STUDY_ENDED;

/** 结束学习：统一清场 + 导航 + 通知（导出供测试/复用；widget 只需提供 wiki/dispatchEvent） */
function endStudy(widget: any) {
  session.endSession(widget.wiki);
  try {
    navigateTo(widget, EXIT_TARGET);
    notify(widget, NOTIFY_ENDED);
  } catch { /* 无头环境忽略 */ }
}

/** 获取当前学习活动卡片（优先取 widget 变量，在全局 PageTemplate 时从 $:/StoryList 嗅探） */
function getCurrentStudyCard(wiki: any, widget: any, studyList: string[]): string {
  const varTitle = widget.getVariable('currentTiddler');
  if (varTitle && studyList.includes(varTitle)) {
    return varTitle;
  }
  const story = wiki.getTiddler('$:/StoryList')?.fields?.list;
  if (Array.isArray(story)) {
    const found = studyList.find((t) => story.includes(t));
    if (found) return found;
  }
  return varTitle || studyList[0] || '';
}

/** 推进学习：移出当前卡并导航到下一张（若是阅读材料自动保存续读点并置已读） */
function advanceStudy(widget: any) {
  const wiki = widget.wiki;
  const study = session.getActiveStudy(wiki);
  if (!study) return;
  const cur = getCurrentStudyCard(wiki, widget, study.list);
  if (cur) {
    const f = wiki.getTiddler(cur)?.fields || {};
    if (f['tidme.kind'] === 'topic') {
      wiki.addTiddler(sched.doneCard(f));
    }
    dom.closeTiddler(widget, cur);
  }
  let list: string[] = Array.isArray(study.list) ? [...study.list] : [];
  if (cur) {
    list = list.filter((t: string) => t !== cur);
    const sessT = wiki.getTiddler(session.SESSION_TIDDLER);
    wiki.addTiddler({ ...(sessT?.fields || { title: session.SESSION_TIDDLER }), list });
  }
  if (list.length > 0) {
    const next = list[0];
    // 续读点指向下一张卡并携带其页码（PDF 节卡 p<start>）：既不再指向已读完的卡，
    // 也不用 s:'' 抹掉页码——否则下次继续阅读回落首页（阅读记录丢失）
    const nf = wiki.getTiddler(next)?.fields || {};
    const nextDoc = String(nf['tidme.doc'] || '');
    if (nextDoc) {
      docOps.saveReadPoint(wiki, nextDoc, { t: next, s: docOps.readPointPositionOf(wiki, next) });
    }
    docOps.prepareCardFold(wiki, next);
    navigateTo(widget, next);
  } else {
    widget.dispatchEvent?.({ type: 'tm-confetti-launch' });
    notify(widget, ns.NOTIFY_CONGRATULATION);
    endStudy(widget);
  }
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

function makeStudyModeBar(): WidgetCtor {
  class StudyModeBarWidget extends Widget {
    _container: HTMLElement | null = null;

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const container = dom.el(this.document, 'div', 'tm-study-mode');
      container.style.display = 'none'; // 未激活时隐藏占位（PageTemplate 单实例）
      this._container = container;
      parent.insertBefore(container, nextSibling);
      this.domNodes.push(container);
      this.build();
    }

    build() {
      const container = this._container;
      if (!container) return;
      const doc = this.document;
      container.textContent = '';
      const study = session.getActiveStudy(this.wiki);
      if (!study) {
        container.style.display = 'none';
        return;
      }
      container.style.display = '';
      container.appendChild(el(doc, 'span', 'tm-study-mode-label', lingo(this.wiki, 'studymode.learning', 'Learning')));

      const curTitle = getCurrentStudyCard(this.wiki, this, study.list);
      const i = study.list.indexOf(curTitle);
      if (i >= 0) {
        container.appendChild(el(doc, 'span', 'tm-study-mode-progress', `${i + 1}/${study.list.length}`));
      }

      const curFields = this.wiki.getTiddler(curTitle)?.fields;
      const isReading = curFields && (curFields['tidme.kind'] === 'topic' || curFields['tidme.pdf']);

      if (isReading) {
        const advBtn = el(doc, 'button', 'tm-btn tm-study-mode-next tm-btn--primary', lingo(this.wiki, 'studymode.finishandnext', 'Done, Next ›'));
        advBtn.title = lingo(this.wiki, 'studymode.finishandnext.tip', 'Save reading progress and continue review');
        advBtn.addEventListener('click', () => {
          advanceStudy(this);
        });
        container.appendChild(advBtn);
      }

      const btn = el(doc, 'button', 'tm-btn tm-study-mode-end', lingo(this.wiki, 'studymode.end', 'End Study'));
      btn.title = lingo(this.wiki, 'studymode.end.tip', 'End current session, clear queue, return to Incremental Learning');
      btn.addEventListener('click', () => {
        endStudy(this);
        this.build(); // 同步隐藏（真实环境刷新周期也会触发，这里保证确定性反馈）
      });
      container.appendChild(btn);
    }

    refresh(changedTiddlers: Record<string, any>) {
      if (!this._container) return false;
      let need = false;
      for (const title of Object.keys(changedTiddlers || {})) {
        if (reactive.isSessionChange(title) || title === '$:/StoryList') {
          need = true;
          break;
        }
      }
      if (need) {
        this.build();
        return true;
      }
      return false;
    }
  }
  return StudyModeBarWidget as any;
}

exports['tidme-study-mode-bar'] = makeStudyModeBar();
exports.endStudy = endStudy;
