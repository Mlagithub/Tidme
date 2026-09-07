/*
core/dialog.ts — 统一确认/提示弹窗（替换原生 confirm/alert）

设计系统组件：复用 tm-card-modal 视觉类；Promise 语义（事件处理器内 await）。
- confirmDialog：双按钮（确定/取消），danger 时确认键红色
- alertDialog：单按钮（纯提示）
无状态 DOM 工具（同 core/dom 章位）；不写库、不路由。
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const el = dom.el;

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作：确认键红色 */
  danger?: boolean;
}

function buildModal(doc: Document, opts: { title?: string; message: string; okLabel: string; danger?: boolean; withCancel: boolean }, resolve: (v: boolean) => void): HTMLElement {
  const overlay = el(doc, 'div', 'tm-card-modal-overlay');
  const modal = el(doc, 'div', 'tm-card-modal');
  if (opts.title) modal.appendChild(el(doc, 'div', 'tm-card-modal-title', opts.title));
  const msg = el(doc, 'div', 'tm-dialog-message');
  for (const line of String(opts.message).split('\n')) {
    msg.appendChild(el(doc, 'div', 'tm-dialog-line', line));
  }
  modal.appendChild(msg);
  const actions = el(doc, 'div', 'tm-card-modal-actions');
  const done = (v: boolean) => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    resolve(v);
  };
  if (opts.withCancel) {
    const cancelBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-cancel', '取消');
    cancelBtn.addEventListener('click', () => done(false));
    actions.appendChild(cancelBtn);
  }
  const okBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit' + (opts.danger ? ' tm-dialog-danger' : ''), opts.okLabel);
  okBtn.addEventListener('click', () => done(true));
  actions.appendChild(okBtn);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  doc.body.appendChild(overlay);
  setTimeout(() => okBtn.focus(), 50);
  return overlay;
}

/** 确认弹窗：resolve(true)=确定，resolve(false)=取消 */
export function confirmDialog(doc: Document, opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    buildModal(doc, {
      title: opts.title,
      message: opts.message,
      okLabel: opts.confirmLabel || '确定',
      danger: opts.danger,
      withCancel: true,
    }, resolve);
  });
}

/** 提示弹窗（单按钮，替代原生 alert） */
export function alertDialog(doc: Document, opts: { title?: string; message: string; closeLabel?: string }): Promise<void> {
  return new Promise((resolve) => {
    buildModal(doc, {
      title: opts.title,
      message: opts.message,
      okLabel: opts.closeLabel || '知道了',
      withCancel: false,
    }, () => resolve());
  });
}
