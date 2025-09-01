<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer v-if="$i.policies.canUseMakePrivate">
	<template #header><MkPageHeader/></template>
	<div class="_spacer" style="--MI_SPACER-w: 1200px;">
		<MkInfo warn>
			<p>{{ i18n.ts._makePrivate.description }}</p>
			<p><mfm :text="i18n.ts._makePrivate.warn"/></p>
		</MkInfo>
		<form>
			<div class="_gaps_m">
				<FormSplit>
					<MkInput v-model="since" type="datetime-local">
						<template #label>{{ i18n.ts._makePrivate.sinceDate }}</template>
						<template #caption>{{ since }}</template>
					</MkInput>
					<MkInput v-model="until" type="datetime-local">
						<template #label>{{ i18n.ts._makePrivate.untilDate }}</template>
						<template #caption>{{ until }}</template>
					</MkInput>
				</FormSplit>
			</div>
			<div class="_gaps_m">
				<MkInput v-model="didInputText" type="text">
					<template #label>{{ i18n.ts.areYouSure }}</template>
					<template #caption><mfm :text="i18n.tsx._makePrivate.dangerTip({ text: shouldInputText })"/></template>
				</MkInput>
			</div>
			<div class="_gaps_m">
				<MkButton danger :disabled="didInputText != shouldInputText" @click.prevent.stop="makePrivateMany">
					<i class="ti ti-eye-off"></i>{{ i18n.ts._makePrivate.textmany }}
				</MkButton>
			</div>
		</form>
		<MkInfo>
			<I18n :src="i18n.ts._makePrivate.manyCount">
				<template #count>{{ noteNumber }}</template>
			</I18n>
		</MkInfo>
		<p>{{ i18n.ts.preview }}</p>
		<MkNotesTimeline :paginator="notepaginator"></MkNotesTimeline>
		<p><br>...<br></p>
		<MkNotesTimeline :paginator="notepaginationRev"></MkNotesTimeline>
	</div>
</MkStickyContainer>
<div v-else>
	<XNotFound/>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, markRaw } from 'vue';
import { debounce } from 'throttle-debounce';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api';
import { Paginator } from '@/utility/paginator.js';
import * as os from '@/os';
import MkInput from '@/components/MkInput.vue';
import FormSplit from '@/components/form/split.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkButton from '@/components/MkButton.vue';
import XNotFound from '@/pages/not-found.vue';

definePage(() => ({
	title: i18n.ts._makePrivate.text,
	icon: 'ti ti-eye-off',
}));

const since = ref(new Date().toISOString().replace('T', ' ').slice(0, 16));
const until = ref(new Date().toISOString().replace('T', ' ').slice(0, 16));
const sinceNumber = computed(() => Number(new Date(since.value)));
const untilNumber = computed(() => Number(new Date(until.value)));

const noteNumber = ref(0);

const shouldInputText = computed(() => `これらの ${noteNumber.value} 件のノートを、${since.value} から ${until.value} まで非公開にします`);
const didInputText = ref('');

const notePaginationParams = computed(() => ({
	userId: $i!.id,
	sinceDate: sinceNumber.value,
	untilDate: untilNumber.value,
}));

const notepaginator = markRaw(new Paginator('users/notes', {
	noPaging: true,
	computedParams: notePaginationParams,
	limit: 5,
}));

const notepaginationRevParams = computed(() => ({
	userId: $i!.id,
	sinceDate: sinceNumber.value,
}));

const notepaginationRev = markRaw(new Paginator('users/notes', {
	noPaging: true,
	computedParams: notepaginationRevParams,
	limit: 5,
	order: 'oldest',
}));

watch([since, until], () => {
	debouncedUpdateNoteNumber();
});

async function updateNoteNumber() {
	noteNumber.value = await countPrivateMany(sinceNumber.value, untilNumber.value);
	// computedParams を使っているので不要
}

const debouncedUpdateNoteNumber = debounce(1000, updateNoteNumber);

async function makePrivateMany() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts._makePrivate.textmany,
		text: i18n.tsx._makePrivate.manyWarn({ count: noteNumber.value }),
	});
	if (canceled) return;
	await misskeyApi('notes/make-private-many', {
		untilDate: untilNumber.value,
		sinceDate: sinceNumber.value,
	}).then(() => {
		os.alert({
			type: 'info',
			title: i18n.ts.ok,
			text: i18n.ts._makePrivate.didStart,
		});
	}).catch(() => {
		os.alert({
			type: 'error',
			title: 'Error',
			text: 'まだクールダウン中です！',
		});
	});
}

async function countPrivateMany(sinceDate: number, untilDate: number) {
	return await misskeyApi('notes/make-private-many-count', {
		untilDate,
		sinceDate,
	});
}
</script>

<style lang="scss" module>

</style>
