<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="fetching" :class="$style.loading">
	<MkEllipsis/>
</div>
<div v-else-if="error" :class="$style.error">
	<p>{{ i18n.ts.failedToLoadTweet }}</p>
	<p :class="$style.errorMessage">{{ String(error) }}</p>
</div>
<div v-else-if="tweetData" :class="$style.tweetContainer">
	<a :href="`https://twitter.com/${tweetData.author.screen_name}`" target="_blank" rel="noopener noreferrer" :class="$style.headerLink">
		<header :class="$style.header">
			<img :src="tweetData.author.avatar_url" :alt="`${tweetData.author.name}'s avatar`" :class="$style.avatar"/>
			<div :class="$style.authorInfo">
				<span :class="$style.authorName">{{ tweetData.author.name }}</span>
				<span :class="$style.authorScreenName">@{{ tweetData.author.screen_name }}</span>
			</div>
			<a :href="tweetData.url" target="_blank" rel="noopener noreferrer" :class="$style.headerTimestampLink">
				<MkTime v-if="tweetData.created_timestamp" :time="new Date(tweetData.created_timestamp * 1000)" mode="detail" :class="$style.headerTimestamp"/>
			</a>
		</header>
	</a>
	<Mfm v-if="tweetData.text && mfmTweetText" :text="mfmTweetText" :class="$style.body"/>

	<MkMediaList v-if="driveFiles.length > 0" :mediaList="driveFiles" :class="$style.mediaContainer"/>

	<!-- Quoted Tweet Section -->
	<div v-if="tweetData.quote" :class="$style.quoteContainer">
		<a :href="`https://twitter.com/${tweetData.quote.author.screen_name}`" target="_blank" rel="noopener noreferrer" :class="$style.headerLink">
			<header :class="$style.quoteHeader">
				<img :src="tweetData.quote.author.avatar_url" :alt="`${tweetData.quote.author.name}'s avatar`" :class="$style.quoteAvatar"/>
				<div :class="$style.quoteAuthorInfo">
					<span :class="$style.quoteAuthorName">{{ tweetData.quote.author.name }}</span>
					<span :class="$style.quoteAuthorScreenName">@{{ tweetData.quote.author.screen_name }}</span>
				</div>
				<a :href="tweetData.quote.url" target="_blank" rel="noopener noreferrer" :class="$style.headerTimestampLink">
					<MkTime v-if="tweetData.quote?.created_timestamp" :time="new Date(tweetData.quote.created_timestamp * 1000)" mode="detail" :class="$style.headerTimestamp"/>
				</a>
			</header>
		</a>
		<Mfm v-if="tweetData.quote?.text && mfmQuoteText" :text="mfmQuoteText" :class="$style.quoteBody"/>
		<MkMediaList v-if="quoteDriveFiles.length > 0" :mediaList="quoteDriveFiles" :class="$style.mediaContainer"/>
		<div v-if="tweetData.quote.community_note" :class="$style.communityNote">
			<div :class="$style.communityNoteHeader">
				<i class="ti ti-users-group"></i>
				<span>{{ i18n.ts.communityNote }}</span>
			</div>
			<Mfm v-if="mfmQuoteCommunityNoteText" :text="mfmQuoteCommunityNoteText" :class="$style.communityNoteText"/>
		</div>
		<footer :class="$style.quoteFooter">
			<a :href="tweetData.quote.url" target="_blank" rel="noopener noreferrer" :class="$style.statsLink">
				<div :class="[$style.stats]">
					<span v-if="tweetData.quote.replies != null" :class="$style.statItem">
						<i class="ti ti-message-circle" :class="$style.iconReply"></i> {{ tweetData.quote.replies.toLocaleString() }}
					</span>
					<span v-if="tweetData.quote.retweets != null" :class="$style.statItem">
						<i class="ti ti-repeat" :class="$style.iconRetweet"></i> {{ tweetData.quote.retweets.toLocaleString() }}
					</span>
					<span v-if="tweetData.quote.likes != null" :class="$style.statItem">
						<i class="ti ti-heart" :class="$style.iconLike"></i> {{ tweetData.quote.likes.toLocaleString() }}
					</span>
					<span v-if="tweetData.quote.views != null" :class="$style.statItem">
						<i class="ti ti-eye" :class="$style.iconView"></i> {{ tweetData.quote.views.toLocaleString() }}
					</span>
					<span v-if="tweetData.quote.bookmarks != null" :class="$style.statItem">
						<i class="ti ti-bookmark" :class="$style.iconBookmark"></i> {{ tweetData.quote.bookmarks.toLocaleString() }}
					</span>
				</div>
			</a>
			<Mfm v-if="tweetData.quote.source" :text="tweetData.quote.source" :class="$style.source"/>
		</footer>
	</div>
	<div v-if="tweetData.community_note" :class="$style.communityNote">
		<div :class="$style.communityNoteHeader">
			<i class="ti ti-users-group"></i>
			<span>{{ i18n.ts.communityNote }}</span>
		</div>
		<Mfm v-if="mfmCommunityNoteText" :text="mfmCommunityNoteText" :class="$style.communityNoteText"/>
	</div>
	<footer :class="$style.footer">
		<a :href="tweetData.url" target="_blank" rel="noopener noreferrer" :class="$style.statsLink">
			<div :class="$style.stats">
				<span v-if="tweetData.replies != null" :class="$style.statItem">
					<i class="ti ti-message-circle" :class="$style.iconReply"></i> {{ tweetData.replies.toLocaleString() }}
				</span>
				<span v-if="tweetData.retweets != null" :class="$style.statItem">
					<i class="ti ti-repeat" :class="$style.iconRetweet"></i> {{ tweetData.retweets.toLocaleString() }}
				</span>
				<span v-if="tweetData.likes != null" :class="$style.statItem">
					<i class="ti ti-heart" :class="$style.iconLike"></i> {{ tweetData.likes.toLocaleString() }}
				</span>
				<span v-if="tweetData.views != null" :class="$style.statItem">
					<i class="ti ti-eye" :class="$style.iconView"></i> {{ tweetData.views.toLocaleString() }}
				</span>
				<span v-if="tweetData.bookmarks != null" :class="$style.statItem">
					<i class="ti ti-bookmark" :class="$style.iconBookmark"></i> {{ tweetData.bookmarks.toLocaleString() }}
				</span>
			</div>
		</a>
		<Mfm v-if="tweetData.source" :text="tweetData.source" :class="$style.source"/>
	</footer>
