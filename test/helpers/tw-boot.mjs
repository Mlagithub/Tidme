/*
tw-boot.mjs — L2 集成测试唯一的 TW 无头环境入口（test/README.md §隔离）

职责：加载 bin 插件产物 → 在临时空目录 boot 隔离 TW 实例 → 提供 execute/reset。
约定：
- 必须用 TiddlyWiki.TiddlyWiki() 工厂创建隔离实例，不用全局 $tw 单例（进程内多 wiki 互不污染）
- 测试对象是 bin 产物（与 dev/发布一致），缺失时直接报错提示先构建
- 跨测试隔离用 reset()（清非系统 tiddler），不要依赖同文件前序用例的残留
*/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TiddlyWiki from "tiddlywiki";

const here = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.resolve(here, "../../bin");

export function loadPluginTiddlers({ langs = ["zh-Hans"] } = {}) {
	const names = ["$__plugins_keepone_tidme", ...langs.map((l) => `$__tidme_languages_${l}`)];
	const plugins = names
		.map((n) => path.join(binDir, `${n}.json`))
		.filter((f) => fs.existsSync(f))
		.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
	if (!plugins.length) throw new Error("缺少 bin 产物，先运行 node tools/build-plugins.cjs");
	return plugins;
}

/**
 * boot 一个隔离 TW 实例。
 * @param {object} [opts]
 * @param {string[]} [opts.langs] 额外加载的语言包（默认 zh-Hans，产物缺失自动跳过）
 * @param {string} [opts.prefix] 临时目录前缀（排查残留时定位用）
 * @param {object[]} [opts.preload] boot 前预载的 tiddler（造数/配置覆盖）
 * @returns {{tw, wiki, tmp, mod: (p: string) => any, reset: () => void}}
 *   mod(p) 等价 tw.modules.execute("$:/plugins/keepone/tidme/" + p)
 */
export function bootPlugin({ langs, prefix = "tidme-test-", preload = [] } = {}) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	const tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray([...loadPluginTiddlers({ langs }), ...preload]);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	const wiki = tw.wiki;
	return {
		tw,
		wiki,
		tmp,
		mod: (p) => tw.modules.execute(`$:/plugins/keepone/tidme/${p}`),
		reset: () => {
			for (const t of wiki.filterTiddlers("[!is[system]]")) wiki.deleteTiddler(t);
		}
	};
}
