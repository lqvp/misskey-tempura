/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import locales from 'i18n';
import { updateI18n } from '@/i18n.js';
import MkResult from '@/components/global/MkResult.vue';
import MkSystemIcon from '@/components/global/MkSystemIcon.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { adaptiveBorderDirective } from '@/directives/adaptive-border.js';
import Dialog from '@/components/MkWidgetSettingsDialog.vue';
import { useWidgetPropsManager } from '@/widgets/widget.js';

// The modal shell needs layout/focus APIs, not relevant to draft persistence.
vi.mock('@/components/MkModalWindow.vue', () => ({ default: defineComponent({
	props: ['okButtonDisabled'], emits: ['ok', 'close'],
	setup(props, { slots, emit, expose }) {
		expose({ close() {} });
		return () => h('div', [h('button', { id: 'save', disabled: props.okButtonDisabled, onClick: () => emit('ok') }, 'Save'), h('button', { id: 'cancel', onClick: () => emit('close') }, 'Cancel'), slots.default?.()]);
	},
}) }));
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

let app: App;
let root: HTMLElement;
afterEach(() => { app?.unmount(); root?.remove(); });
const initial = () => ({ interval: 10, widgets: [{ id: 'a', name: 'clock', data: { size: 'small' } }] });
async function mount() {
	updateI18n(locales['ja-JP']);
	const source = initial();
	const saved = vi.fn();
	app = createApp(Dialog, { widgetName: 'nestedWidget', form: { interval: { type: 'number', default: 10 } }, currentSettings: source, onSaved: saved });
	app.component('MkResult', MkResult);
	app.component('MkSystemIcon', MkSystemIcon);
	app.component('MkLoading', MkLoading);
	app.directive('adaptive-border', adaptiveBorderDirective);
	// A registered widget exercises the same preview/form contract as real widgets.
	app.component('widget-nestedWidget', defineComponent({ props: ['widget'], setup(props) {
		useWidgetPropsManager('nestedWidget', { interval: { type: 'number', default: 10 } }, props, () => {});
		return () => h('div');
	} }));
	app.component('widget-clock', defineComponent({ props: ['widget'], setup(props) {
		useWidgetPropsManager('clock', { size: { type: 'string', default: 'medium' } }, props, () => {});
		return () => h('div');
	} }));
	root = document.createElement('div'); document.body.append(root); app.mount(root);
	await nextTick();
	return { source, saved };
}

describe('nested widget settings draft', () => {
	test('edits a child with its existing form and discards all changes on cancel', async () => {
		const { source, saved } = await mount();
		const button = [...root.querySelectorAll('button')].find(el => el.textContent?.includes('時計'))!;
		button.click(); await nextTick(); await nextTick();
		const input = root.querySelector('input[type="text"]') as HTMLInputElement;
		expect(input.value).toBe('small');
		input.value = 'large'; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
		(root.querySelector('#cancel') as HTMLButtonElement).click();
		expect(source).toEqual(initial());
		expect(saved).not.toHaveBeenCalled();
	});
	test('saves edited child data while preserving its id and name', async () => {
		const { source, saved } = await mount();
		[...root.querySelectorAll('button')].find(el => el.textContent?.includes('時計'))!.click(); await nextTick(); await nextTick();
		const input = root.querySelector('input[type="text"]') as HTMLInputElement;
		input.value = 'large'; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
		(root.querySelector('#save') as HTMLButtonElement).click();
		expect(saved.mock.calls[0][0]).toEqual({ interval: 10, widgets: [{ id: 'a', name: 'clock', data: { size: 'large' } }] });
		expect(source).toEqual(initial());
	});
});
