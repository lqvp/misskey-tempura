<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->
<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs" :actions="headerActions">
	<div class="_spacer" style="--MI_SPACER-w: 1000px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkInfo v-if="!iAmAdmin" warn>{{ i18n.ts.permissionDeniedError }}</MkInfo>
		<div v-else class="_gaps_m">
			<div :class="$style.filters">
				<MkInput v-model="month" type="month"><template #label>{{ i18n.ts._llmUsage.month }}</template><template #prefix><i class="ti ti-calendar-month"></i></template></MkInput>
				<MkButton :disabled="loading" @click="load"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
			</div>
			<div :class="$style.caption">{{ i18n.ts._llmUsage.brief }}</div>
			<MkLoading v-if="loading"/>
			<MkInfo v-else-if="error" warn>{{ error }}<MkButton @click="load">{{ i18n.ts.retry }}</MkButton></MkInfo>
			<template v-else-if="data">
				<MkInfo v-if="data.summary.requests === '0'">{{ emptyMessage }}</MkInfo>
				<div v-if="tab === 'overview'" class="_gaps_m">
					<div :class="$style.summary" data-testid="usage-summary">
						<div v-for="item in summaryItems" :key="item.label" class="_panel" :class="$style.stat">
							<i :class="[item.icon, $style.statIcon]"></i>
							<MkKeyValue><template #key>{{ item.label }}</template><template #value><span :class="$style.statValue">{{ formatUsageNumber(item.value) }}</span></template></MkKeyValue>
						</div>
					</div>
					<MkFoldableSection><template #header>{{ i18n.ts._llmUsage.chart }}</template><div class="_panel" :class="$style.chartPanel"><XChart :data="data"/></div></MkFoldableSection>
					<MkFolder><template #icon><i class="ti ti-table"></i></template><template #label>{{ i18n.ts._llmUsage.tokenDetails }}</template><div class="_gaps"><div :class="$style.caption">{{ i18n.ts._llmUsage.unknown }}</div><XCounters :data="data.summary"/></div></MkFolder>
				</div>
				<div v-else-if="tab === 'daily'" class="_gaps_s">
					<MkFolder v-for="day in data.daily" :key="day.date"><template #label>{{ day.date }}</template><template #suffix>{{ formatUsageNumber(day.requests) }}</template><XCounters :data="day"/></MkFolder>
				</div>
				<div v-else-if="tab === 'purpose'" class="_gaps_m">
					<div class="_panel" :class="$style.chartPanel"><XChart :data="data" purpose/></div>
					<MkFolder v-for="row in data.byPurpose" :key="row.purpose"><template #label>{{ purposeLabel(row.purpose) }}</template><template #suffix>{{ formatUsageNumber(row.requests) }}</template><XCounters :data="row"/></MkFolder>
				</div>
				<div v-else-if="tab === 'model'" class="_gaps_s">
					<MkFolder v-for="row in data.byModel" :key="row.model"><template #label><span :class="$style.model">{{ row.model }}</span></template><template #suffix>{{ formatUsageNumber(row.requests) }}</template><XCounters :data="row"/></MkFolder>
				</div>
				<div v-else-if="tab === 'users'" class="_gaps_m">
					<MkSelect v-model="sort" :items="sortItems"><template #label>{{ i18n.ts.sort }}</template></MkSelect>
					<div :class="$style.caption">{{ i18n.ts._llmUsage.snapshotNotice }}</div>
					<MkLoading v-if="usersLoading"/>
					<MkInfo v-if="usersError" warn>{{ usersError }}<MkButton @click="loadUsers">{{ i18n.ts.retry }}</MkButton></MkInfo>
					<div class="_gaps_s">
						<MkFolder v-for="row in users?.items" :key="row.userId"><template #icon><i class="ti ti-user"></i></template><template #label>{{ row.user ? `@${row.user.username}${row.user.host ? '@' + row.user.host : ''}` : i18n.ts._llmUsage.missingUser }}</template><template #caption>{{ row.userId }}</template><template #suffix>{{ formatUsageNumber(row.counters.requests) }}</template><div class="_selectable" :class="$style.model">{{ row.userId }}</div><XCounters :data="row.counters"/></MkFolder>
					</div>
					<div class="_buttons"><MkButton v-if="offset > 0" :disabled="usersLoading" @click="page(-1)"><i class="ti ti-chevron-left"></i> {{ i18n.ts.goBack }}</MkButton><MkButton v-if="users?.hasMore" :disabled="usersLoading" @click="page(1)">{{ i18n.ts.next }} <i class="ti ti-chevron-right"></i></MkButton></div>
				</div>
				<div :class="$style.caption">{{ i18n.ts._llmUsage.chartNotice }}</div>
				<MkFolder><template #icon><i class="ti ti-info-circle"></i></template><template #label>{{ i18n.ts._llmUsage.about }}</template><div class="_gaps_s" :class="$style.caption"><div>{{ i18n.ts._llmUsage.description }}</div><div>{{ i18n.tsx._llmUsage.startedAt({ date: data.startedAt }) }}</div><div>{{ i18n.ts._llmUsage.retention }}: {{ data.retentionMonths === 0 ? i18n.ts._llmUsage.unlimited : data.retentionMonths }}</div></div></MkFolder>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>
