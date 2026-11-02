<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps_m">
			<MkInput v-model="searchQuery" :class="$style.search" type="search">
				<template #prefix><i class="ti ti-search"></i></template>
				<template #label>{{ i18n.ts._tempuraFutureAntenna.searchThisAntenna }}</template>
			</MkInput>
			<div v-if="searching" :class="$style.tl">
				<MkLoading v-if="searchFetching"/>
				<MkResult v-else-if="searchResults.length === 0" type="empty" :text="i18n.ts.notFound"/>
				<template v-else>
					<MkNote v-for="note in searchResults" :key="note.id" :class="$style.note" :note="note"/>
				</template>
			</div>
			<div v-else :class="$style.tl">
				<MkStreamingNotesTimeline
					ref="tlEl" :key="antennaId"
					src="antenna"
					:antenna="antennaId"
					:sound="true"
				/>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, ref, useTemplateRef, provide } from 'vue';
import * as Misskey from 'misskey-js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import MkInput from '@/components/MkInput.vue';
import MkNote from '@/components/MkNote.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';

const router = useRouter();

const props = defineProps<{
	antennaId: string;
}>();

const antenna = ref<Misskey.entities.Antenna | null>(null);
const tlEl = useTemplateRef('tlEl');

// アンテナのTL内検索(サーバー側で直近最大200件が対象)
const searchQuery = ref<string>('');
const searching = computed(() => searchQuery.value.trim() !== '');
const searchResults = ref<Misskey.entities.Note[]>([]);
const searchFetching = ref<boolean>(false);
let searchTimer: number | null = null;

watch([searchQuery, () => props.antennaId], () => {
	if (searchTimer != null) window.clearTimeout(searchTimer);
	if (!searching.value) {
		searchResults.value = [];
		searchFetching.value = false;
		return;
	}
	searchFetching.value = true;
	searchTimer = window.setTimeout(async () => {
		try {
			searchResults.value = await misskeyApi('antennas/notes', {
				antennaId: props.antennaId,
				query: searchQuery.value.trim(),
				limit: 30,
			});
		} catch {
			searchResults.value = [];
		} finally {
			searchFetching.value = false;
		}
	}, 500);
});

provide('currentAntenna', antenna);

function settings() {
	router.push('/my/antennas/:antennaId', {
		params: {
			antennaId: props.antennaId,
		},
	});
}

watch(() => props.antennaId, async () => {
	antenna.value = await misskeyApi('antennas/show', {
		antennaId: props.antennaId,
	});
}, { immediate: true });

const headerActions = computed(() => antenna.value ? [{
	icon: 'ti ti-settings',
	text: i18n.ts.settings,
	handler: settings,
}] : []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: antenna.value ? antenna.value.name : i18n.ts.antennas,
	icon: 'ti ti-antenna',
}));
</script>

<style lang="scss" module>
.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}

.note {
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}
</style>
