/*
typecheck.test.mjs — TS2304 守卫（未定义标识符 → 运行时 ReferenceError 的静态信号）

背景：曾出现 reading-list.ts 使用 reactive 却未 require（构建期不报错、渲染期不触发，
首次 refresh 时抛 ReferenceError 使整个 TW 刷新循环挂掉）。本测试跑
`tsc -p tsconfig.typecheck.json`（skipLibCheck + 仅检查 src），断言零 TS2304；
其余既存类型错误不在此守卫范围（属独立的类型债，不阻塞）。
*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('typecheck: 源码零 TS2304（未定义标识符）', () => {
  const tsc = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  let out = '';
  try {
    out = execFileSync(process.execPath, [tsc, '-p', 'tsconfig.typecheck.json'], {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // tsc 因既存类型错误以非零码退出：错误详情在 stdout/stderr，TS2304 守卫照常断言
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  const hits = out.split('\n').filter((line) => line.includes('error TS2304'));
  assert.equal(hits.length, 0, `存在未定义标识符（运行时会变成 ReferenceError）:\n${hits.join('\n')}`);
});
