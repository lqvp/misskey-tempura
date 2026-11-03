/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject } from 'vue';
import { page } from '@/router.definition.js';
import { $i, bootAccount } from '@/i.js';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { analytics } from '@/analytics.js';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';
import { withAccount } from '@/utility/pinned-account.js';

export type Router = Nirax<typeof ROUTE_DEF>;

export function createRouter(fullPath: string): Router {
	return new Nirax(ROUTE_DEF, fullPath, !!$i, page(() => import('@/pages/not-found.vue')));
}

// ?as= はルーターの経路には含めず、ブラウザのURLを書くときだけ付ける
function currentPath() {
	return withAccount(window.location.pathname + window.location.search + window.location.hash, null);
}

function toBrowserUrl(fullPath: string) {
	return withAccount(fullPath, $i?.id ?? bootAccount.id ?? null);
}

export const mainRouter = createRouter(currentPath());

window.addEventListener('popstate', (event) => {
	mainRouter.replaceByPath(currentPath());
});

mainRouter.addListener('push', ctx => {
	window.history.pushState({ }, '', toBrowserUrl(ctx.fullPath));
});

mainRouter.addListener('replace', ctx => {
	window.history.replaceState({ }, '', toBrowserUrl(ctx.fullPath));
});

mainRouter.addListener('forceReplace', async ctx => {
	try { await prefer.flush(); } catch { return; }
	window.location.replace(toBrowserUrl(ctx.fullPath));
});

mainRouter.addListener('forcePush', async ctx => {
	try { await prefer.flush(); } catch { return; }
	window.location.href = toBrowserUrl(ctx.fullPath);
});

mainRouter.addListener('change', ctx => {
	if (_DEV_) console.log('mainRouter: change', ctx.fullPath);
	analytics.page({
		path: ctx.fullPath,
		title: ctx.fullPath,
	});
});

mainRouter.init();

export function useRouter(): Router {
	return inject(DI.router, null) ?? mainRouter;
}
