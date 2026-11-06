/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export const usageMetrics = ['input', 'output', 'thinking', 'cached', 'total'] as const;
export const usagePurposes = ['note-summary', 'profile-summary', 'text-transform', 'other'] as const;
export type Metric = typeof usageMetrics[number];
export type LlmUsagePurpose = typeof usagePurposes[number];
export type UsageValues = Record<Metric, number | null>;
export type RecordUsage = { userId: string; purpose: LlmUsagePurpose; model: string; completedAt: Date; success: boolean; usage: UsageValues };
export type UsageCounters = { requests: string; successes: string; failures: string; tokens: Record<Metric, { value: string | null; samples: string }> };
