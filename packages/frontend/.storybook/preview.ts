/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { FORCE_RE_RENDER, FORCE_REMOUNT } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';
import { type Preview, setup } from '@storybook/vue3';
import isChromatic from 'chromatic/isChromatic';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { userDetailed } from './fakes.js';
import { commonHandlers, onUnhandledFrame } from './mocks.js';
import themes from './themes.js';
import '../src/style.scss';

const appInitialized = Symbol();

let lastStory: string | null = null;
let moduleInitialized = false;
let unobserve = () => {};
let misskeyOS = null;

function loadTheme(themeMaganer: typeof import('../src/theme')['themeManager']) {
	unobserve();
	const theme = themes[window.document.documentElement.dataset.misskeyTheme];
	if (theme) {
		themeMaganer.updateTheme(themes[window.document.documentElement.dataset.misskeyTheme]);
	} else {
		themeMaganer.updateTheme(themes['l-light']);
	}
	const observer = new MutationObserver((entries) => {
		for (const entry of entries) {
			if (entry.attributeName === 'data-misskey-theme') {
				const target = entry.target as HTMLElement;
				const theme = themes[target.dataset.misskeyTheme];
				if (theme) {
					themeMaganer.updateTheme(themes[target.dataset.misskeyTheme]);
				} else {
					target.removeAttribute('style');
				}
			}
		}
	});
	observer.observe(window.document.documentElement, {
		attributes: true,
		attributeFilter: ['data-misskey-theme'],
	});
	unobserve = () => observer.disconnect();
}

function initLocalStorage() {
	localStorage.clear();
	localStorage.setItem('account', JSON.stringify({
		...userDetailed(),
		policies: {},
	}));
}

initLocalStorage();
// Start the MSW worker before importing app modules: several modules fire
// API requests at import time (instance meta, preference registry), and they
// must be intercepted rather than hit a nonexistent server.
const mswWorker = setupWorker(...commonHandlers);
const mswWorkerReady = mswWorker.start({ onUnhandledFrame }).then(async () => {
	// Service worker activation races the first page load: probe until
	// interception is actually live before app modules issue import-time
	// API requests.
	for (let i = 0; i < 150; i++) {
		try {
			const res = await fetch('/api/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
			if (res.ok) {
				return;
			}
		} catch {
			// worker not controlling yet
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
});
// Awaited at module top level: Storybook waits for the preview module before
// rendering, so the global setup() (theme, components, widgets) is always
// registered before the first story mounts.
await mswWorkerReady;
const [{ default: components }, { default: directives }, { default: widgets }, { themeManager }, { prefer }, os] = await Promise.all([
	import('../src/components/index.js'),
	import('../src/directives/index.js'),
	import('../src/widgets/index.js'),
	import('../src/theme.js'),
	import('../src/preferences.js'),
	import('../src/os.js'),
]);
setup((app) => {
	moduleInitialized = true;
	if (app[appInitialized]) {
		return;
	}
	app[appInitialized] = true;
	loadTheme(themeManager);
	components(app);
	directives(app);
	widgets(app);
	misskeyOS = os;
	if (isChromatic()) {
		prefer.commit('animation', false);
	}
});

const preview = {
	decorators: [
		(Story, context) => {
			if (lastStory === context.id) {
				lastStory = null;
			} else {
				lastStory = context.id;
				const channel = addons.getChannel();
				const resetIndexedDBPromise = globalThis.indexedDB?.databases
					? indexedDB.databases().then((r) => {
							for (var i = 0; i < r.length; i++) {
								indexedDB.deleteDatabase(r[i].name!);
							}
						}).catch(() => {})
					: Promise.resolve();
				const resetDefaultStorePromise = import('../src/store').then(({ store }) => {
					// @ts-expect-error
					store.init();
				}).catch(() => {});
				Promise.all([resetIndexedDBPromise, resetDefaultStorePromise]).then(() => {
					initLocalStorage();
					channel.emit(FORCE_RE_RENDER, { storyId: context.id });
				});
			}
			const story = Story();
			if (!moduleInitialized) {
				const channel = addons.getChannel();
				(globalThis.requestIdleCallback || setTimeout)(() => {
					channel.emit(FORCE_REMOUNT, { storyId: context.id });
				});
			}
			return story;
		},
		(Story, context) => {
			return {
				setup() {
					return {
						context,
						popups: misskeyOS.popups,
					};
				},
				template:
					'<component :is="popup.component" v-for="popup in popups" :key="popup.id" v-bind="popup.props" v-on="popup.events"/>' +
					'<story />',
			};
		},
	],
	loaders: [mswLoader(async () => {
		await mswWorkerReady;
		return mswWorker;
	})],
	parameters: {
		controls: {
			exclude: /^__/,
		},
		msw: {
			handlers: commonHandlers,
		},
	},
} satisfies Preview;

export default preview;
