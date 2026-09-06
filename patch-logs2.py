# -*- coding: utf-8 -*-
# 补丁二：修正 CRLF 与 dprint 格式导致的两个未命中锚点
R = {
"src/tidme/review/buttons/action/repeat.tid": [
("addsuffix[/log/]addsuffix<now [UTC]YYYY0MM0DD>", "addsuffix[/log]"),
("$index={{{ [<now [UTC]0hh0mm0ssXXX>] }}}", "$index={{{ [<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>] }}}"),
],
"src/tidme/manager/widgets/settings.ts": [(
"""      row(
        '过载触发阈值',
        numberInput(Number(ap.maxOverdueThreshold), 0, 9999, 1, (v) => config.writeAutoPostpone(wiki, { maxOverdueThreshold: v })),
        '逾期卡超过该数量才触发顺延（0 = 无门槛）',
      );""",
"""      row(
        '过载触发阈值',
        numberInput(Number(ap.maxOverdueThreshold), 0, 9999, 1, (v) => config.writeAutoPostpone(wiki, { maxOverdueThreshold: v })),
        '逾期卡超过该数量才触发顺延（0 = 无门槛）',
      );
      row(
        '复习日志保留天数',
        numberInput(config.readLogRetentionDays(wiki), 0, 3650, 1, (v) => config.writeLogRetentionDays(wiki, v)),
        '超过该天数的复习日志启动时自动清理（0 = 永久保留）',
      );"""
)],
}
errs = []
for f, pairs in R.items():
    s = open(f, encoding="utf-8", newline="").read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            errs.append(f"{f}: count={n}: {old[:70]}")
        else:
            s = s.replace(old, new)
    open(f, "w", encoding="utf-8", newline="").write(s)
if errs:
    raise SystemExit("ERRORS:\n" + "\n".join(errs))
print("ok: 2 files patched")
