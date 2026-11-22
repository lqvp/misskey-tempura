/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, markRaw, nextTick, reactive, ref } from 'vue';
import Popup from '@/ui/_common_/popup.vue';

afterEach(cleanup);

describe('popup rendering', () => {
	test('preserves existing popup props and events across list changes', async () => {
		const renderProps = vi.fn();
		const clicked = vi.fn();
		const label = ref('first');
		const component = markRaw(defineComponent({
			props: ['label'],
			emits: ['click'],
			setup: (props, { emit }) => () => h('button', { onClick: () => emit('click') }, props.label),
		}));
		const props = { get label() { renderProps(); return label.value; } };
		const popups = reactive([{ id: 1, component, props, events: { click: clicked } }]);
		const view = render(defineComponent({ setup: () => () => popups.map(popup => h(Popup, { key: popup.id, popup })) }));
		const reads = renderProps.mock.calls.length;
		popups.push({ id: 2, component, props: { label: 'second' }, events: { click: clicked } });
		await nextTick();
		expect(renderProps).toHaveBeenCalledTimes(reads);
		await fireEvent.click(view.getByText('first'));
		expect(clicked).toHaveBeenCalledOnce();
		popups.pop();
		await nextTick();
		expect(renderProps).toHaveBeenCalledTimes(reads);
		label.value = 'updated';
		await nextTick();
		expect(view.getByText('updated')).toBeTruthy();
		popups.pop();
		await nextTick();
		expect(view.container.textContent).toBe('');
	});
});
