<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-listenBrainz">
	<template #icon><i class="ti ti-music"></i></template>
	<template #header>{{ i18n.ts._widgets.listenBrainz }}</template>
	<template #func="{ buttonStyleClass }">
		<button class="_button" :class="buttonStyleClass" @click="fetchPlayingNow()"><i class="ti ti-refresh"></i></button>
		<button class="_button" :class="buttonStyleClass" @click="configure()"><i class="ti ti-settings"></i></button>
	</template>

	<div :class="$style.root">
		<div v-if="!widgetProps.userId" class="_gaps" style="text-align: center;">
			<div>{{ i18n.ts._widgets._listenBrainz.userIdDescription }}</div>
		</div>
		<template v-else>
			<MkLoading v-if="fetching"/>
			<div v-else-if="!playingNow" style="text-align: center;">
				<MkResult type="empty" :text="i18n.ts.nothing"/>
			</div>
			<div v-else class="_gaps_s" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
				<MkMfm :text="formattedNote"/>
				<MkButton primary @click="postNote">{{ i18n.ts.note }}</MkButton>
			</div>
		</template>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import MkMfm from '@/components/global/MkMfm.js';

const name = i18n.ts._widgets.listenBrainz;

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
		multiline: true,
		default: 'Now Playing: {artist_name} - {track_name} #nowplaying',
		description: '利用可能なプレースホルダー: {artist_name}, {track_name}, {release_name}, {media_player}, {music_service_name}, {music_service}, {client}, {client_version}, {url}, {duration}, {duration_formatted}, {duration_ms}, {recording_mbid}, {release_mbid}, {tracknumber}, {isrc}, {spotify_id}, {tags}',
	},
	visibility: {
		type: 'enum' as const,
		default: 'home' as const,
		enum: [
			{ label: 'Public', value: 'public' },
			...( $i?.policies.canPublicNonLtlNote ? [{
				label: 'Semi-Public', value: 'public_non_ltl',
			}] : []),
			{ label: 'Home', value: 'home' },
			{ label: 'Followers', value: 'followers' },
		],
	},
	refreshIntervalSec: {
		type: 'number' as const,
		default: 60,
	},
};

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const playingNow = ref(false);
const trackMetadata = ref<any>(null);
const fetching = ref(true);
let intervalId: number | null = null;

const formattedNote = computed(() => {
	if (!trackMetadata.value) return '';

	const durationSec = trackMetadata.value.additional_info?.duration;
	const formattedDuration = durationSec ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : '';
	const tags = (trackMetadata.value.additional_info?.tags ?? []).join(', ');

	const replacements: Record<string, string> = {
		'{artist_name}': trackMetadata.value.artist_name ?? '',
		'{track_name}': trackMetadata.value.track_name ?? '',
		'{release_name}': trackMetadata.value.release_name ?? '',
		'{media_player}': trackMetadata.value.additional_info?.media_player ?? '',
		'{music_service_name}': trackMetadata.value.additional_info?.music_service_name ?? '',
		'{music_service}': trackMetadata.value.additional_info?.music_service ?? '',
		'{url}': trackMetadata.value.additional_info?.origin_url ?? '',
		'{client}': trackMetadata.value.additional_info?.submission_client ?? '',
		'{client_version}': trackMetadata.value.additional_info?.submission_client_version ?? '',
		'{duration}': durationSec?.toString() ?? '',
		'{duration_formatted}': formattedDuration,
		'{duration_ms}': trackMetadata.value.additional_info?.duration_ms?.toString() ?? '',
		'{recording_mbid}': trackMetadata.value.additional_info?.recording_mbid ?? '',
		'{release_mbid}': trackMetadata.value.additional_info?.release_mbid ?? '',
		'{tracknumber}': trackMetadata.value.additional_info?.tracknumber ?? '',
		'{isrc}': trackMetadata.value.additional_info?.isrc ?? '',
		'{spotify_id}': trackMetadata.value.additional_info?.spotify_id ?? '',
		'{tags}': tags,
	};

	return widgetProps.noteFormat.replace(
		/\{[^}]+\}/g,
		(match) => replacements[match] ?? match,
	);
});

const fetchPlayingNow = async () => {
	if (!widgetProps.userId) {
		fetching.value = false;
		playingNow.value = false;
		trackMetadata.value = null;
		return;
	}
	fetching.value = true;

	const url = `https://api.listenbrainz.org/1/user/${widgetProps.userId}/playing-now`;
	const response = await window.fetch(url);
	const data = await response.json();

	if (data.payload.count > 0) {
		playingNow.value = true;
		trackMetadata.value = data.payload.listens[0].track_metadata;
	} else {
		playingNow.value = false;
		trackMetadata.value = null;
	}

	fetching.value = false;
};

const postNote = async () => {
	if (!trackMetadata.value) return;

	const note = formattedNote.value;
	misskeyApi('notes/create', {
		text: note,
		visibility: widgetProps.visibility as any,
	});
};

watch(() => widgetProps.userId, fetchPlayingNow, { immediate: true });

watch(() => widgetProps.refreshIntervalSec, (newInterval) => {
	if (intervalId) window.clearInterval(intervalId);
	if (newInterval > 0) {
		intervalId = window.setInterval(fetchPlayingNow, newInterval * 1000);
	}
}, { immediate: true });

onMounted(() => {
	if (widgetProps.refreshIntervalSec > 0) {
		intervalId = window.setInterval(fetchPlayingNow, widgetProps.refreshIntervalSec * 1000);
	}
});

onUnmounted(() => {
	if (intervalId) window.clearInterval(intervalId);
});

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

.ghostImage {
    max-width: 100%;
    max-height: 100px;
}
</style>
