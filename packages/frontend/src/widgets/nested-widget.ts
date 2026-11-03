/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Stored child settings follow each widget's own heterogeneous form schema.
export type NestedWidget = { id: string; name: string; data: Record<string, any> };

export function moveNestedWidget<T extends NestedWidget>(widgets: T[], id: string, offset: number): T[] {
	const index = widgets.findIndex(widget => widget.id === id);
	const target = index + offset;
	if (index < 0 || target < 0 || target >= widgets.length) return widgets;
	const result = [...widgets];
	const [widget] = result.splice(index, 1);
	result.splice(target, 0, widget);
	return result;
}

export function updateNestedWidget<T extends NestedWidget>(widgets: T[], id: string, data: Record<string, any>): T[] {
	return widgets.map(widget => widget.id === id ? { ...widget, data } : widget);
}

export function getNestedWidgetRotationDelay(seconds: number): number | null {
	return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 2147483647) : null;
}
