/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { Component } from 'vue';
import { Nirax } from '@/lib/nirax.js';

vi.mock('@/i.js', () => ({
	$i: null,
	iAmModerator: false,
	iAmSubModerator: false,
}));
vi.mock('@/pages/_loading_.vue', () => ({ default: { name: 'loading-page' } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { name: 'error-page' } }));
vi.mock('@/pages/timeline.vue', () => ({ default: { name: 'timeline-page' } }));

const { ROUTE_DEF } = await import('@/router.definition.js');

const loginFallback = { name: 'login-fallback' } as Component;

describe('/tempura-diff route and legacy /tempura-changelog redirect', () => {
	test('resolves /tempura-diff directly without login requirement or unused hash prop', () => {
		const router = new Nirax(ROUTE_DEF, '/tempura-diff', false, loginFallback);
		const resolved = router.resolve('/tempura-diff');

		expect(resolved).not.toBeNull();
		expect(resolved?.route.path).toBe('/tempura-diff');
		expect(resolved?.route.loginRequired).toBeFalsy();
		expect(resolved?.route.hash).toBeUndefined();
		expect('component' in resolved!.route).toBe(true);
	});

	test.each([false, true])('redirects /tempura-changelog to /tempura-diff on init while preserving query and hash (loggedIn: %s)', (isLoggedIn) => {
		const router = new Nirax(ROUTE_DEF, '/tempura-changelog?from=legacy#section-1', isLoggedIn, loginFallback);
		const replacements: string[] = [];

		router.addListener('replace', ctx => {
			replacements.push(ctx.fullPath);
		});

		router.init();

		expect(router.getCurrentFullPath()).toBe('/tempura-diff?from=legacy#section-1');
		expect(router.current.route.path).toBe('/tempura-diff');
		expect(router.current.redirected).toBe(true);
		expect(replacements).toEqual(['/tempura-diff?from=legacy#section-1']);
	});

	test('redirects /tempura-changelog to /tempura-diff on pushByPath while preserving query and hash', () => {
		const router = new Nirax(ROUTE_DEF, '/about-misskey-tempura', true, loginFallback);
		const pushed: string[] = [];
		const changed: string[] = [];

		router.addListener('push', ctx => {
			pushed.push(ctx.fullPath);
		});
		router.addListener('change', ctx => {
			changed.push(ctx.fullPath);
		});

		router.init();
		router.pushByPath('/tempura-changelog?q=digest#top');

		expect(router.getCurrentFullPath()).toBe('/tempura-diff?q=digest#top');
		expect(router.current.route.path).toBe('/tempura-diff');
		expect(pushed).toEqual(['/tempura-diff?q=digest#top']);
		expect(changed).toEqual(['/tempura-diff?q=digest#top']);
	});
});
