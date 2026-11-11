/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import MkA from '@/components/global/MkA.vue';
const mocks = vi.hoisted(() => ({ menu: vi.fn(), page: vi.fn(), push: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'alice' } }));
vi.mock('@/os.js', () => ({ contextMenu: mocks.menu, pageWindow: mocks.page }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: mocks.push }) }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {} } }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
let app: ReturnType<typeof createApp>;
let root: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); window.location.href = 'http://localhost/?as=alice'; vi.spyOn(window, 'open').mockReturnValue(null); });
afterEach(() => { app.unmount(); root.remove(); vi.restoreAllMocks(); });

async function mount(to: string) {
	root = document.createElement('div'); document.body.append(root);
	app = createApp(MkA, { to }); app.mount(root); await nextTick();
	root.querySelector('a')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
	return mocks.menu.mock.calls[0][0] as { action?: () => void }[];
}

describe('account boundary in link context actions', () => {
	it('opens another account in a browser tab for both page-window and force-page actions', async () => {
		const menu = await mount('/notes/42?as=bob');
		menu[1].action!(); menu[2].action!();
		expect(window.open).toHaveBeenCalledTimes(2);
		expect(window.open).toHaveBeenLastCalledWith('http://localhost/notes/42?as=bob', '_blank', 'noopener');
		expect(mocks.page).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
	});
	it('keeps same-account window and force-page navigation inside the current app', async () => {
		const menu = await mount('/notes/42'); menu[1].action!(); menu[2].action!();
		expect(mocks.page).toHaveBeenCalledWith('/notes/42');
		expect(mocks.push).toHaveBeenCalledWith('/notes/42', 'forcePage');
		expect(window.open).not.toHaveBeenCalled();
	});
});
