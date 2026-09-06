/*
migrate-manual-cards.cjs — 旧"无 kind 散卡"迁移为 item 卡（一次性迁移工具）

背景：分类重构前手动建的卡只有 FSRS 字段（state/due…），无 tidme.kind；
默认牌组 card 过滤器的"无 kind 兜底分支"收录它们，但它们进不了卡片管理器的
类型体系，也不是新制卡工厂的产物形态。

本工具扫描 wiki 中 `!has[tidme.kind]has[state]has[due]` 的旧散卡：
  - caption 含 <<C 宏 → tidme.subkind=cloze，否则 qa
  - 补 tidme.kind=item + tidme.subkind（其余字段不动）
默认只读预览；--apply 写回原 .tid 文件（经 $tw.utils.saveTiddlerToFile，
保留 $:/boot 记录的原路径，含 .meta 处理）。插件内 shadow 卡无源文件，跳过。

用法：
  node tools/migrate-manual-cards.cjs <wiki-dir>            # 只读预览
  node tools/migrate-manual-cards.cjs <wiki-dir> --apply    # 写回
*/

const fs = require('fs');
const path = require('path');
const TiddlyWiki = require('tiddlywiki');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dirArg = args.find((a) => !a.startsWith('--'));
const wikiDir = dirArg ? path.resolve(dirArg) : null;

if (!wikiDir || !fs.existsSync(path.join(wikiDir, 'tiddlywiki.info'))) {
  console.error('用法: node tools/migrate-manual-cards.cjs <wiki-dir> [--apply]');
  console.error('  <wiki-dir> 须含 tiddlywiki.info（迁移前请备份 wiki 目录）');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tidme-migrate-'));
const tw = TiddlyWiki.TiddlyWiki();
tw.preloadTiddlerArray([]);
tw.boot.argv = [wikiDir];
tw.boot.boot();
const wiki = tw.wiki;

const SCAN_FILTER = '[all[shadows+tiddlers]!is[draft]!has[tidme.kind]has[state]has[due]]';
const titles = wiki.filterTiddlers(SCAN_FILTER);

if (!titles.length) {
  console.log('✅ 未发现旧无 kind 散卡，无需迁移。');
  process.exit(0);
}

console.log(`发现 ${titles.length} 张旧散卡${apply ? '，--apply 写回：' : '（预览；加 --apply 写回）'}\n`);
let applied = 0;
let skipped = 0;
for (const title of titles) {
  const t = wiki.getTiddler(title);
  const f = t ? t.fields : {};
  const caption = String(f.caption || title);
  const subkind = caption.includes('<<C') ? 'cloze' : 'qa';
  const fileInfo = tw.boot.files[title];
  if (apply) {
    if (!fileInfo) {
      console.log(`  ⏭ 跳过（无源文件，插件/shadow 卡）: ${title}`);
      skipped++;
      continue;
    }
    wiki.addTiddler({ ...f, title, 'tidme.kind': 'item', 'tidme.subkind': subkind });
    try {
      tw.utils.saveTiddlerToFileSync(wiki.getTiddler(title), fileInfo);
      console.log(`  ✅ [${subkind}] ${title}`);
      applied++;
    } catch (e) {
      console.log(`  ✕ 写入失败 ${title}: ${e && e.message || e}`);
      skipped++;
    }
  } else {
    console.log(`  [${subkind}] ${title}`);
  }
}

if (apply) {
  console.log(`\n完成：迁移 ${applied} 张${skipped ? `，跳过 ${skipped} 张` : ''}。重启 wiki 后生效（item 卡由缺省牌组复习流收录）。`);
} else {
  console.log(`\n预览结束（共 ${titles.length} 张）。确认后加 --apply 执行写回。`);
}