</div>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import MkMediaList from '@/components/MkMediaList.vue';

interface FxTweetAuthor {
	name: string;
	screen_name: string;
	avatar_url: string;
	banner_url?: string;
}

interface FxTweetMediaPhoto {
	type: 'photo';
	url: string;
	width: number;
	height: number;
	altText?: string;
}

interface FxTweetMediaVideo {
	type: 'video' | 'gif';
	url: string;
	thumbnail_url: string;
	width: number;
	height: number;
	format?: string;
	duration_millis?: number;
}

interface FxCommunityNoteEntityRef {
	type: string;
	url: string;
	urlType: string;
}

interface FxCommunityNoteEntity {
	fromIndex: number;
	toIndex: number;
	ref: FxCommunityNoteEntityRef;
}

interface FxCommunityNote {
	text: string;
	entities?: FxCommunityNoteEntity[];
}

type FxTweetMedia = FxTweetMediaPhoto | FxTweetMediaVideo;

interface FxTweet {
	text: string;
	author: FxTweetAuthor;
	created_timestamp: number;
	created_at: string;
	media?: {
		all?: FxTweetMedia[];
		photos?: FxTweetMediaPhoto[];
		videos?: FxTweetMediaVideo[];
	};
	lang: string;
	url: string;
	source: string;
	possibly_sensitive?: boolean;
	is_note_tweet: boolean;
	community_note: FxCommunityNote | null;
	id_str?: string;
	replies?: number;
	retweets?: number;
	likes?: number;
	bookmarks?: number;
	views?: number;
	quote?: FxTweet;
}

interface FxTwitterApiResponse {
	code: number;
	message: string;
	tweet?: FxTweet;
}

const props = defineProps<{
	tweetId: string;
	screenName: string;
}>();

const fetching = ref(true);
const tweetData = ref<FxTweet | null>(null);
const error = ref<string | null>(null);

const fetchTweetData = async () => {
	fetching.value = true;
	error.value = null;
	try {
		const response = await window.fetch(`https://api.${prefer.s.defaultFxTwitterEmbedProvider}/${props.screenName}/status/${props.tweetId}`);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data: FxTwitterApiResponse = await response.json();
		if (data.code !== 200 || !data.tweet) {
			throw new Error(data.message || 'Failed to fetch tweet data from API');
		}
		tweetData.value = data.tweet;
	} catch (err: unknown) {
		if (err instanceof Error) {
			error.value = err.message || 'Failed to load tweet';
		} else {
			error.value = String(err);
		}
		console.error('Failed to fetch FxTwitter data:', err);
	} finally {
		fetching.value = false;
	}
};

