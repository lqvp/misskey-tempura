/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { InjectionKey } from 'vue';
import type { Form } from '@/utility/form.js';
import type { WidgetName } from './index.js';

// Widget forms have heterogeneous values; keep the same record contract as MkForm.
export type WidgetPreviewRegistration = {
	id: string | null;
	name: WidgetName;
	form: Form;
	values: Record<string, any>;
};
export const widgetPreviewContext: InjectionKey<{ register: (widget: WidgetPreviewRegistration) => void }> = Symbol('widgetPreview');
