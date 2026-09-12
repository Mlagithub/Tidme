/*
tw-date.mjs — TiddlyWiki 17 位 UTC 日期串（与 $tw.utils.parseDate 语义一致）
*/

/** Date → 17 位 TW 日期串（yyyymmddhhmmssmmm，UTC） */
export function twDate(d = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
}

/** 17 位 TW 日期串 → Date（UTC；与 $tw.utils.parseDate 一致） */
export function parseTwDate(s) {
  const str = String(s);
  return new Date(Date.UTC(
    Number(str.slice(0, 4)),
    Number(str.slice(4, 6)) - 1,
    Number(str.slice(6, 8)),
    Number(str.slice(8, 10)),
    Number(str.slice(10, 12)),
    Number(str.slice(12, 14)),
    Number(str.slice(14, 17)),
  ));
}

/** 相对当前时刻 offsetHours 小时的 17 位日期串（正未来 / 负过去） */
export const T = (offsetHours) => twDate(new Date(Date.now() + offsetHours * 3600000));

/** 约 48 小时前（逾期） */
export const PAST = () => T(-48);

/** 约 48 小时后（未来排期） */
export const FUTURE = () => T(48);

/** 学习日串（YYYYMMDD）+ 换天小时 → 该学习日内的一个真实时刻（本地时刻构造）。
 *
 *  学习日 = 本地日(now − rolloverHour)，故学习日的起点是「该本地日的 rolloverHour 点」；
 *  默认再 +1 小时，保证落在学习日内部（即使换天小时为 0 也在日内）。
 *  用途：构造"属于今日学习日"的日志键/时刻，避免用 UTC 日（todayKey）拼键——
 *  那在 UTC 正偏移时区的夜间会落到上一个学习日。 */
export function learningDayInstant(learningDay, rolloverHour = 4, offsetHours = 1) {
  const y = Number(learningDay.slice(0, 4));
  const m = Number(learningDay.slice(4, 6));
  const d = Number(learningDay.slice(6, 8));
  return new Date(y, m - 1, d, rolloverHour + offsetHours, 0, 0, 0);
}
