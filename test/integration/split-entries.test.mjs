/*
split-entries.test.mjs — 切分入口落库一致性（widgets/split）

回归背景：粘贴入口曾直接 `wiki.addTiddler(r.tiddlers)` 绕过 core/import-commit，
同一份文本经粘贴与剪藏两个入口落库结果不同（无对齐 → SRS 进度丢、消失节不归档）。
本文件锁定两个入口共用唯一落库门面：二次粘贴同名文档必须走对齐并保留 SRS 进度。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectButtons, renderWidget as renderWidgetBase } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-split-entries-' });
const splitMod = mod('import/widgets/split.js');
const nsMod = mod('core/ns.js');

/** 递归按标签名找元素（fake DOM 无 querySelector） */
function findByTag(node, tag, out = []) {
  if (!node) return out;
  if (String(node.tagName) === tag) out.push(node);
  for (const c of node.childNodes || []) findByTag(c, tag, out);
  return out;
}

/** 等条件成立（widget 的 click 处理器是 async，dispatchEvent 不 await） */
async function waitFor(pred, timeoutMs = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

function sectionsOfDoc(docTitle) {
  return wiki.filterTiddlers(`[tag[tidme-doc]title[${docTitle}]]`).length
    ? wiki.filterTiddlers(`[tidme.docpage[${docTitle}]tidme.kind[topic]!tag[tidme-doc]nsort[tidme.order]]`)
    : [];
}

/** 点一次「切分文本并入库」，等落库完成（以 tm-notify 完成通知为界，不看库状态猜） */
async function paste(text) {
  const { root, w } = renderWidgetBase(wiki, splitMod, 'paste-split');
  const ta = findByTag(root, 'TEXTAREA')[0];
  const btn = collectButtons(root)[0];
  assert.ok(ta && btn, 'paste-split 应渲染 textarea 与按钮');
  let done = false;
  w.dispatchEvent = (e) => {
    if (e.type === 'tm-notify' && e.param === nsMod.NOTIFY_DONE) done = true;
    return true;
  };
  ta.value = text;
  btn.dispatchEvent({ type: 'click' });
  return await waitFor(() => done);
}

/** 构造够长的两节文本（默认 minChars=600 会把短节合并成一张容器卡） */
function docText(jiaNote) {
  return `# 甲\n\n${jiaNote}。${'甲内容。'.repeat(200)}\n\n# 乙\n\n乙内容。${'乙内容。'.repeat(200)}`;
}

test('paste-split: 二次粘贴同名文档走对齐——不重复建卡且 SRS 进度保留', async () => {
  reset();
  assert.equal(await paste(docText('第一版内容')), true, '首次粘贴完成落库');

  const docTitle = wiki.filterTiddlers('[tag[tidme-doc]]')[0];
  assert.ok(docTitle, '生成文档页');
  const secs = sectionsOfDoc(docTitle);
  assert.equal(secs.length, 2, '两张节卡');
  const jia = secs.find((t) => wiki.getTiddler(t).fields.caption === '甲');
  assert.ok(jia, '找到甲节卡');
  // 模拟复习进度
  wiki.addTiddler({ ...wiki.getTiddler(jia).fields, state: '2', reps: '1' });

  assert.equal(await paste(docText('第一版内容修订')), true, '二次粘贴完成落库');

  const secs2 = sectionsOfDoc(docTitle);
  assert.equal(secs2.length, 2, '同名文档二次粘贴不重复建卡（走对齐而非直接写库）');
  assert.ok(secs2.includes(jia), '节卡 ID 稳定（对齐重挂接同一张卡）');
  assert.equal(wiki.getTiddler(jia).fields.state, '2', 'SRS 进度保留（旧实现直接写库会覆盖为新卡）');
  assert.equal(wiki.getTiddler(jia).fields.reps, '1');
  assert.ok(String(wiki.getTiddler(jia).fields.text).includes('修订'), '内容已更新为重挂接后的新版本');
});
