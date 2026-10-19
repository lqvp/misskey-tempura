/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkSigninRiskItem from './MkSigninRiskItem.vue';

const base = {
	id: '0000000000',
	createdAt: '2026-10-19T12:00:00.000Z',
	ip: '198.51.100.5',
	headers: {},
	country: 'US',
	asn: 64501,
};

function story(signin: Record<string, unknown>) {
	return {
		render(args) {
			return {
				components: {
					MkSigninRiskItem,
				},
				setup() {
					return {
						args,
					};
				},
				template: '<MkSigninRiskItem v-bind="args" />',
			};
		},
		args: {
			signin: { ...base, ...signin } as never,
		},
		parameters: {
			layout: 'centered',
		},
	} satisfies StoryObj<typeof MkSigninRiskItem>;
}

export const EmailCodeRequested = story({ success: false, riskScore: 80, riskReasons: ['newDevice', 'newCountry', 'newAsn'], challenge: 'emailCode' });
export const Notified = story({ success: true, riskScore: 45, riskReasons: ['newCountry', 'vpn'], challenge: null });
export const DetailsHidden = story({ success: true, riskScore: null, riskReasons: [], challenge: 'passed' });
