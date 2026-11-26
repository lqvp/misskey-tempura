/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick } from 'vue';
import type { MkDialogReturnType } from '@/components/MkDialog.vue';
import type { ItemGroup, ItemOption, MkSelectItem } from '@/components/MkSelect.vue';
import type { OptionValue } from '@/types/option-value.js';
import type { WidgetName } from '@/widgets/index.js';
import { federationWidgets, tempuraWidgets, widgets } from '@/widgets/index.js';
import { buildWidgetSelectItems } from '@/widgets/widget-select-items.js';
import MkDialog from '@/components/MkDialog.vue';
import MkWidgets from '@/components/MkWidgets.vue';
import MkNestedWidgetEditor from '@/components/MkNestedWidgetEditor.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';

type PopupMenuEntry = {
	type?: string;
	text?: string;
	action?: () => void;
};

type PopupMenuOptions = {
	width?: number;
	onClosing?: () => void;
};

type SelectOptions = {
	title?: string;
	text?: string;
	default?: OptionValue | null;
	items: (MkSelectItem<WidgetName> | undefined)[];
};

const { popupMenu, select } = vi.hoisted(() => ({
	popupMenu: vi.fn<(items: PopupMenuEntry[], evOrEl?: unknown, options?: PopupMenuOptions) => void>(),
	select: vi.fn<(props: SelectOptions) => Promise<MkDialogReturnType>>(),
}));

vi.mock('@/os.js', () => ({
	popupMenu,
	select,
}));

const federationWidgetSet = new Set<WidgetName>(federationWidgets);
const tempuraWidgetSet = new Set<WidgetName>(tempuraWidgets);
const standardWidgets = widgets.filter(widgetName => !tempuraWidgetSet.has(widgetName));
const standardWidgetsWithoutFederation = standardWidgets.filter(widgetName => !federationWidgetSet.has(widgetName));
const widgetsWithoutFederation = widgets.filter(widgetName => !federationWidgetSet.has(widgetName));

const initialFederation = instance.federation;
const activeDialogDisposers = new Set<() => void>();

afterEach(() => {
	for (const dispose of activeDialogDisposers) {
		dispose();
	}
	activeDialogDisposers.clear();
	cleanup();
	instance.federation = initialFederation;
	popupMenu.mockReset();
	select.mockReset();
	vi.restoreAllMocks();
});

function isGroup<T extends OptionValue>(item: MkSelectItem<T> | undefined): item is ItemGroup<T> {
	return item != null && item.type === 'group';
}

function isOption<T extends OptionValue>(item: MkSelectItem<T> | undefined): item is ItemOption<T> {
	return item != null && item.type !== 'group';
}

function flattenValues<T extends OptionValue>(items: readonly (MkSelectItem<T> | undefined)[]): T[] {
	return items.flatMap(item => {
		if (isGroup(item)) return item.items.map(option => option.value);
		if (isOption(item)) return [item.value];
		return [];
	});
}

describe('widgets registry ordering', () => {
	test('has no duplicates and places federationWidgets right after chat and tempuraWidgets at the end', () => {
		expect(new Set(widgets).size).toBe(widgets.length);

		const chatIndex = widgets.indexOf('chat');
		expect(chatIndex).toBeGreaterThan(-1);
		expect(widgets.slice(chatIndex + 1, chatIndex + 1 + federationWidgets.length)).toEqual([...federationWidgets]);

		const tempuraStart = chatIndex + 1 + federationWidgets.length;
		expect(tempuraStart).toBe(standardWidgets.length);
		expect(widgets.slice(tempuraStart)).toEqual([...tempuraWidgets]);
		expect(tempuraWidgets).toEqual([
			'listenBrainz',
			'weather',
			'nestedWidget',
			'earthQuake',
			'federationJobQueue',
			'tlDigest',
		]);
		expect(widgets).toHaveLength(standardWidgets.length + tempuraWidgets.length);
	});
});

