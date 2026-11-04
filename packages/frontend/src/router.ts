/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { accountUrl } from '@/utility/tab-account.js';
import { inject } from 'vue';
import { page } from '@/router.definition.js';
import { $i } from '@/i.js';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { analytics } from '@/analytics.js';
import { DI } from '@/di.js';

export type Router = Nirax<typeof ROUTE_DEF>;

export function createRouter(fullPath: string): Router {
	return new Nirax(ROUTE_DEF, fullPath, !!$i, page(() => import('@/pages/not-found.vue')));
}

export const mainRouter = createRouter(window.location.pathname + window.location.search + window.location.hash);

window.addEventListener('popstate', (event) => {
	if (new URLSearchParams(window.location.search).get('as') !== ($i?.id ?? null)) {
		window.location.reload();
		return;
	}
	mainRouter.replaceByPath(window.location.pathname + window.location.search + window.location.hash);
});

mainRouter.addListener('push', ctx => {
	window.history.pushState({ }, '', accountUrl(ctx.fullPath, $i?.id ?? null));
});

mainRouter.addListener('replace', ctx => {
	window.history.replaceState({ }, '', accountUrl(ctx.fullPath, $i?.id ?? null));
});

mainRouter.addListener('forceReplace', ctx => {
	window.location.replace(accountUrl(ctx.fullPath, $i?.id ?? null));
});

mainRouter.addListener('forcePush', ctx => {
	window.location.href = accountUrl(ctx.fullPath, $i?.id ?? null);
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
