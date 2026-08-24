/*
make-fixture.mjs — 构造最小合法 EPUB 测试夹具（源自 D:\work\tidme-import\tools\build-fixture.js）

结构覆盖：
  ch1.xhtml  有 h1/h2/h3 标题、碎行段落（验证 smartMerge）、超长单段（验证句读硬切）、
             多个中段（验证块边界分段）、短节（验证合并）
  ch2.xhtml  无标题纯段（验证虚拟节 + NCX 续章继承）

用法：node tools/make-fixture.mjs <out.epub>
*/
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import JSZip from "jszip";

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>流水线验证之书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh</dc:language>
    <dc:identifier id="bookid">urn:uuid:fixture-0001</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>`;

const NCX = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:fixture-0001"/></head>
  <docTitle><text>流水线验证之书</text></docTitle>
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>第一章 导论</text></navLabel><content src="ch1.xhtml"/>
      <navPoint id="n1b" playOrder="2"><navLabel><text>第一章 导论(续)</text></navLabel><content src="ch1.xhtml#sec-b"/></navPoint>
    </navPoint>
    <navPoint id="n2" playOrder="3"><navLabel><text>第二章 无标题章</text></navLabel><content src="ch2.xhtml"/></navPoint>
  </navMap>
</ncx>`;

const longSentence = "这是一个用于触发超长切分的完整句子，它以句号结尾。";
const LONG_P = Array.from({ length: 60 }, (_, i) => `第${i + 1}遍。` + longSentence).join("");

const CH1 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>c1</title></head><body>
<h1>第一章 导论</h1>
<p>本节介绍<em>背景</em>，</p>
<p><strong>句子</strong>在这里被硬换行打断，</p>
<p>合并后应当成为一个自然段。</p>
<h2>一、研究背景</h2>
<p>这一小节的正文非常简短。</p>
<h3>1.1 现状</h3>
<p>同样很短。</p>
<h2>二、长文压力测试</h2>
<p>${LONG_P}</p>
<p>收尾的一段正常文字，用来确认分段之后仍有内容衔接。</p>
</body></html>`;

const CH2 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>c2</title></head><body>
<p>第二章没有可识别的标题标记。</p>
<p>它应当整体成为一张卡片，面包屑继承 NCX 章名。</p>
</body></html>`;

// ---- EPUB3（nav.xhtml 目录，无 NCX） ----
const OPF3 = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>EPUB3 导航之书</dc:title>
    <dc:creator>导航作者</dc:creator>
    <dc:language>zh</dc:language>
    <dc:identifier id="bookid">urn:uuid:fixture-0003</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

const NAV = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>目录</h1>
  <ol>
    <li><a href="ch1.xhtml#s1">第一章 起点</a>
      <ol>
        <li><a href="ch1.xhtml#s2">一、背景</a></li>
        <li><a href="ch1.xhtml#s3">二、结论</a></li>
      </ol>
    </li>
  </ol>
</nav>
</body>
</html>`;

const CH3 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>c1</title></head><body>
<h1 id="s1">第一章 起点</h1>
<p>起点正文。</p>
<h2 id="s2">一、背景</h2>
<p>背景正文，足够长以形成独立卡片的内容填充，保持段落完整。这里继续补充若干文字确保卡片非空且可读。</p>
<h2 id="s3">二、结论</h2>
<p>结论正文。</p>
</body></html>`;

export async function buildFixtureEpub() {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
	zip.file("META-INF/container.xml", CONTAINER);
	zip.file("OEBPS/content.opf", OPF);
	zip.file("OEBPS/toc.ncx", NCX);
	zip.file("OEBPS/ch1.xhtml", CH1);
	zip.file("OEBPS/ch2.xhtml", CH2);
	return await zip.generateAsync({ type: "uint8array", mimeType: "application/epub+zip" });
}

/** EPUB3（nav-only，无 NCX）夹具 */
export async function buildFixtureEpub3() {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
	zip.file("META-INF/container.xml", CONTAINER.replace("content.opf", "content3.opf"));
	zip.file("OEBPS/content3.opf", OPF3);
	zip.file("OEBPS/nav.xhtml", NAV);
	zip.file("OEBPS/ch1.xhtml", CH3);
	return await zip.generateAsync({ type: "uint8array", mimeType: "application/epub+zip" });
}

// 直接执行：node tools/make-fixture.mjs <out.epub> [out3.epub ...]
if (process.argv[1] && process.argv[1].endsWith("make-fixture.mjs")) {
	const outs = process.argv.slice(2);
	if (!outs.length) { console.error("用法: node make-fixture.mjs out.epub [out3.epub ...]"); process.exit(1); }
	for (const o of outs) {
		const bytes = o.includes("3") && o !== outs[0] ? await buildFixtureEpub3() : await buildFixtureEpub();
		mkdirSync(dirname(o), { recursive: true });
		writeFileSync(o, bytes);
		console.log("已生成夹具:", o, bytes.length, "bytes");
	}
}
