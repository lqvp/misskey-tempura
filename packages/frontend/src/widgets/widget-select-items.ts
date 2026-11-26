/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ItemOption, MkSelectItem } from '@/components/MkSelect.vue';
import type { WidgetName } from '@/widgets/index.js';
import { tempuraWidgets } from '@/widgets/index.js';

const tempuraWidgetSet = new Set<WidgetName>(tempuraWidgets);

type BuildWidgetSelectItemsCommonOptions = {
	widgetNames: readonly WidgetName[];
	getLabel: (widgetName: WidgetName) => string;
	originalFeatureLabel: string;
};

export type BuildWidgetSelectItemsWithNoneOptions = BuildWidgetSelectItemsCommonOptions & {
	includeNone: true;
	noneLabel: string;
};

export type BuildWidgetSelectItemsWithoutNoneOptions = BuildWidgetSelectItemsCommonOptions & {
	includeNone?: false;
};

export function buildWidgetSelectItems(
	options: BuildWidgetSelectItemsWithNoneOptions,
): MkSelectItem<WidgetName | null>[];
export function buildWidgetSelectItems(
	options: BuildWidgetSelectItemsWithoutNoneOptions,
): MkSelectItem<WidgetName>[];
export function buildWidgetSelectItems(
	options: BuildWidgetSelectItemsWithNoneOptions | BuildWidgetSelectItemsWithoutNoneOptions,
): MkSelectItem<WidgetName | null>[] {
	const standardItems: ItemOption<WidgetName>[] = [];
	const originalItems: ItemOption<WidgetName>[] = [];

	for (const widgetName of options.widgetNames) {
		const option: ItemOption<WidgetName> = {
			label: options.getLabel(widgetName),
			value: widgetName,
		};

		if (tempuraWidgetSet.has(widgetName)) {
			originalItems.push(option);
		} else {
			standardItems.push(option);
		}
	}

	const items: MkSelectItem<WidgetName | null>[] = options.includeNone
		? [{ label: options.noneLabel, value: null }, ...standardItems]
		: [...standardItems];

	if (originalItems.length > 0) {
		items.push({
			type: 'group',
			label: options.originalFeatureLabel,
			items: originalItems,
		});
	}

	return items;
}
