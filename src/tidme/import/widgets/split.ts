const { lingo } = require('$:/plugins/keepone/tidme/core/lingo.js');
/*
widgets/split.ts — 切分入口组件（优先级三档 + 预览干预）

- <$paste-split/> 粘贴切分：textarea → runSplit → 写库
- <$inbox-split/> 剪藏收件箱：列出 tidme-inbox tiddler，逐条/批量切分
切分后源 tiddler 被文档页覆盖（保留 url/author/date 等溯源字段，移除 tidme-inbox 标签）。
*/

declare function require(module: string): any;
const parse = require('$:/plugins/keepone/tidme/import/parse.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const primitives = require('$:/plugins/keepone/tidme/ui/components/ui-primitives.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const commitMod = require('$:/plugins/keepone/tidme/core/import-commit.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;
const navigateTo = dom.navigateTo;
const notify = dom.notify;
const renderEmpty = primitives.renderEmpty;

/** 从源 tiddler 提取溯源字段（切分后保留到文档页） */
function provenanceOf(wiki: any, title: string): Record<string, string> {
  const f = wiki.getTiddler(title)?.fields || {};
  const out: Record<string, string> = {};
  for (const k of ['url', 'author', 'date', 'canonical', 'license', 'created', 'modified']) {
    const v = f[k];
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

/** 切分并落库的唯一出口：runSplit → 合并来源字段 → core/import-commit（对齐/全量写）。
 *  粘贴入口（无源 tiddler）与剪藏入口（源 tiddler 覆盖为文档页）共用，避免两条落库决策。
 *  @param srcFields 源 tiddler 字段（粘贴场景传空对象：无溯源可合并）
 *  @returns 管线结果 + 落库统计（异常计数由调用方展示） */
async function splitAndCommit(
  wiki: any,
  opts: {
    text: string;
    title: string;
    type?: string;
    bag?: string;
    srcFields?: Record<string, any>;
    extraSourceFields?: Record<string, string>;
    priority?: number;
  },
) {
  const srcFields = opts.srcFields || {};
  const r = await parse.runSplit({
    text: opts.text,
    title: opts.title,
    type: opts.type,
    bag: opts.bag,
    sourceFields: { ...provenanceOf(wiki, opts.title), ...(opts.extraSourceFields || {}) },
    priority: opts.priority,
    folderOccupied: (base: string) => docOps.docFolderOwner(wiki, base),
  });
  const [doc, ...cards] = r.tiddlers;
  if (!cards.length) throw new Error(lingo(wiki, 'split.emptysections', 'No sections split (content too short or no recognizable structure)'));

  // 源 tiddler → 文档页：合并溯源字段、标签合并（去 tidme-inbox）；
  // 卡片 tidme.docpage 须指向合并后真实存在的文档页 title（源 tiddler title 优先于管线 docRoot）
  const srcTags = Array.isArray(srcFields.tags) ? srcFields.tags.filter((x: string) => x !== 'tidme-inbox') : [];
  const mergedDoc: Record<string, any> = {
    ...doc,
    title: opts.title,
    tags: [...new Set([...(Array.isArray(doc.tags) ? doc.tags : []), ...srcTags])],
    ...(srcFields.bag ? { bag: srcFields.bag } : {}),
    ...(srcFields['tidme.url'] ? { 'tidme.url': srcFields['tidme.url'] } : {}),
    ...(srcFields['tidme.author'] ? { 'tidme.author': srcFields['tidme.author'] } : {}),
    ...(srcFields['tidme.date'] ? { 'tidme.date': srcFields['tidme.date'] } : {}),
  };
  const commit = await commitMod.commitImportToWiki(wiki, {
    docId: r.docId,
    docTiddler: mergedDoc,
    docTitle: opts.title,
    cards,
    rewriteDocPage: true,
  });
  // 无自动阅读牌组：topic 由阅读列表管理，item 进默认牌组
  return { split: r, commit };
}

/** 剪藏入口：源 tiddler 被文档页覆盖（合并溯源字段、移除 inbox 标签） */
async function commitSplit(wiki: any, title: string, extraSourceFields: Record<string, string> = {}, priority?: number) {
  const t = wiki.getTiddler(title);
  if (!t) throw new Error(lingo(wiki, 'split.sourcemissing', 'Source tiddler does not exist'));
  return await splitAndCommit(wiki, {
    text: String(t.fields.text || ''),
    title,
    type: t.fields.type,
    srcFields: t.fields,
    extraSourceFields,
    priority,
  });
}

/** 落库异常提示文案（同名节丢弃 / 同名 tiddler 跳过 / 疑似同名书）；无异常返回空串 */
function commitWarning(wiki: any, commit: any): string {
  const parts: string[] = [];
  if (commit?.dropped > 0) {
    parts.push(`${lingo(wiki, 'import.dropped', 'Duplicate sections discarded')} ${commit.dropped}`);
  }
  if (commit?.skippedExisting > 0) {
    parts.push(`${lingo(wiki, 'import.skippedexisting', 'Skipped (title exists)')} ${commit.skippedExisting}`);
  }
  if (commit?.collisionSuspect) {
    parts.push(lingo(wiki, 'import.collision', 'Possible book title collision - rename and re-import'));
  }
  return parts.join(' · ');
}

function makePasteSplit(): WidgetCtor {
  class PasteSplitWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const wrap = el(doc, 'div', 'tm-dashboard-card');
      wrap.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'split.pastetitle', 'Paste Text')));
      const inner = el(doc, 'div', 'tm-paste-split');
      const ta = doc.createElement('textarea');
      ta.className = 'tm-paste-textarea tm-textarea';
      ta.placeholder = lingo(wiki, 'split.pasteplaceholder', 'Paste Markdown, HTML, or plain text...');
      ta.rows = 8;
      inner.appendChild(ta);
      const btn = el(doc, 'button', 'tm-btn tm-btn--primary', lingo(wiki, 'split.btn', 'Split & Import'));
      const status = el(doc, 'div', 'tm-import-muted', '');
      btn.addEventListener('click', async () => {
        const text = String(ta.value || '').trim();
        if (!text) {
          status.textContent = lingo(wiki, 'split.emptycontent', 'Content is empty');
          return;
        }
        const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').replace(/^!\s*/, '').slice(0, 40) || '粘贴内容';
        btn.setAttribute('disabled', 'true');
        status.textContent = lingo(wiki, 'split.parsing', 'Parsing...');
        try {
          // 落库走与剪藏同一出口（core/import-commit）：同名文档再粘贴时按对齐处理，
          // 不再绕开唯一写库门面直接 addTiddler（曾无对齐、无归档、丢 SRS 进度）
          const { split: r, commit } = await splitAndCommit(this.wiki, {
            text,
            title: firstLine,
            bag: this.wiki.getTiddlerText(parse.IMPORT_BAG_TITLE, '') || 'default',
          });
          notify(this, ns.NOTIFY_DONE);
          navigateTo(this, r.tiddlers[0].title);
          const warn = commitWarning(this.wiki, commit);
          if (warn) status.textContent = `⚠ ${warn}`;
        } catch (e: any) {
          status.textContent = lingo(wiki, 'split.failed', 'Split failed:') + ' ' + String(e.message || e);
          btn.removeAttribute('disabled');
        }
      });
      inner.appendChild(btn);
      inner.appendChild(status);
      wrap.appendChild(inner);
      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }
    refresh() {
      return false;
    }
  }
  return PasteSplitWidget as any;
}

