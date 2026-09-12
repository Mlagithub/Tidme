/*
ui/base/dialog.ts — 统一确认/提示/输入弹窗（替换原生 confirm/alert/prompt）

设计系统组件：复用 tm-card-modal 视觉类；Promise 语义（事件处理器内 await）。
- confirmDialog：双按钮（确定/取消），danger 时确认键红色
- alertDialog：单按钮（纯提示）
- promptDialog：单行输入（确定回传字符串，取消回 null）；用于"保存搜索名""设定到期/间隔/易度"等
无状态 DOM 工具（同 ui/base/dom 章位）；不写库、不路由。
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

function buildModal(
  doc: Document,
  opts: { title?: string; message: string; okLabel: string; cancelLabel?: string; danger?: boolean; withCancel: boolean },
  resolve: (v: boolean) => void,
): HTMLElement {
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
    const cancelBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-cancel', opts.cancelLabel || 'Cancel');
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
      okLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
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
      okLabel: opts.closeLabel || 'OK',
      withCancel: false,
    }, () => resolve());
  });
}

export interface PromptOptions {
  title?: string;
  message?: string;
  /** 初始值（预填当前值，便于微调） */
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/** 单行输入弹窗：确定回传输入串（已 trim），取消回 null。 */
export function promptDialog(doc: Document, opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = el(doc, 'div', 'tm-card-modal-overlay');
    const modal = el(doc, 'div', 'tm-card-modal');
    if (opts.title) modal.appendChild(el(doc, 'div', 'tm-card-modal-title', opts.title));
    if (opts.message) {
      const msg = el(doc, 'div', 'tm-dialog-message');
      for (const line of String(opts.message).split('\n')) msg.appendChild(el(doc, 'div', 'tm-dialog-line', line));
      modal.appendChild(msg);
    }
    const input = doc.createElement('input');
    input.type = 'text';
    input.className = 'tm-input tm-dialog-input';
    input.value = opts.defaultValue ?? '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    modal.appendChild(input);
    const actions = el(doc, 'div', 'tm-card-modal-actions');
    const done = (v: string | null) => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(v);
    };
    const cancelBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-cancel', opts.cancelLabel || 'Cancel');
    cancelBtn.addEventListener('click', () => done(null));
    actions.appendChild(cancelBtn);
    const okBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit', opts.confirmLabel || 'OK');
    okBtn.addEventListener('click', () => done(String(input.value ?? '').trim()));
    actions.appendChild(okBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    input.addEventListener('keydown', (e: any) => {
      if (e && e.key === 'Enter') done(String(input.value ?? '').trim());
      if (e && e.key === 'Escape') done(null);
    });
    doc.body.appendChild(overlay);
    setTimeout(() => input.focus(), 50);
  });
}
