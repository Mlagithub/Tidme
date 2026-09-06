# -*- coding: utf-8 -*-
# pdf.test.mjs：跨 realm 断言改写为 JSON 字符串比较
f = "test/integration/pdf.test.mjs"
s = open(f, encoding="utf-8", newline="").read()
pairs = [
("  assert.deepEqual(nodes2.map((n) => [n.title, n.page]), [['第一章', 1], ['子节', 2], ['1.1 小节', 3]]);",
 "  assert.equal(JSON.stringify(nodes2.map((n) => [n.title, n.page])), JSON.stringify([['第一章', 1], ['子节', 2], ['1.1 小节', 3]]));"),
("""  assert.deepEqual(sections, [
    { title: 'A 章', startPage: 2, endPage: 2 },
    { title: 'B 章', startPage: 3, endPage: 8 },
  ]);""",
"""  assert.equal(
    JSON.stringify(sections.map((x) => ({ title: x.title, startPage: x.startPage, endPage: x.endPage }))),
    JSON.stringify([{ title: 'A 章', startPage: 2, endPage: 2 }, { title: 'B 章', startPage: 3, endPage: 8 }]),
  );"""),
("  assert.deepEqual(parsePdf.parsePagesField('3-7'), { start: 3, end: 7 });\n  assert.deepEqual(parsePdf.parsePagesField(''), { start: 1, end: 0 });",
 "  assert.equal(JSON.stringify({ ...parsePdf.parsePagesField('3-7') }), JSON.stringify({ start: 3, end: 7 }));\n  assert.equal(JSON.stringify({ ...parsePdf.parsePagesField('') }), JSON.stringify({ start: 1, end: 0 }));"),
]
for old, new in pairs:
    c = s.count(old)
    if c != 1:
        raise SystemExit(f"NOT FOUND (count={c}): {old[:60]}")
    s = s.replace(old, new)
open(f, "w", encoding="utf-8", newline="").write(s)
print("ok: 3 assertions rewritten")
