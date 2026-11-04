/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, expect, it, vi } from 'vitest';
import { createRouter } from './lib/nirax/fixture.js';
const location = window.location;
afterEach(() => vi.stubGlobal('location', location));
it('boots the explicit different account without rendering its route under this identity', () => {
	vi.stubGlobal('location', { href: 'https://example.test/?as=alice', origin: 'https://example.test', search: '?as=alice' });
	const router = createRouter('/');
	router.init();
	router.pushByPath('/posts/private?as=bob');
	expect(window.location.href).toBe('https://example.test/posts/private?as=bob');
	expect(router.getCurrentFullPath()).toBe('/');
});
it('keeps same account SPA navigation and enforces legacy selector too', () => {
	vi.stubGlobal('location', { href: 'https://example.test/?as=alice', origin: 'https://example.test', search: '?as=alice' });
	const router = createRouter('/');
	router.init();
	router.pushByPath('/posts/own');
	expect(router.getCurrentFullPath()).toBe('/posts/own');
	router.replaceByPath('/posts/private?loginId=bob');
	expect(window.location.href).toBe('https://example.test/posts/private?as=bob');
	expect(router.getCurrentFullPath()).toBe('/posts/own');
});
