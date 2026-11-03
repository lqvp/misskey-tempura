/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export function changeAccountRecord<T>(records: Record<string, T>, key: string, value: T | null): Record<string, T> {
	const next = { ...records };
	if (value === null) delete next[key];
	else next[key] = value;
	return next;
}
