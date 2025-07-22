/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { genId } from '@/utility/id.js';

export type DeliveryTargetPreset = {
	id: string;
	name: string;
	description?: string;
	mode: 'include' | 'exclude';
	hosts: string[];
	isDefault?: boolean;
	createdAt: number;
	updatedAt: number;
};

export function createDeliveryTargetPreset(data: Partial<DeliveryTargetPreset> = {}): DeliveryTargetPreset {
	const now = Date.now();
	return {
		id: genId(),
		name: '',
		description: '',
		mode: 'include',
		hosts: [],
		isDefault: false,
		createdAt: now,
		updatedAt: now,
		...data,
	};
}

export function duplicateDeliveryTargetPreset(preset: DeliveryTargetPreset, newName?: string): DeliveryTargetPreset {
	return createDeliveryTargetPreset({
		...preset,
		id: genId(),
		name: newName || `${preset.name} (コピー)`,
		isDefault: false,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	});
}

export function validateDeliveryTargetPreset(preset: DeliveryTargetPreset): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!preset.name || preset.name.trim() === '') {
		errors.push('presetNameRequired');
	}

	if (!['include', 'exclude'].includes(preset.mode)) {
		errors.push('invalidMode');
	}

	if (!Array.isArray(preset.hosts)) {
		errors.push('invalidHosts');
	}

	// サーバーが選択されていない場合はエラー
	if (preset.hosts.length === 0) {
		errors.push('hostsRequired');
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}
