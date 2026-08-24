/*
build-plugins.cjs — 编译 src/ 下全部插件为 out-m2/$__<plugin>.json

用 tiddlywiki-plugin-dev 的 packup.rebuild（esbuild 编译 .ts/.tsx、压缩、Tailwind）产出
与 dev 模式一致的插件 tiddler，落盘为 TiddlyWiki tiddler 文件格式（`$:/` → `$__`，`/` → `_`），
供无头测试（tools/study-flow-test.cjs 等）与 CI 使用。

附带产出 out-m2/pipeline.cjs（esbuild bundle 的导入管线），供 tools/pipeline-headless.mjs 使用。

用法：node tools/build-plugins.cjs [--dev]
  --dev  不压缩（开发/调试）
*/
const path = require("path");
const fs = require("fs");
const os = require("os");
const dev = require("tiddlywiki-plugin-dev");

/** tiddler 标题 → tiddler 文件文件名（$:/前缀 → $__，其余 / → _） */
function tiddlerFileName(title) {
	return "$__" + title.replace(/^\$:\//, "").replace(/\//g, "_") + ".json";
}

(async () => {
	const root = path.resolve(__dirname, "..");
	const src = path.join(root, "src");
	const out = path.join(root, "out-m2");
	const devMode = process.argv.includes("--dev");
	fs.rmSync(out, { recursive: true, force: true });
	fs.mkdirSync(out, { recursive: true });

	// 以空临时目录为宿主启动 $tw（避开 filesystem syncer；loadPluginFolder 只需核心已加载）
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-build-"));
	const $tw = dev.tiddlywiki([], tmp);
	const plugins = (await dev.rebuild($tw, src, [], devMode, undefined)).filter(Boolean);
	fs.rmSync(tmp, { recursive: true, force: true });

	for (const p of plugins) {
		const name = tiddlerFileName(p.title);
		const json = JSON.stringify(p);
		fs.writeFileSync(path.join(out, name), json);
		console.log(`built ${p.title} -> ${name} (${json.length} bytes)`);
	}

	// 附带：导入管线 bundle（pipeline-headless 的输入）——用 esbuild JS API，避免 npx 子进程残留
	// $:/plugins/tidme/core/* 通过 onResolve 内联进 bundle（无头测试不依赖 TW 运行时）；import/* 保持外部（jszip）
	const esbuild = require("esbuild");
	const coreResolvePlugin = {
		name: "tidme-core-alias",
		setup(build) {
			build.onResolve({ filter: /^\$:\/plugins\/tidme\/core\// }, (args) => {
				const name = args.path.replace(/^\$:\/plugins\/tidme\/core\//, "");
				return { path: path.join(root, "src/core", name + ".ts"), namespace: "file" };
			});
		}
	};
	await esbuild.build({
		entryPoints: [path.join(root, "src/import/pipeline/main.ts")],
		bundle: true,
		format: "cjs",
		platform: "browser",
		plugins: [coreResolvePlugin],
		external: ["$:/plugins/tidme/import/*"],
		outfile: path.join(out, "pipeline.cjs"),
		logLevel: "info"
	});
	console.log(`done: ${plugins.length} plugins + pipeline.cjs -> ${out}`);
	// 强制退出：TiddlyWiki 实例的定时器会保持事件循环不结束
	process.exit(0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
