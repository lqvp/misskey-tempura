<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-listenBrainz">
	<template #icon><i class="ti ti-music"></i></template>
	<template #header>ListenBrainz</template>
	<template #func="{ buttonStyleClass }">
		<button class="_button" :class="buttonStyleClass" @click="fetchPlayingNow()"><i class="ti ti-refresh"></i></button>
		<button class="_button" :class="buttonStyleClass" @click="configure()"><i class="ti ti-settings"></i></button>
	</template>

	<div :class="$style.root">
		<MkLoading v-if="fetching"/>
		<div v-else-if="!playingNow" style="text-align: center;">
			<img :src="infoImageUrl" class="_ghost"/>
			<div>{{ i18n.ts.nothing }}</div>
		</div>
		<div v-else class="_gaps_s" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
			<div>{{ formattedNote }}</div>
			<MkButton primary @click="postNote">{{ i18n.ts.note }}</MkButton>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { useWidgetPropsManager, WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import { GetFormResultType } from '@/scripts/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { infoImageUrl } from '@/instance.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';

const name = 'listenBrainz';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean' as const,
		default: true,
	},
	userId: {
		type: 'string' as const,
		default: null,
	},
	noteFormat: {
		type: 'string' as const,
		default: '{artist_name} - {track_name} ({media_player}/{music_service_name}/{client}) {url} #nowplaying',
	},
	visibility: {
		type: 'enum' as const,
		default: 'home' as const, // 初期値を 'home' に設定
		enum: [
			{ label: 'Public', value: 'public' },
			{ label: 'Home', value: 'home' },
			{ label: 'Followers', value: 'followers' },
		],
	},
};

	type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const playingNow = ref(false);
const trackMetadata = ref<any>(null);
const fetching = ref(true);

const formattedNote = computed(() => {
	if (!trackMetadata.value) return '';
	return widgetProps.noteFormat
		.replace('{artist_name}', trackMetadata.value.artist_name)
		.replace('{track_name}', trackMetadata.value.track_name)
		.replace('{media_player}', trackMetadata.value.additional_info.media_player)
		.replace('{music_service_name}', trackMetadata.value.additional_info.music_service_name)
		.replace('{url}', trackMetadata.value.additional_info.origin_url)
		.replace('{client}', trackMetadata.value.additional_info.submission_client);
});

const fetchPlayingNow = async () => {
	fetching.value = true; // フェッチ開始時に fetching を true に設定
	if (!widgetProps.userId) return;

	const url = `https://api.listenbrainz.org/1/user/${widgetProps.userId}/playing-now`;
	const response = await fetch(url);
	const data = await response.json();

	if (data.payload.count > 0) {
		playingNow.value = true;
		trackMetadata.value = data.payload.listens[0].track_metadata;
	} else {
		playingNow.value = false;
		trackMetadata.value = null;
	}

	fetching.value = false; // フェッチ終了時に fetching を false に設定
};

const postNote = async () => {
	if (!trackMetadata.value) return;

	const note = formattedNote.value;
	misskeyApi('notes/create', {
		text: note,
		visibility: widgetProps.visibility,
	});
};

watch(() => widgetProps.userId, fetchPlayingNow, { immediate: true });

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding: 16px;
}
</style>
