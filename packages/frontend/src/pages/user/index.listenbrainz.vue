<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer v-if="hasData" :foldable="true">
	<template #header>
		<i
			class="ti ti-headphones"
			style="margin-right: 0.5em"
		></i>{{ i18n.ts._widgets._listenBrainz.profileTitle }}
	</template>

	<div style="padding: 8px">
		<div class="flex">
			<a :href="listenbrainz.musicbrainzurl">
				<img class="image" :src="listenbrainz.img" :alt="listenbrainz.title"/>
				<div class="flex flex-col items-start">
					<p class="text-sm font-bold">{{ i18n.ts._widgets._listenBrainz.nowPlaying }}: {{ listenbrainz.title }}</p>
					<p class="text-xs font-medium">{{ listenbrainz.artist }}</p>
				</div>
			</a>
			<a :href="listenbrainz.listenbrainzurl" :aria-label="listenbrainz.title">
				<div class="playicon">
					<i class="ti ti-player-play-filled"></i>
				</div>
			</a>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue';
import { i18n } from '@/i18n.js';
import * as misskey from 'misskey-js';
import { safeHttpUrl } from '@@/js/url.js';
import MkContainer from '@/components/MkContainer.vue';

const props = withDefaults(
	defineProps<{
		user: misskey.entities.User & { listenbrainz?: string | null };
	}>(),
	{},
);

const listenbrainz = reactive({
	title: '',
	artist: '',
	lastlisten: '',
	img: '',
	musicbrainzurl: '#',
	listenbrainzurl: '#',
});

const listenbrainzUsername = props.user.listenbrainz ?? null;
const hasData = ref(false);

if (listenbrainzUsername) {
	(async () => {
		const getLMData = async (title: string, artist: string) => {
			const lookupUrl = new URL('https://api.listenbrainz.org/1/metadata/lookup/');
			lookupUrl.searchParams.set('artist_name', artist);
			lookupUrl.searchParams.set('recording_name', title);
			const response = await window.fetch(
				lookupUrl.toString(),
				{
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					},
				},
			);
			const data = await response.json();
			if (!data.recording_name) {
				return null;
			}
			const titler: string = data.recording_name;
			const artistr: string = data.artist_credit_name;
			const img: string = data.release_mbid
				? `https://coverartarchive.org/release/${data.release_mbid}/front-250`
				: 'https://coverartarchive.org/img/big_logo.svg';
			const fallbackUrl = safeHttpUrl(data.additional_info?.origin_url) ?? '#';
			const musicbrainzurl: string = data.recording_mbid
				? `https://musicbrainz.org/recording/${data.recording_mbid}`
				: fallbackUrl;
			const listenbrainzurl: string = data.recording_mbid
				? `https://listenbrainz.org/player?recording_mbids=${data.recording_mbid}`
				: fallbackUrl;
			return [titler, artistr, img, musicbrainzurl, listenbrainzurl];
		};

		const response = await window.fetch(
			`https://api.listenbrainz.org/1/user/${encodeURIComponent(listenbrainzUsername)}/playing-now`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			},
		);
		const playingNow = await response.json();
		if (playingNow.payload?.listens && playingNow.payload.listens.length !== 0) {
			const playing = playingNow.payload.listens[0];
			const title: string = playing.track_metadata.track_name;
			const artist: string = playing.track_metadata.artist_name;
			const lastlisten: string = playing.playing_now;
			const img = 'https://coverartarchive.org/img/big_logo.svg';
			await getLMData(title, artist).then((lmData) => {
				if (!lmData) {
					const additionalOrigin = safeHttpUrl(playing.track_metadata.additional_info?.origin_url) ?? '#';
					listenbrainz.title = title;
					listenbrainz.img = img;
					listenbrainz.artist = artist;
					listenbrainz.lastlisten = lastlisten;
					listenbrainz.musicbrainzurl = additionalOrigin;
					listenbrainz.listenbrainzurl = additionalOrigin;
					hasData.value = true;
				} else {
					listenbrainz.title = lmData[0];
					listenbrainz.img = lmData[2];
					listenbrainz.artist = lmData[1];
					listenbrainz.lastlisten = lastlisten;
					listenbrainz.musicbrainzurl = lmData[3];
					listenbrainz.listenbrainzurl = lmData[4];
					hasData.value = true;
				}
			});
		}
	})().catch((err) => {
		console.error('Failed to fetch ListenBrainz playing-now:', err);
	});
}
</script>

<style lang="scss" scoped>
.flex {
	display: flex;
	align-items: center;
}
.flex a {
  display: flex;
  align-items: center;
  text-decoration: none;
}
.image {
	height: 4.8rem;
	margin-right: 0.7rem;
}
.items-start {
	align-items: flex-start;
}
.flex-col {
	display: flex;
	flex-direction: column;
}
.text-sm {
	font-size: 0.875rem;
	margin: 0;
	margin-bottom: 0.3rem;
}
.font-bold {
	font-weight: 700;
}
.text-xs {
	font-size: 0.75rem;
	margin: 0;
}
.font-medium {
	font-weight: 500;
}
.playicon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 3rem;
	height: 3rem;
	font-size: 1.7rem;
	padding-left: 3rem;
}
</style>
