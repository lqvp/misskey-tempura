/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function resolveProcessMode(clusterLimit: number | undefined, disableClustering: boolean) {
	const singleProcess = disableClustering || clusterLimit === 0;
	const invalidClusterLimit = clusterLimit !== undefined && (!Number.isInteger(clusterLimit) || clusterLimit < 0);
	return {
		singleProcess,
		workerCount: singleProcess ? 0 : invalidClusterLimit ? 1 : clusterLimit ?? 1,
		invalidClusterLimit,
	};
}
