/* build-pipeline.cjs — 打包浏览器管线 bundle（避免 PowerShell 的 $: 转义问题） */
const path = require("path");
const { execSync } = require("child_process");
execSync(
	'npx esbuild src/tidme/import/pipeline/main.ts --bundle --format=cjs --platform=browser --external:$:/* --outfile=out-m2/pipeline.cjs',
	{ stdio: "inherit", cwd: path.resolve(__dirname, "..") }
);
