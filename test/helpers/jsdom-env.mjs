/*
jsdom-env.mjs — 导入解析 bundle（bin/pipeline.cjs）无头运行的 DOM 与依赖注入

- installDom()：把 jsdom 的 DOMParser/XMLSerializer/Node 挂到 globalThis（bundle 按浏览器全局取用）
- installJszip()：把 TW library 请求 "$:/plugins/keepone/tidme/import/jszip" 重定向到 npm jszip
  （bundle 里 import/* 保持 external，无头环境下没有 TW library 机制，用 Module._load 拦截）
- loadImportBundle()：加载 bin/pipeline.cjs 并完成上述注入（integration/import-*.test.mjs 唯一入口）
*/
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require_ = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

export function installDom() {
  const { JSDOM } = require_('jsdom');
  const { window } = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.DOMParser = window.DOMParser;
  globalThis.XMLSerializer = window.XMLSerializer;
  globalThis.Node = window.Node;
}

export async function installJszip() {
  const Module = await import('node:module');
  const origLoad = Module.default._load;
  Module.default._load = function(request, parent, isMain) {
    if (request === '$:/plugins/keepone/tidme/import/jszip') return require_('jszip');
    return origLoad.call(this, request, parent, isMain);
  };
}

/** 安装 DOM/jszip 注入并加载 bin/pipeline.cjs，返回其 default 导出 */
export async function loadImportBundle() {
  installDom();
  await installJszip();
  return (await import(pathToFileURL(path.join(here, '../../bin/pipeline.cjs')).href)).default;
}

/** demo.epub 测试夹具的绝对路径（由 tools/make-fixture.mjs 生成并入库） */
export function fixtureEpubPath() {
  return path.join(here, '../../tools/fixtures/demo.epub');
}