onMounted(() => {
	fetchTweetData();
});

const processTweetTextForTwitterContext = (text: string | undefined): string | undefined => {
	if (!text) return undefined;
	let processedText = text;

	const twitterMentionRegex = /(?<=^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{1,15})(?![a-zA-Z0-9_])/g;
	processedText = processedText.replace(twitterMentionRegex, '[$&](https://twitter.com/$1)');

	const twitterHashtagRegex = /#([a-zA-Z0-9_ぁ-んァ-ヶー一-龠々]+)/g;
	processedText = processedText.replace(twitterHashtagRegex, (match, hashtagContent) => {
		return `[${match}](https://twitter.com/hashtag/${encodeURIComponent(hashtagContent)})`;
	});

	return processedText;
};

const mfmTweetText = computed(() => processTweetTextForTwitterContext(tweetData.value?.text));
const mfmQuoteText = computed(() => processTweetTextForTwitterContext(tweetData.value?.quote?.text));

const processCommunityNoteText = (note: FxCommunityNote | null | undefined): string | undefined => {
	if (!note?.text) return undefined;

	let processedText = note.text;
	const entities = note.entities;

	if (entities?.length) {
		const sortedEntities = [...entities].sort((a, b) => b.fromIndex - a.fromIndex);

		for (const entity of sortedEntities) {
			const originalUrlText = processedText.substring(entity.fromIndex, entity.toIndex);
			const targetUrl = entity.ref.url;
			const markdownLink = `[${originalUrlText}](${targetUrl})`;
			processedText =
				processedText.substring(0, entity.fromIndex) +
				markdownLink +
				processedText.substring(entity.toIndex);
		}
	}

	return processedText;
};

const mfmCommunityNoteText = computed(() => processCommunityNoteText(tweetData.value?.community_note));
const mfmQuoteCommunityNoteText = computed(() => processCommunityNoteText(tweetData.value?.quote?.community_note));

const mediaItems = computed((): FxTweetMedia[] => {
	return tweetData.value?.media?.all || tweetData.value?.media?.photos || tweetData.value?.media?.videos || [];
});

const driveFiles = computed((): Misskey.entities.DriveFile[] => {
	return mediaItems.value.map(media => mapToDriveFile(media, tweetData.value));
});

const quoteMediaItems = computed((): FxTweetMedia[] => {
	return tweetData.value?.quote?.media?.all || tweetData.value?.quote?.media?.photos || tweetData.value?.quote?.media?.videos || [];
});

const quoteDriveFiles = computed((): Misskey.entities.DriveFile[] => {
	return quoteMediaItems.value.map(media => mapToDriveFile(media, tweetData.value?.quote || null));
});

function mapToDriveFile(media: FxTweetMedia, tweet: FxTweet | null): Misskey.entities.DriveFile {
	const isVideo = media.type === 'video' || media.type === 'gif';
	const name = media.url.substring(media.url.lastIndexOf('/') + 1) || `media_${media.type}`;

	return {
		id: tweet?.id_str || props.tweetId + '_' + name,
		createdAt: tweet?.created_at || new Date( (tweet?.created_timestamp || 0) * 1000).toISOString(),
		name: name,
		type: isVideo ? ( (media as FxTweetMediaVideo).format || 'video/mp4') : 'image/jpeg',
		md5: '',
		size: 0,
		isSensitive: tweet?.possibly_sensitive || false,
		blurhash: null,
		properties: {
			width: media.width,
			height: media.height,
		},
		url: media.url,
		thumbnailUrl: isVideo ? (media as FxTweetMediaVideo).thumbnail_url : media.url,
		comment: null,
		folderId: null,
		userId: null,
		user: null,
	};
}
</script>

<style lang="scss" module>
.tweetContainer {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	padding: 16px;
	font-family: sans-serif;
	background-color: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	max-width: 550px;
	margin: 0 auto;
}

.error, .loading {
	padding: 16px;
	text-align: center;
	color: var(--MI_THEME-fg);
}

.headerLink {
	text-decoration: none;
	color: inherit;
	display: block;
}

.header {
	display: flex;
	align-items: center;
	margin-bottom: 12px;
}

.avatar {
	width: 48px;
	height: 48px;
	border-radius: 50%;
	margin-right: 12px;
}

.authorInfo {
	display: flex;
	flex-direction: column;
}

.authorName {
	font-weight: bold;
	color: var(--MI_THEME-fg);
}

.authorScreenName {
	color: var(--MI_THEME-fgTransparent);
	font-size: 0.9em;
}