<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import XCounters from './llm-usage.counters.vue';
import XChart from './llm-usage.chart.vue';
import type { Endpoints } from 'misskey-js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSelect from '@/components/MkSelect.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { retentionBoundary } from '@/utility/tempura-script/llm-usage.js';
import { formatUsageNumber } from '@/utility/tempura-script/llm-usage.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { iAmAdmin } from '@/i.js';
const tab = ref('overview');
const headerTabs = computed(() => [{ key: 'overview', title: i18n.ts.overview, icon: 'ti ti-chart-line' }, { key: 'daily', title: i18n.ts._llmUsage.daily, icon: 'ti ti-calendar' }, { key: 'purpose', title: i18n.ts._llmUsage.byPurpose, icon: 'ti ti-category' }, { key: 'model', title: i18n.ts._llmUsage.byModel, icon: 'ti ti-cpu' }, { key: 'users', title: i18n.ts._llmUsage.users, icon: 'ti ti-users' }]);
const headerActions = computed(() => [{ icon: 'ti ti-refresh', text: i18n.ts.reload, handler: load }]);

function purposeLabel(purpose: string): string {
	return ({ 'note-summary': i18n.ts._llmUsage.noteSummary, 'profile-summary': i18n.ts._llmUsage.profileSummary, 'text-transform': i18n.ts._llmUsage.textTransform, other: i18n.ts.other } as Record<string, string>)[purpose] ?? purpose;
}

const month = ref(new Date().toISOString().slice(0, 7));
const data = ref<Endpoints['admin/llm-usage/overview']['res'] | null>(null);
const users = ref<Endpoints['admin/llm-usage/users']['res'] | null>(null);
const loading = ref(false);
const usersLoading = ref(false);
const usersError = ref<string | null>(null);
const error = ref<string | null>(null);
const sort = ref<'requests' | 'totalTokens'>('totalTokens');
const offset = ref(0);
const sortItems = computed(() => [{ value: 'requests', label: i18n.ts._llmUsage.requests }, { value: 'totalTokens', label: i18n.ts._llmUsage.total }]);
const summaryItems = computed(() => data.value ? [
	{ label: i18n.ts._llmUsage.requests, value: data.value.summary.requests, icon: 'ti ti-api' },
	{ label: i18n.ts._llmUsage.total, value: data.value.summary.tokens.total.value, icon: 'ti ti-chart-bar' },
	{ label: i18n.ts._llmUsage.successes, value: data.value.summary.successes, icon: 'ti ti-check' },
	{ label: i18n.ts._llmUsage.failures, value: data.value.summary.failures, icon: 'ti ti-alert-circle' },
	{ label: i18n.ts._llmUsage.uniqueUsers, value: data.value.uniqueUsers, icon: 'ti ti-users' },
] : []);
const emptyMessage = computed(() => {
	if (!data.value) return '';
	const selected = month.value + '-01';
	const [y, m] = month.value.split('-').map(Number);
	const end = new Date(Date.UTC(y, m, 1)).toISOString();
	if (end <= data.value.startedAt) return i18n.ts._llmUsage.beforeStarted;
	if (data.value.retentionMonths !== 0 && selected < retentionBoundary(new Date(), data.value.retentionMonths)) return i18n.ts._llmUsage.outsideRetention;
	return i18n.ts._llmUsage.noData;
});
let request = 0;
let userRequest = 0;
let disposed = false;

