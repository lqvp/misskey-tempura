/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkWidgetSettingsDialog from './MkWidgetSettingsDialog.vue';
import { i18n } from '@/i18n.js';
export const Default = {
	args: {
		widgetName: 'nestedWidget',
		form: { interval: { type: 'number', default: 10, label: i18n.ts._widgetOptions._nestedWidget.interval } },
		currentSettings: { interval: 10, widgets: [] },
	},
} satisfies StoryObj<typeof MkWidgetSettingsDialog>;
