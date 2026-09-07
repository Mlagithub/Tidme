/*
core/dom.ts — 无状态 DOM 小工具
浏览器/无头通用的 createElement 帮助。
*/

export function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** 轻量 Toast 浮动提示（自动插入容器首部并在定时后淡出销毁） */
export function showToast(
  doc: Document,
  container: HTMLElement,
  msg: string,
  kind: '' | 'ok' | 'err' | string = '',
  durationMs = 2500,
): HTMLElement {
  const t = el(doc, 'div', 'tm-toast' + (kind ? ' tm-toast--' + kind : ''), msg);
  container.insertBefore(t, container.firstChild);
  setTimeout(() => {
    if (typeof t.remove === 'function') {
      t.remove();
    } else if (t.parentNode && typeof t.parentNode.removeChild === 'function') {
      t.parentNode.removeChild(t);
    }
  }, durationMs);
  return t;
}

/** 安全派发 TiddlyWiki tm-navigate 事件 */
export function navigateTo(widget: any, targetTitle: string): void {
  if (widget && typeof widget.dispatchEvent === 'function') {
    widget.dispatchEvent({ type: 'tm-navigate', navigateTo: targetTitle });
  }
}

/** 生成阻止默认行为并触发 tm-navigate 页面跳转的链接 DOM */
export function createNavLink(
  doc: Document,
  widget: any,
  options: {
    text: string;
    target: string;
    cls?: string;
    onClick?: (e: MouseEvent) => void;
  },
): HTMLAnchorElement {
  const a = el(doc, 'a', options.cls || 'tc-tiddlylink', options.text) as HTMLAnchorElement;
  a.href = '#';
  a.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    if (options.onClick) options.onClick(e);
    navigateTo(widget, options.target);
  });
  return a;
}

/** 安全派发 TiddlyWiki tm-notify 轻通知事件 */
export function notify(widget: any, param: string): void {
  if (widget && typeof widget.dispatchEvent === 'function') {
    widget.dispatchEvent({ type: 'tm-notify', param });
  }
}

/** 安全派发 TiddlyWiki tm-close-tiddler 关闭条目事件 */
export function closeTiddler(widget: any, title?: string): void {
  if (widget && typeof widget.dispatchEvent === 'function') {
    widget.dispatchEvent(
      title ? { type: 'tm-close-tiddler', param: title, tiddlerTitle: title } : { type: 'tm-close-tiddler' },
    );
  }
}

/** 复合动作：关闭当前条目并导航到目标条目（阅读流核心模式） */
export function closeAndNavigate(widget: any, closeTitle: string, navigateTitle: string): void {
  closeTiddler(widget, closeTitle);
  navigateTo(widget, navigateTitle);
}