function makeInboxSplit(): WidgetCtor {
  class InboxSplitWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const wrap = el(doc, 'div', 'tm-dashboard-card');
      wrap.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'split.inboxtitle', 'Inbox Clips (tidme-inbox)')));
      const inner = el(doc, 'div', 'tm-inbox-split');
      const listBox = el(doc, 'div', '');
      const refresh = () => {
        listBox.textContent = '';
        const items = this.wiki.filterTiddlers('[tag[tidme-inbox]!is[draft]]');
        if (!items.length) {
          listBox.appendChild(renderEmpty(doc, { text: lingo(wiki, 'split.inboxempty', 'Inbox is empty - clip articles from browser to import here.'), icon: '📥' }));
          return;
        }
        for (const item of items) {
          const row = el(doc, 'div', 'tm-import-row');
          row.appendChild(el(doc, 'strong', '', item));
          const btn = el(doc, 'button', 'tm-btn tm-btn--primary', lingo(wiki, 'split.btn', 'Split & Import'));
          btn.addEventListener('click', async () => {
            btn.setAttribute('disabled', 'true');
            btn.textContent = '…';
            try {
              const { commit } = await commitSplit(this.wiki, item);
              notify(this, ns.NOTIFY_DONE);
              const warn = commitWarning(this.wiki, commit);
              if (warn) {
                btn.removeAttribute('disabled');
                btn.textContent = `⚠ ${warn}`;
                return;
              }
              refresh();
            } catch (e: any) {
              btn.textContent = lingo(wiki, 'split.failed', 'Failed:') + ' ' + String((e as any).message || e);
            }
          });
          row.appendChild(btn);
          listBox.appendChild(row);
        }
      };
      inner.appendChild(listBox);
      wrap.appendChild(inner);
      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
      refresh();
    }
    refresh() {
      return false;
    }
  }
  return InboxSplitWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports['paste-split'] = makePasteSplit();
exports['inbox-split'] = makeInboxSplit();