function period() {
	const [year, m] = month.value.split('-').map(Number);
	if (!Number.isInteger(year) || year < 1 || year > 9998 || !Number.isInteger(m) || m < 1 || m > 12) throw new Error(i18n.ts.invalidValue);
	return { year, month: m };
}

function errorMessage(value: unknown): string {
	if (value instanceof Error) return value.message;
	if (typeof value === 'object' && value != null && 'message' in value && typeof value.message === 'string') return value.message;
	return String(value);
}

async function loadUsers() {
	if (!iAmAdmin || !data.value) return;
	const id = ++userRequest;
	usersLoading.value = true; usersError.value = null; users.value = null;
	try {
		const result = await misskeyApi('admin/llm-usage/users', { ...period(), sort: sort.value, offset: offset.value, limit: 30 });
		if (!disposed && id === userRequest) users.value = result;
	} catch (e) {
		if (!disposed && id === userRequest) usersError.value = errorMessage(e);
	} finally { if (!disposed && id === userRequest) usersLoading.value = false; }
}

async function load() {
	if (!iAmAdmin) return;
	const id = ++request;
	++userRequest;
	loading.value = true; error.value = null; data.value = null; users.value = null; usersError.value = null; usersLoading.value = false; offset.value = 0;
	try {
		const result = await misskeyApi('admin/llm-usage/overview', period());
		if (disposed || id !== request) return;
		data.value = result;
		if (tab.value === 'users') void loadUsers();
	} catch (e) { if (!disposed && id === request) error.value = errorMessage(e); } finally { if (!disposed && id === request) loading.value = false; }
}

async function page(direction: number) {
	offset.value += direction * 30;
	await loadUsers();
}

watch(month, load);
watch(tab, () => { if (tab.value === 'users' && !users.value && !usersLoading.value && !usersError.value) void loadUsers(); });
watch(sort, async () => { offset.value = 0; if (tab.value === 'users') await loadUsers(); });
onUnmounted(() => { disposed = true; ++request; ++userRequest; });
void load();
definePage(() => ({ title: i18n.ts._llmUsage.title, icon: 'ti ti-chart-line' }));
</script>

<style lang="scss" module>
.filters { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; > :first-child { flex: 1; min-width: 180px; } }
.caption { font-size: 0.85em; line-height: 1.6; color: var(--MI_THEME-fg); opacity: 0.75; overflow-wrap: anywhere; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 12px; }
.stat { padding: 16px; display: flex; align-items: center; gap: 12px; min-width: 0; }
@media (max-width: 500px) {
	.summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.stat { padding: 14px; gap: 8px; align-items: flex-start; flex-direction: column; }
	.statIcon { padding: 8px; }
	.stat:last-child { grid-column: 1 / -1; flex-direction: row; align-items: center; }
}
.statIcon { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); border-radius: var(--MI-radius); padding: 12px; }
.statValue { font-size: 1.3em; font-weight: bold; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.chartPanel { padding: 16px; }
.model { overflow-wrap: anywhere; }
</style>
