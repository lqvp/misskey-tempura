/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// chartjs-adapter-date-fns (MIT) と同等だが、date-fns の parse (書式指定パーサー) を含めないための自前実装。
// Misskey のチャートは数値・Date・ISO 文字列しか渡さないので、書式指定のパースは不要。

import { _adapters } from 'chart.js';
import {
	toDate, parseISO, isValid, format,
	addYears, addQuarters, addMonths, addWeeks, addDays, addHours, addMinutes, addSeconds, addMilliseconds,
	differenceInYears, differenceInQuarters, differenceInMonths, differenceInWeeks, differenceInDays,
	differenceInHours, differenceInMinutes, differenceInSeconds, differenceInMilliseconds,
	startOfYear, startOfQuarter, startOfMonth, startOfWeek, startOfDay, startOfHour, startOfMinute, startOfSecond,
	endOfYear, endOfQuarter, endOfMonth, endOfWeek, endOfDay, endOfHour, endOfMinute, endOfSecond,
} from 'date-fns';
import type { Day } from 'date-fns';
import type { TimeUnit } from 'chart.js';

const FORMATS = {
	datetime: 'MMM d, yyyy, h:mm:ss aaaa',
	millisecond: 'h:mm:ss.SSS aaaa',
	second: 'h:mm:ss aaaa',
	minute: 'h:mm aaaa',
	hour: 'ha',
	day: 'MMM d',
	week: 'PP',
	month: 'MMM yyyy',
	quarter: 'qqq - yyyy',
	year: 'yyyy',
};

const add = {
	millisecond: addMilliseconds,
	second: addSeconds,
	minute: addMinutes,
	hour: addHours,
	day: addDays,
	week: addWeeks,
	month: addMonths,
	quarter: addQuarters,
	year: addYears,
} satisfies Record<TimeUnit, (time: number, amount: number) => Date>;

const diff = {
	millisecond: differenceInMilliseconds,
	second: differenceInSeconds,
	minute: differenceInMinutes,
	hour: differenceInHours,
	day: differenceInDays,
	week: differenceInWeeks,
	month: differenceInMonths,
	quarter: differenceInQuarters,
	year: differenceInYears,
} satisfies Record<TimeUnit, (max: number, min: number) => number>;

const startOf = {
	second: startOfSecond,
	minute: startOfMinute,
	hour: startOfHour,
	day: startOfDay,
	week: startOfWeek,
	month: startOfMonth,
	quarter: startOfQuarter,
	year: startOfYear,
} satisfies Partial<Record<TimeUnit, (time: number) => Date>>;

const endOf = {
	second: endOfSecond,
	minute: endOfMinute,
	hour: endOfHour,
	day: endOfDay,
	week: endOfWeek,
	month: endOfMonth,
	quarter: endOfQuarter,
	year: endOfYear,
} satisfies Partial<Record<TimeUnit, (time: number) => Date>>;

_adapters._date.override({
	formats: () => FORMATS,

	parse(value) {
		if (value == null) return null;
		let date: Date | null = null;
		if (typeof value === 'number' || value instanceof Date) {
			date = toDate(value);
		} else if (typeof value === 'string') {
			date = parseISO(value);
		}
		return date != null && isValid(date) ? date.getTime() : null;
	},

	format(time, fmt) {
		return format(time, fmt);
	},

	add(time, amount, unit) {
		return add[unit](time, amount).getTime();
	},

	diff(max, min, unit) {
		return diff[unit](max, min);
	},

	startOf(time, unit, weekday) {
		if (unit === 'isoWeek') return startOfWeek(time, { weekStartsOn: Number(weekday) as Day }).getTime();
		return unit in startOf ? startOf[unit as keyof typeof startOf](time).getTime() : time;
	},

	endOf(time, unit) {
		return unit in endOf ? endOf[unit as keyof typeof endOf](time).getTime() : time;
	},
});