describe('buildWidgetSelectItems', () => {
	const getLabel = (widgetName: WidgetName) => `label:${widgetName}`;

	test('prepends none, keeps standard items flat, and groups Tempura widgets when includeNone is true', () => {
		const items = buildWidgetSelectItems({
			widgetNames: widgets,
			getLabel,
			originalFeatureLabel: 'Original Features',
			includeNone: true,
			noneLabel: 'None',
		});

		expect(items).toHaveLength(1 + standardWidgets.length + 1);
		expect(items[0]).toEqual({ label: 'None', value: null });

		const standardItems = items.slice(1, 1 + standardWidgets.length).filter(isOption);
		expect(standardItems).toHaveLength(standardWidgets.length);
		expect(standardItems.map(item => item.value)).toEqual(standardWidgets);
		expect(standardItems.slice(-1 - federationWidgets.length).map(item => item.value)).toEqual([
			'chat',
			...federationWidgets,
		]);

		const lastItem = items.at(-1);
		expect(isGroup(lastItem)).toBe(true);
		expect(lastItem).toEqual({
			type: 'group',
			label: 'Original Features',
			items: tempuraWidgets.map(widgetName => ({
				label: `label:${widgetName}`,
				value: widgetName,
			})),
		});
	});

	test('omits none item when includeNone is false or omitted', () => {
		const itemsFalse = buildWidgetSelectItems({
			widgetNames: widgets,
			getLabel,
			originalFeatureLabel: 'Original Features',
			includeNone: false,
		});
		const itemsOmitted = buildWidgetSelectItems({
			widgetNames: widgets,
			getLabel,
			originalFeatureLabel: 'Original Features',
		});

		expect(itemsFalse).toEqual(itemsOmitted);
		expect(itemsFalse).toHaveLength(standardWidgets.length + 1);
		expect(itemsFalse[0]).toEqual({ label: `label:${standardWidgets[0]}`, value: standardWidgets[0] });
		expect(flattenValues(itemsFalse)).not.toContain(null);

		expect(itemsFalse.at(-1)).toEqual({
			type: 'group',
			label: 'Original Features',
			items: tempuraWidgets.map(widgetName => ({
				label: `label:${widgetName}`,
				value: widgetName,
			})),
		});
	});

	test('places the original feature group right after chat when federationWidgets are excluded', () => {
		const items = buildWidgetSelectItems({
			widgetNames: widgetsWithoutFederation,
			getLabel,
			originalFeatureLabel: 'Original Features',
			includeNone: true,
			noneLabel: 'None',
		});

		expect(items).toHaveLength(1 + standardWidgetsWithoutFederation.length + 1);
		const values = flattenValues(items);
		for (const federationWidget of federationWidgets) {
			expect(values).not.toContain(federationWidget);
		}
		expect(items.at(-2)).toEqual({ label: 'label:chat', value: 'chat' });
		expect(items.at(-1)).toEqual({
			type: 'group',
			label: 'Original Features',
			items: tempuraWidgets.map(widgetName => ({
				label: `label:${widgetName}`,
				value: widgetName,
			})),
		});
	});

	test('does not emit an empty group when no Tempura widgets are present', () => {
		const standardOnly: readonly WidgetName[] = ['profile', 'clock', 'chat'];
		const itemsWithNone = buildWidgetSelectItems({
			widgetNames: standardOnly,
			getLabel,
			originalFeatureLabel: 'Original Features',
			includeNone: true,
			noneLabel: 'None',
		});
		const itemsWithoutNone = buildWidgetSelectItems({
			widgetNames: standardOnly,
			getLabel,
			originalFeatureLabel: 'Original Features',
		});
		const emptyWithNone = buildWidgetSelectItems({
			widgetNames: [],
			getLabel,
			originalFeatureLabel: 'Original Features',
			includeNone: true,
			noneLabel: 'None',
		});
		const emptyWithoutNone = buildWidgetSelectItems({
			widgetNames: [],
			getLabel,
			originalFeatureLabel: 'Original Features',
		});

		expect(itemsWithNone.some(isGroup)).toBe(false);
		expect(itemsWithNone).toEqual([
			{ label: 'None', value: null },
			{ label: 'label:profile', value: 'profile' },
			{ label: 'label:clock', value: 'clock' },
			{ label: 'label:chat', value: 'chat' },
		]);
		expect(itemsWithoutNone.some(isGroup)).toBe(false);
		expect(itemsWithoutNone).toEqual([
			{ label: 'label:profile', value: 'profile' },
			{ label: 'label:clock', value: 'clock' },
			{ label: 'label:chat', value: 'chat' },
		]);
		expect(emptyWithNone.some(isGroup)).toBe(false);
		expect(emptyWithNone).toEqual([{ label: 'None', value: null }]);
		expect(emptyWithoutNone).toEqual([]);
	});

	test('handles input containing only Tempura widgets', () => {
		const expectedGroup: ItemGroup<WidgetName> = {
			type: 'group',
			label: 'Original Features',
			items: tempuraWidgets.map(widgetName => ({
				label: `label:${widgetName}`,
				value: widgetName,
			})),
		};

		const itemsWithoutNone = buildWidgetSelectItems({
			widgetNames: tempuraWidgets,
			getLabel,
			originalFeatureLabel: 'Original Features',
		});
		const itemsWithNone = buildWidgetSelectItems({
			widgetNames: tempuraWidgets,
			getLabel,
			originalFeatureLabel: 'Original Features',
			includeNone: true,
			noneLabel: 'None',
		});

		expect(itemsWithoutNone).toEqual([expectedGroup]);
		expect(itemsWithNone).toEqual([
			{ label: 'None', value: null },
			expectedGroup,
		]);
	});

	test('preserves relative order of standard and Tempura widgets separately', () => {
		const mixed: readonly WidgetName[] = ['clock', 'earthQuake', 'profile', 'weather'];
		const items = buildWidgetSelectItems({
			widgetNames: mixed,
			getLabel,
			originalFeatureLabel: 'Original Features',
		});

		expect(items).toEqual([
			{ label: 'label:clock', value: 'clock' },
			{ label: 'label:profile', value: 'profile' },
			{
				type: 'group',
				label: 'Original Features',
				items: [
					{ label: 'label:earthQuake', value: 'earthQuake' },
					{ label: 'label:weather', value: 'weather' },
				],
			},
		]);
	});
});

