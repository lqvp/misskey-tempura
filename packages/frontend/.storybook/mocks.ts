/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { type SharedOptions, http, HttpResponse } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';

export const onUnhandledFrame = (({ frame, defaults }) => {
	if (frame instanceof HttpNetworkFrame) {
		const url = new URL(frame.data.request.url);
		if (url.hostname !== 'localhost' || /^\/(?:client-assets\/|fluent-emoji\/|iframe.html$|node_modules\/|src\/|sb-|static-assets\/|vite\/)/.test(url.pathname)) {
			return;
		}
	}
	defaults.warn();
}) satisfies SharedOptions['onUnhandledFrame'];

export const commonHandlers = [
	http.post('/api/meta', () => {
		// Minimal instance meta so stories that read `instance` do not depend on a live server.
		return HttpResponse.json({
			maintainerName: null,
			maintainerEmail: null,
			version: 'storybook',
			name: 'Storybook',
			shortName: null,
			uri: 'http://localhost',
			description: null,
			langs: [],
			tosUrl: null,
			privacyPolicyUrl: null,
			inquiryUrl: null,
			repositoryUrl: 'https://github.com/lqvp/misskey-tempura',
			feedbackUrl: null,
			impressumUrl: null,
			disableRegistration: true,
			emailRequiredForSignup: false,
			enableHcaptcha: false,
			enableMcaptcha: false,
			enableRecaptcha: false,
			enableTurnstile: false,
			swPublickey: null,
			themeColor: '#86b300',
			mascotImageUrl: '/client-assets/about-icon.png',
			bannerUrl: null,
			infoImageUrl: null,
			serverErrorImageUrl: null,
			notFoundImageUrl: null,
			iconUrl: null,
			backgroundImageUrl: null,
			logoImageUrl: null,
			maxNoteTextLength: 3000,
			emojis: [],
			defaultLightTheme: null,
			defaultDarkTheme: null,
			ads: [],
			enableEmail: false,
			enableServiceWorker: false,
			translatorAvailable: false,
			mediaSilencedHosts: [],
			federation: 'none',
			federationHosts: [],
			features: {},
		});
	}),
	http.post('/api/i/registry/keys', () => {
		// No persisted client registry in Storybook.
		return HttpResponse.json([]);
	}),
	http.get('/fluent-emoji/:codepoints.png', async ({ params }) => {
		const { codepoints } = params;
		const value = await fetch(`https://unpkg.com/@misskey-dev/emoji-assets@17.0.3/built/fluent-emoji/${codepoints}.png`).then((response) => response.blob());
		return new HttpResponse(value, {
			headers: {
				'Content-Type': 'image/png',
			},
		});
	}),
	http.get('/twemoji/:codepoints.svg', async ({ params }) => {
		const { codepoints } = params;
		const value = await fetch(`https://unpkg.com/@misskey-dev/emoji-assets@17.0.3/built/twemoji/${codepoints}.svg`).then((response) => response.blob());
		return new HttpResponse(value, {
			headers: {
				'Content-Type': 'image/svg+xml',
			},
		});
	}),
];
