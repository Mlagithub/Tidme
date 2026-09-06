/* build-parse.cjs — 打包浏览器导入解析 bundle（避免 PowerShell 的 $: 转义问题） */
const path = require('path');
const { execSync } = require('child_process');
execSync(
  'npx esbuild src/tidme/import/parse/main.ts --bundle --format=cjs --platform=browser --external:$:/* --outfile=bin/parse.cjs',
  { stdio: 'inherit', cwd: path.resolve(__dirname, '..') },
);