describe('MkWidgets widget selector integration', () => {
	function renderMkWidgets() {
		return render(MkWidgets, {
			props: {
				widgets: [],
				edit: true,
			},
			global: {
				stubs: {
					MkDraggable: true,
				},
				directives: {
					'adaptive-border': {},
				},
			},
		});
	}

	test('passes none, standard widgets, originalFeature group label, and Tempura widgets to MkSelect popup menu and updates displayed text across selection and addition', async () => {
		instance.federation = 'all';
		const view = renderMkWidgets();
		const widgetSelect = view.getByTestId('widget-select');
		const selectTrigger = widgetSelect.querySelector<HTMLElement>('[tabindex="0"]')!;

		expect(widgetSelect.textContent).toContain(i18n.ts.none);

		await fireEvent.keyDown(selectTrigger, { key: 'Enter' });

		expect(popupMenu).toHaveBeenCalledTimes(1);
		const menu = popupMenu.mock.calls[0][0];
		const labelIndex = menu.findIndex(item => item.type === 'label');

		expect(labelIndex).toBe(1 + standardWidgets.length);
		expect(menu).toHaveLength(1 + standardWidgets.length + 1 + tempuraWidgets.length);
		expect(menu[0].text).toBe(i18n.ts.none);
		expect(menu.slice(1, labelIndex).map(item => item.text)).toEqual(
			standardWidgets.map(widgetName => i18n.ts._widgets[widgetName]),
		);
		expect(menu.slice(labelIndex - 1 - federationWidgets.length, labelIndex).map(item => item.text)).toEqual([
			i18n.ts._widgets.chat,
			...federationWidgets.map(widgetName => i18n.ts._widgets[widgetName]),
		]);
		expect(menu[labelIndex]).toEqual({
			type: 'label',
			text: i18n.ts.originalFeature,
		});
		expect(menu.slice(labelIndex + 1).map(item => item.text)).toEqual(
			tempuraWidgets.map(widgetName => i18n.ts._widgets[widgetName]),
		);

		// Selecting a grouped Tempura widget updates the displayed value, and adding resets it back to none.
		const weatherMenuItem = menu.find(item => item.text === i18n.ts._widgets.weather);
		expect(weatherMenuItem?.action).toBeTypeOf('function');
		weatherMenuItem!.action!();
		popupMenu.mock.calls[0][2]?.onClosing?.();
		await nextTick();

		expect(widgetSelect.textContent).toContain(i18n.ts._widgets.weather);
		expect(widgetSelect.textContent).not.toContain(i18n.ts.none);

		await fireEvent.click(view.getByTestId('widget-add'));
		await nextTick();

		const emitted = view.emitted<[{ name: string; id: string; data: Record<string, unknown> }]>('addWidget');
		expect(emitted).toHaveLength(1);
		expect(emitted[0][0].name).toBe('weather');
		expect(widgetSelect.textContent).toContain(i18n.ts.none);
		expect(widgetSelect.textContent).not.toContain(i18n.ts._widgets.weather);
	});

	test('excludes federationWidgets in MkWidgets when instance.federation is none', async () => {
		instance.federation = 'none';
		const view = renderMkWidgets();
		const selectTrigger = view.getByTestId('widget-select').querySelector<HTMLElement>('[tabindex="0"]')!;

		await fireEvent.keyDown(selectTrigger, { key: 'Enter' });

		expect(popupMenu).toHaveBeenCalledTimes(1);
		const menu = popupMenu.mock.calls[0][0];
		const labelIndex = menu.findIndex(item => item.type === 'label');

		expect(labelIndex).toBe(1 + standardWidgetsWithoutFederation.length);
		expect(menu).toHaveLength(1 + standardWidgetsWithoutFederation.length + 1 + tempuraWidgets.length);
		for (const federationWidget of federationWidgets) {
			expect(menu.map(item => item.text)).not.toContain(i18n.ts._widgets[federationWidget]);
		}
		expect(menu[labelIndex - 1].text).toBe(i18n.ts._widgets.chat);
		expect(menu[labelIndex]).toEqual({
			type: 'label',
			text: i18n.ts.originalFeature,
		});
		expect(menu.slice(labelIndex + 1).map(item => item.text)).toEqual(
			tempuraWidgets.map(widgetName => i18n.ts._widgets[widgetName]),
		);
	});

	test('keeps view-mode widget filtering working when instance.federation is none', () => {
		instance.federation = 'none';
		const view = render(MkWidgets, {
			props: {
				widgets: [
					{ id: 'w1', name: 'clock', data: {} },
					{ id: 'w2', name: 'federation', data: {} },
					{ id: 'w3', name: 'weather', data: {} },
				],
				edit: false,
			},
			global: {
				stubs: {
					'widget-clock': { template: '<div data-testid="rendered-clock"/>' },
					'widget-federation': { template: '<div data-testid="rendered-federation"/>' },
					'widget-weather': { template: '<div data-testid="rendered-weather"/>' },
				},
			},
		});

		expect(view.queryByTestId('rendered-clock')).not.toBeNull();
		expect(view.queryByTestId('rendered-federation')).toBeNull();
		expect(view.queryByTestId('rendered-weather')).not.toBeNull();
	});
});

