/*
tw-date.mjs — TiddlyWiki 17 位 UTC 日期串（与 $tw.utils.parseDate 语义一致）
*/

/** Date → 17 位 TW 日期串（yyyymmddhhmmssmmm，UTC） */
export function twDate(d = new Date()) {
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
}

/** 17 位 TW 日期串 → Date（UTC；与 $tw.utils.parseDate 一致） */
export function parseTwDate(s) {
	const str = String(s);
	return new Date(Date.UTC(
		Number(str.slice(0, 4)), Number(str.slice(4, 6)) - 1, Number(str.slice(6, 8)),
		Number(str.slice(8, 10)), Number(str.slice(10, 12)), Number(str.slice(12, 14)), Number(str.slice(14, 17))
	));
}

/** 相对当前时刻 offsetHours 小时的 17 位日期串（正未来 / 负过去） */
export const T = (offsetHours) => twDate(new Date(Date.now() + offsetHours * 3600000));

/** 约 48 小时前（逾期） */
export const PAST = () => T(-48);

/** 约 48 小时后（未来排期） */
export const FUTURE = () => T(48);
