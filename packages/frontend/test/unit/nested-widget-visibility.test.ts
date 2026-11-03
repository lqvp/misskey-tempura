/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import locales from 'i18n';
import { updateI18n } from '@/i18n.js';
import Widget from '@/widgets/WidgetNestedWidget.vue';

const { start, stop } = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@@/js/interval.js', () => ({ createVisibilityAwareInterval: start }));
vi.mock('@/widgets/widget.js', () => ({ useWidgetPropsManager: (_name: string, _def: unknown, props: any) => ({ widgetProps: props.widget.data, configure: vi.fn(), save: vi.fn() }) }));
vi.mock('@/components/MkContainer.vue', () => ({ default: defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()); } }) }));

let app: ReturnType<typeof createApp> | undefined;
let root: HTMLElement;
afterEach(() => { app?.unmount(); app = undefined; root?.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

test('stops CSS-hidden rotation, resumes only when visible, and disconnects on unmount', async () => {
	updateI18n(locales['ja-JP']);
	let visibilityChanged: (entries: { isIntersecting: boolean }[]) => void;
	const disconnect = vi.fn();
	const observe = vi.fn();
	vi.stubGlobal('IntersectionObserver', class {
		constructor(callback: typeof visibilityChanged) { visibilityChanged = callback; }
		observe = observe;
		disconnect = disconnect;
	});
	start.mockReturnValue(stop);
	root = document.createElement('div'); document.body.append(root);
	app = createApp(Widget, { widget: { id: 'nest', name: 'nestedWidget', data: { interval: 1, widgets: [{ id: 'a', name: 'clock', data: {} }, { id: 'b', name: 'calendar', data: {} }] } } });
	app.mount(root); await nextTick();
	expect(observe).toHaveBeenCalledOnce();
	expect(start).not.toHaveBeenCalled();
	visibilityChanged!([{ isIntersecting: true }]);
	expect(start).toHaveBeenCalledTimes(1);
	expect(start.mock.calls[0][1]).toBe(1000);
	visibilityChanged!([{ isIntersecting: false }]);
	expect(stop).toHaveBeenCalledTimes(1);
	expect(start).toHaveBeenCalledTimes(1);
	visibilityChanged!([{ isIntersecting: true }]);
	expect(start).toHaveBeenCalledTimes(2);
	app.unmount(); app = undefined;
	expect(stop).toHaveBeenCalledTimes(2);
	expect(disconnect).toHaveBeenCalledOnce();
});
