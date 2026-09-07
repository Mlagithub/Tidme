/*
widgets/pick-bubble.ts — 全局划词气泡（任意 tiddler 查看态制卡）

- 挂载：PageTemplate 一次性实例化（<$tidme-pick-bubble/>）；文档级监听选区变化
- 作用域：仅"无 section-bar"的条目（tiddler 无 tidme.doc）——阅读材料自带阅读条栏
  划词气泡（section-bar），此处不重复出现，避免双气泡
- 动作：挖空 / 问答（core/card-factory 制卡 + commitCard 统一写库；无 docId，
  不设续读点）。摘录不提供（摘录只属于阅读材料）
样式复用 core 设计系统的 tm-selection-bubble；制卡弹窗复用 card-modal。
*/

declare function require(module: string): any;
const factory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const selMod = require('$:/plugins/keepone/tidme/import/widgets/selection.js');
const cardModal = require('$:/plugins/keepone/tidme/ui/components/card-modal.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const notify = dom.notify;

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

function makePickBubble(): WidgetCtor {
  class PickBubbleWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      // 占位节点（无可见 UI；气泡挂在 document.body）
      const stub = this.document.createElement('div');
      stub.style.display = 'none';
      stub.setAttribute('data-tidme-pick-bubble', '1'); // 可观测痕迹：确认 widget 已渲染/绑定
      parent.insertBefore(stub, nextSibling);
      this.domNodes.push(stub);
      bindGlobal(this);
    }
    refresh() {
      return false;
    }
  }
  return PickBubbleWidget as any;
}

let bubbleBound = false;
let activeBubble: HTMLElement | null = null;

function removeBubble(doc: Document) {
  const bubble = doc.querySelector('.tm-pick-bubble');
  if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
  activeBubble = null;
}

function bindGlobal(widget: any) {
  if (bubbleBound || typeof document === 'undefined') return;
  bubbleBound = true;
  const doc: Document = document;
  const win: any = doc.defaultView || globalThis;

  const makeCard = (draft: Record<string, any> | null) => {
    if (!draft) return;
    factory.commitCard(widget.wiki, draft, widget);
    try {
      notify(widget, ns.NOTIFY_CLOZE);
    } catch { /* ignore */ }
    try {
      win.getSelection?.()?.removeAllRanges();
    } catch { /* ignore */ }
    removeBubble(doc);
  };

  const openCloze = (title: string, selected: string, block?: string) => {
    const draft = factory.buildCloze(widget.wiki, title, block || selected, selected);
    if (!draft) return;
    cardModal.openCardModal(doc, 'cloze', String(draft.caption || ''), (res) => {
      draft.caption = res.answerOrCloze;
      makeCard(draft);
    });
  };

  const openQA = (title: string, selected: string) => {
    cardModal.openCardModal(doc, 'qa', selected, (res) => {
      makeCard(factory.buildQA(widget.wiki, title, res.question, res.answerOrCloze));
    });
  };

  const sync = () => {
    // 弹窗打开（制卡模态）期间不重绘
    if (doc.querySelector('.tm-card-modal-overlay')) return;
    const sel = win.getSelection?.();
    let selectedText = '';
    let blockText = '';
    let rect: any = null;
    const title = selMod.frameTitleOfSelection(win);
    if (sel && !sel.isCollapsed && String(sel).trim() && title) {
      const f = widget.wiki.getTiddler(title)?.fields;
      // 仅无 tidme.doc 的条目（阅读材料由 section-bar 气泡负责）
      if (f && !f['tidme.doc']) {
        const info = selMod.getSelectionInfo(win);
        selectedText = info.selected;
        blockText = info.block; // 所在整句/块：挖空 caption 保留上下文
        try {
          rect = sel.getRangeAt(0).getBoundingClientRect();
        } catch {
          rect = null;
        }
      }
    }
    if (!selectedText || !rect || (rect.width === 0 && rect.height === 0)) {
      removeBubble(doc);
      return;
    }
    let bubble = activeBubble;
    if (!bubble || !bubble.parentNode) {
      bubble = doc.createElement('div');
      bubble.className = 'tm-selection-bubble tm-pick-bubble';
      doc.body.appendChild(bubble);
      activeBubble = bubble;
    }
    bubble.textContent = '';
    const mk = (label: string, onClick: () => void) => {
      const b = doc.createElement('button');
      b.className = 'tm-selection-bubble-btn';
      b.textContent = label;
      b.addEventListener('mousedown', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      bubble!.appendChild(b);
    };
    mk('🧩 挖空', () => openCloze(title!, selectedText, blockText));
    mk('❓ 问答', () => openQA(title!, selectedText));
    const scrollX = win.scrollX || win.pageXOffset || 0;
    const scrollY = win.scrollY || win.pageYOffset || 0;
    bubble.style.left = `${rect.left + rect.width / 2 + scrollX}px`;
    bubble.style.top = `${rect.top + scrollY}px`;
  };

  doc.addEventListener('selectionchange', sync);
  doc.addEventListener('mouseup', sync);
  doc.addEventListener('keyup', sync);
}

exports['tidme-pick-bubble'] = makePickBubble();