.headerTimestampLink {
	margin-left: auto;
	color: var(--MI_THEME-fgTransparent);
	text-decoration: none;
	display: flex;
	align-items: center;
	&:hover {
		text-decoration: underline;
	}
}

.headerTimestamp {
	font-size: 0.9em;
	white-space: nowrap; // 時刻が折り返さないようにする
}

.body {
	margin-bottom: 12px;
	white-space: pre-wrap;
	word-wrap: break-word;

	a {
		color: var(--MI_THEME-accent);
		text-decoration: none;
		&:hover {
			text-decoration: underline;
		}
	}
}

.mediaContainer {
	display: grid;
	gap: 8px;
	margin-bottom: 12px;
	border-radius: 8px;
	overflow: hidden;

	&.grid1 {
	}
	&.grid2 {
		grid-template-columns: repeat(2, 1fr);
	}
	&.grid3 {
		grid-template-columns: repeat(2, 1fr);
		& > :first-child {
			grid-column: span 2;
		}
	}
	&.grid4 {
		grid-template-columns: repeat(2, 1fr);
		grid-template-rows: repeat(2, 1fr);
	}
}

.mediaItem {
	width: 100%;
	height: auto;
	object-fit: contain;
	border-radius: 8px;
	max-height: 100%;
	display: block;
}

.videoPlayer {
	width: 100%;
	border-radius: 8px;
	max-height: 100%;
	display: block;
	object-fit: contain;
}

.mediaItemWrapper {
	overflow: hidden;
	display: flex;
	justify-content: center;
	align-items: center;
	height: 100%;
	min-height: 0;
}

.footer {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparent);
	margin-top: 12px;
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	align-items: center;
}

.stats {
	display: flex;
	gap: 12px;
	align-items: center;

	.statItem {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: default;
	}

	i {
		font-size: 1.1em;
	}

	.iconReply {
		color: var(--MI_THEME-link);
	}
	.iconRetweet {
		color: var(--MI_THEME-renote);
	}
	.iconLike {
		color: var(--MI_THEME-love);
	}
	.iconView {
		color: var(--MI_THEME-notif);
	}
	.iconBookmark {
		color: var(--MI_THEME-info);
	}
}

.statsLink {
	text-decoration: none;
	color: inherit;
	&:hover {
		.statItem {
			text-decoration: underline;
		}
	}
}

.timestampLink {
	color: var(--MI_THEME-fgTransparent);
	text-decoration: none;
	font-size: 0.9em;
	display: flex;
	justify-content: flex-end;
	align-items: center;
	&:hover {
		text-decoration: underline;
	}
}

.source {
	margin-left: auto;
	font-size: 1dem;
	text-align: right;
}

.quoteContainer {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 6px;
	padding: 10px;
	margin-top: 12px;
	margin-bottom: 12px;
	font-size: 0.9em;
	background-color: var(--MI_THEME-panel);
}

.quoteHeader {
	display: flex;
	align-items: center;
	margin-bottom: 8px;
}

.quoteAvatar {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	margin-right: 8px;
}

.quoteAuthorInfo {
	display: flex;
	align-items: baseline;
	gap: 4px;
}

.quoteAuthorName {
	font-weight: bold;
}

.quoteAuthorScreenName {
	color: var(--MI_THEME-fgTransparent);
	font-size: 0.9em;
}

.quoteBody {
	margin-bottom: 8px;
	white-space: pre-wrap;
	word-wrap: break-word;
	font-size: 0.95em;

	a {
		color: var(--MI_THEME-accent);
		text-decoration: none;
		&:hover {
			text-decoration: underline;
		}
	}
}

.quoteFooter {
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparent);
	margin-top: 8px;
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: center;
}

.quoteTimestampLink {
	color: var(--MI_THEME-fgTransparent);
	text-decoration: none;
	display: flex;
	justify-content: flex-end;
	align-items: center;
	&:hover {
		text-decoration: underline;
	}
}

.communityNote {
	border: 1px solid var(--MI_THEME-warn);
	background-color: rgba(var(--MI_THEME-warn-rgb), 0.1);
	border-radius: 6px;
	padding: 10px;
	margin-top: 12px;
	font-size: 0.9em;
}

.communityNoteHeader {
	display: flex;
	align-items: center;
	gap: 6px;
	font-weight: bold;
	margin-bottom: 8px;
	color: var(--MI_THEME-warn);
}

.communityNoteText {
	white-space: pre-wrap;
	word-wrap: break-word;

	a {
		color: var(--MI_THEME-accent);
		text-decoration: none;
		&:hover {
			text-decoration: underline;
		}
	}
}

</style>
