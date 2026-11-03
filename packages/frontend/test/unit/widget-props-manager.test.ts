/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';
import { useWidgetPropsManager } from '@/widgets/widget.js';

// Settings dialogs are not opened by these synchronization tests.
vi.mock('@/os.js', () => ({ popup: vi.fn() }));

const definitions = {
	showHeader: { type: 'boolean' as const, default: true },
	label: { type: 'string' as const, default: 'default' as string | null, required: false as const },
	widgets: { type: 'array' as const, default: [] as { id: string }[], hidden: true },
};

describe('widget settings synchronization', () => {
	test('keeps nested widget defaults when stored settings omit the child list', async () => {
		const scope = effectScope();
		try {
			const props = reactive({ widget: { id: 'nest', data: {} as { showHeader?: boolean; widgets?: { id: string }[] } } });
			const manager = scope.run(() => useWidgetPropsManager('nestedWidget', definitions, props, vi.fn()))!;
			expect(manager.widgetProps.widgets).toEqual([]);
			props.widget.data = { showHeader: false };
			await nextTick();
			expect(manager.widgetProps.widgets).toEqual([]);
			expect(manager.widgetProps.showHeader).toBe(false);
			// This is the append operation used after choosing a nested child.
			manager.widgetProps.widgets = [...manager.widgetProps.widgets, { id: 'child' }];
			expect(manager.widgetProps.widgets).toEqual([{ id: 'child' }]);
		} finally {
			scope.stop();
		}
	});

	test('applies stored child lists, including an explicitly empty list', async () => {
		const scope = effectScope();
		try {
			const props = reactive({ widget: { id: 'nest', data: { widgets: [{ id: 'first' }] } } });
			const manager = scope.run(() => useWidgetPropsManager('nestedWidget', definitions, props, vi.fn()))!;
			props.widget.data = { widgets: [{ id: 'second' }] };
			await nextTick();
			expect(manager.widgetProps.widgets).toEqual([{ id: 'second' }]);
			props.widget.data = { widgets: [] };
			await nextTick();
			expect(manager.widgetProps.widgets).toEqual([]);
		} finally {
			scope.stop();
		}
	});

	test('restores omitted settings to defaults without replacing explicit null or falsy values', async () => {
		const scope = effectScope();
		try {
			const props = reactive({ widget: { id: 'nest', data: { showHeader: false, label: null } as { showHeader?: boolean; label?: string | null } } });
			const manager = scope.run(() => useWidgetPropsManager('nestedWidget', definitions, props, vi.fn()))!;
			props.widget.data = { showHeader: false, label: null };
			await nextTick();
			expect(manager.widgetProps.showHeader).toBe(false);
			expect(manager.widgetProps.label).toBeNull();
			props.widget.data = { label: '' };
			await nextTick();
			expect(manager.widgetProps.showHeader).toBe(true);
			expect(manager.widgetProps.label).toBe('');
		} finally {
			scope.stop();
		}
	});
});

describe('widget editor previews', () => {
	test('provides the real form and default values without persisting preview changes', async () => {
		const { createApp, defineComponent, h, provide } = await import('vue');
		const { widgetPreviewContext } = await import('@/widgets/widget-preview.js');
		let registration: any;
		const persisted = vi.fn();
		const child = defineComponent({ setup() {
			const manager = useWidgetPropsManager('nestedWidget', definitions, { widget: { id: 'preview-child', data: {} } }, persisted);
			manager.widgetProps.showHeader = false;
			manager.save();
			return () => h('div');
		} });
		const app = createApp(defineComponent({ setup() {
			provide(widgetPreviewContext, { register: value => { registration = value; } });
			return () => h(child);
		} }));
		const root = document.createElement('div');
		try {
			app.mount(root);
			await nextTick();
			expect(registration.id).toBe('preview-child');
			expect(registration.form.widgets.hidden).toBe(true);
			expect(registration.values.widgets).toEqual([]);
			expect(persisted).not.toHaveBeenCalled();
		} finally { app.unmount(); }
	});
});
