/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, inject } from 'vue';
import type { ComputedRef } from 'vue';
import { DI } from '@/di.js';

export function useIsCategorySearchTarget(markerId: string): ComputedRef<boolean> {
	const injectedSearchMarkerId = inject(DI.inAppSearchMarkerId, null);
	return computed(() => (injectedSearchMarkerId?.value ?? window.location.hash.slice(1)) === markerId);
}