describe('MkNestedWidgetEditor widget selector integration', () => {
	// Stub only the modal shell so MkDialog, useMkSelect, MkSelect, and MkButton run end-to-end without layout/focus-trap globals.
	const MkModalStub = defineComponent({
		name: 'MkModal',
		emits: ['click', 'closed', 'esc'],
		setup(_, { slots, emit, expose }) {
			expose({
				close() {
					emit('closed');
				},
			});
			return () => h('div', { 'data-testid': 'mk-dialog-modal' }, slots.default?.());
		},
	});

	function renderEditor() {
		return render(MkNestedWidgetEditor, {
			props: {
				modelValue: [],
			},
			global: {
				stubs: {
					MkResult: true,
				},
			},
		});
	}

	function mockSelectWithDialog() {
		let currentDialog: ReturnType<typeof render> | null = null;
		const onDone = vi.fn<(result: MkDialogReturnType) => void>();

		select.mockImplementation(selectProps => new Promise<MkDialogReturnType>(resolve => {
			let dialogView: ReturnType<typeof render> | null = null;
			let disposed = false;

			const dispose = () => {
				if (disposed) return;
				disposed = true;
				activeDialogDisposers.delete(dispose);
				dialogView?.unmount();
				dialogView = null;
			};

			activeDialogDisposers.add(dispose);
			dialogView = render(MkDialog, {
				props: {
					title: selectProps.title,
					text: selectProps.text,
					select: {
						items: selectProps.items.filter(item => item !== undefined),
						default: selectProps.default ?? null,
					},
					onDone: (result: MkDialogReturnType) => {
						onDone(result);
						resolve(result);
					},
					onClosed: dispose,
				},
				global: {
					stubs: {
						MkModal: MkModalStub,
						MkSystemIcon: true,
						MkLoading: true,
						Mfm: {
							props: ['text'],
							template: '<span>{{ text }}</span>',
						},
					},
					directives: {
						'adaptive-border': {},
					},
				},
			});
			currentDialog = dialogView;
		}));

		return {
			getDialog() {
				if (currentDialog == null) {
					throw new Error('Expected MkDialog to be mounted');
				}
				return currentDialog;
			},
			onDone,
		};
	}

	test('passes grouped widget select items without none to os.select and emits model update and edit on selection', async () => {
		instance.federation = 'all';
		select.mockResolvedValue({ canceled: false, result: 'weather' });
		const view = renderEditor();

		await fireEvent.click(view.getByRole('button', { name: i18n.ts.add }));

		expect(select).toHaveBeenCalledTimes(1);
		const selectArgs = select.mock.calls[0][0];
		expect(selectArgs.title).toBe(i18n.ts.selectWidget);
		expect(selectArgs.items).toHaveLength(standardWidgets.length + 1);
		expect(flattenValues(selectArgs.items)).not.toContain(null);

		const standardOptions = selectArgs.items.slice(0, standardWidgets.length).filter(isOption);
		expect(standardOptions).toHaveLength(standardWidgets.length);
		expect(standardOptions.map(item => item.value)).toEqual(standardWidgets);
		expect(standardOptions.slice(-1 - federationWidgets.length).map(item => item.value)).toEqual([
			'chat',
			...federationWidgets,
		]);
		expect(selectArgs.items.at(-1)).toEqual({
			type: 'group',
			label: i18n.ts.originalFeature,
			items: tempuraWidgets.map(widgetName => ({
				label: i18n.ts._widgets[widgetName],
				value: widgetName,
			})),
		});

		const updated = view.emitted<[Array<{ id: string; name: string; data: Record<string, unknown> }>]>('update:modelValue');
		expect(updated).toHaveLength(1);
		expect(updated[0][0]).toHaveLength(1);
		const addedWidget = updated[0][0][0];
		expect(addedWidget.name).toBe('weather');

		const editEmitted = view.emitted<[string]>('edit');
		expect(editEmitted).toHaveLength(1);
		expect(editEmitted[0][0]).toBe(addedWidget.id);
	});

	test('allows selecting nestedWidget itself from the original feature group', async () => {
		instance.federation = 'all';
		select.mockResolvedValue({ canceled: false, result: 'nestedWidget' });
		const view = renderEditor();

		await fireEvent.click(view.getByRole('button', { name: i18n.ts.add }));

		expect(select).toHaveBeenCalledTimes(1);
		const group = select.mock.calls[0][0].items.at(-1);
		expect(isGroup(group)).toBe(true);
		if (isGroup(group)) {
			expect(group.items).toContainEqual({
				label: i18n.ts._widgets.nestedWidget,
				value: 'nestedWidget',
			});
		}

		const updated = view.emitted<[Array<{ id: string; name: string; data: Record<string, unknown> }>]>('update:modelValue');
		expect(updated).toHaveLength(1);
		expect(updated[0][0][0].name).toBe('nestedWidget');

		const editEmitted = view.emitted<[string]>('edit');
		expect(editEmitted).toHaveLength(1);
		expect(editEmitted[0][0]).toBe(updated[0][0][0].id);
	});

	test('excludes federationWidgets from os.select when instance.federation is none and emits nothing when canceled', async () => {
		instance.federation = 'none';
		select.mockResolvedValue({ canceled: true, result: undefined });
		const view = renderEditor();

		await fireEvent.click(view.getByRole('button', { name: i18n.ts.add }));

		expect(select).toHaveBeenCalledTimes(1);
		const selectArgs = select.mock.calls[0][0];
		expect(selectArgs.items).toHaveLength(standardWidgetsWithoutFederation.length + 1);
		const values = flattenValues(selectArgs.items);
		for (const federationWidget of federationWidgets) {
			expect(values).not.toContain(federationWidget);
		}
		expect(selectArgs.items.at(-2)).toEqual({ label: i18n.ts._widgets.chat, value: 'chat' });
		expect(selectArgs.items.at(-1)).toEqual({
			type: 'group',
			label: i18n.ts.originalFeature,
			items: tempuraWidgets.map(widgetName => ({
				label: i18n.ts._widgets[widgetName],
				value: widgetName,
			})),
		});

		expect(view.emitted('update:modelValue')).toBeUndefined();
		expect(view.emitted('edit')).toBeUndefined();
	});

	test('selects weather from the original feature group in MkDialog, confirms, and adds the child widget', async () => {
		instance.federation = 'all';
		const { getDialog, onDone } = mockSelectWithDialog();
		const view = renderEditor();

		await fireEvent.click(view.getByRole('button', { name: i18n.ts.add }));
		await nextTick();

		expect(select).toHaveBeenCalledTimes(1);
		const dialog = getDialog();
		expect(dialog.container.textContent).toContain(i18n.ts.selectWidget);

		const selectTrigger = dialog.container.querySelector<HTMLElement>('[tabindex="0"]');
		expect(selectTrigger).not.toBeNull();
		if (selectTrigger == null) throw new Error('Expected MkSelect trigger inside MkDialog');

		await fireEvent.keyDown(selectTrigger, { key: 'Enter' });

		expect(popupMenu).toHaveBeenCalledTimes(1);
		const menu = popupMenu.mock.calls[0][0];
		const labelIndex = menu.findIndex(item => item.type === 'label');

		expect(labelIndex).toBe(standardWidgets.length);
		expect(menu).toHaveLength(standardWidgets.length + 1 + tempuraWidgets.length);
		expect(menu.map(item => item.text)).not.toContain(i18n.ts.none);
		expect(menu.slice(0, labelIndex).map(item => item.text)).toEqual(
			standardWidgets.map(widgetName => i18n.ts._widgets[widgetName]),
		);
		expect(menu[labelIndex]).toEqual({
			type: 'label',
			text: i18n.ts.originalFeature,
		});

		const originalFeatureItems = menu.slice(labelIndex + 1);
		expect(originalFeatureItems.map(item => item.text)).toEqual(
			tempuraWidgets.map(widgetName => i18n.ts._widgets[widgetName]),
		);

		const weatherMenuItem = originalFeatureItems.find(item => item.text === i18n.ts._widgets.weather);
		expect(weatherMenuItem?.action).toBeTypeOf('function');
		weatherMenuItem?.action?.();
		popupMenu.mock.calls[0][2]?.onClosing?.();
		await nextTick();

		expect(selectTrigger.textContent).toContain(i18n.ts._widgets.weather);

		await fireEvent.click(dialog.getByTestId('modal-dialog-ok'));
		await nextTick();

		expect(onDone).toHaveBeenCalledTimes(1);
		expect(onDone).toHaveBeenCalledWith({ canceled: false, result: 'weather' });
		expect(dialog.queryByTestId('modal-dialog-ok')).toBeNull();

		const updated = view.emitted<[Array<{ id: string; name: string; data: Record<string, unknown> }>]>('update:modelValue');
		expect(updated).toHaveLength(1);
		expect(updated[0][0]).toHaveLength(1);
		const addedWidget = updated[0][0][0];
		expect(addedWidget.name).toBe('weather');
		expect(addedWidget.data).toEqual({});

		const editEmitted = view.emitted<[string]>('edit');
		expect(editEmitted).toHaveLength(1);
		expect(editEmitted[0][0]).toBe(addedWidget.id);
	});

	test('cancels MkDialog after selecting an original feature item without adding a child widget', async () => {
		instance.federation = 'all';
		const { getDialog, onDone } = mockSelectWithDialog();
		const view = renderEditor();

		await fireEvent.click(view.getByRole('button', { name: i18n.ts.add }));
		await nextTick();

		const dialog = getDialog();
		const selectTrigger = dialog.container.querySelector<HTMLElement>('[tabindex="0"]');
		expect(selectTrigger).not.toBeNull();
		if (selectTrigger == null) throw new Error('Expected MkSelect trigger inside MkDialog');

		await fireEvent.keyDown(selectTrigger, { key: 'Enter' });

		expect(popupMenu).toHaveBeenCalledTimes(1);
		const menu = popupMenu.mock.calls[0][0];
		const labelIndex = menu.findIndex(item => item.type === 'label');
		expect(labelIndex).toBe(standardWidgets.length);

		const weatherMenuItem = menu.slice(labelIndex + 1).find(item => item.text === i18n.ts._widgets.weather);
		expect(weatherMenuItem?.action).toBeTypeOf('function');
		weatherMenuItem?.action?.();
		popupMenu.mock.calls[0][2]?.onClosing?.();
		await nextTick();

		expect(selectTrigger.textContent).toContain(i18n.ts._widgets.weather);

		await fireEvent.click(dialog.getByTestId('modal-dialog-cancel'));
		await nextTick();

		expect(onDone).toHaveBeenCalledTimes(1);
		expect(onDone).toHaveBeenCalledWith({ canceled: true, result: undefined });
		expect(dialog.queryByTestId('modal-dialog-cancel')).toBeNull();
		expect(view.emitted('update:modelValue')).toBeUndefined();
		expect(view.emitted('edit')).toBeUndefined();
	});
});
