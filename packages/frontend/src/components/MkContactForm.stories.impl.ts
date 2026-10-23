/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkContactForm from './MkContactForm.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkContactForm,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				events() {
					return {
						updated: action('updated'),
					};
				},
			},
			template: '<MkContactForm v-bind="args" v-on="events" />',
		};
	},
	args: {
		contactForm: {
			id: 'storybook-contact-form-1',
			status: 'pending',
			category: 'other',
			subject: 'Storybook test inquiry',
			content: 'This is a test contact form submission for Storybook.',
			name: 'Test User',
			email: 'test@example.com',
			misskeyUsername: 'testuser',
			replyMethod: 'email',
			createdAt: '2026-01-01T00:00:00.000Z',
			ipAddress: '192.0.2.1',
			userAgent: 'Storybook',
			adminNote: '',
			assignedUser: null,
			assignedNickname: null,
			user: null,
		},
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkContactForm>;
