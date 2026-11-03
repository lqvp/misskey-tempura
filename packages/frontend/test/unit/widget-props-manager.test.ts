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
	label: { type: 'string' as const, default: 'default' as string | null },
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
