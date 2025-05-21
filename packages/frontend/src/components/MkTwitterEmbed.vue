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
		</header>
	</a>
	<div :class="$style.body" v-html="tweetTextWithLinks"></div>

	<!-- Quoted Tweet Section -->
	<div v-if="tweetData.quote" :class="$style.quoteContainer">
		<a :href="`https://twitter.com/${tweetData.quote.author.screen_name}`" target="_blank" rel="noopener noreferrer" :class="$style.headerLink">
			<header :class="$style.quoteHeader">
				<img :src="tweetData.quote.author.avatar_url" :alt="`${tweetData.quote.author.name}'s avatar`" :class="$style.quoteAvatar"/>
				<div :class="$style.quoteAuthorInfo">
					<span :class="$style.quoteAuthorName">{{ tweetData.quote.author.name }}</span>
					<span :class="$style.quoteAuthorScreenName">@{{ tweetData.quote.author.screen_name }}</span>
				</div>
			</header>
		</a>
		<div :class="$style.quoteBody" v-html="quoteTextWithLinks"></div>
		<div v-if="quoteHasMedia" :class="$style.quoteMediaIndicator">
			<i class="ti ti-photo"></i> {{ i18n.ts.mediaOmitted }}
		</div>
		<footer :class="$style.quoteFooter">
			<a :href="tweetData.quote.url" target="_blank" rel="noopener noreferrer" :class="$style.quoteTimestampLink">{{ quoteFormattedDate }}</a>
		</footer>
	</div>

	<div v-if="mediaItems.length > 0" :class="[$style.mediaContainer, $style[`grid${mediaItems.length > 4 ? 4 : mediaItems.length}`]]">
		<div v-for="(media, index) in mediaItems" :key="media.url || index" class="media-item-wrapper">
			<MkMediaImage
				v-if="media.type === 'photo'"
				:image="mapToDriveFile(media, tweetData)"
				:class="$style.mediaItem"
				:forceOriginal="true"
			/>
			<MkMediaVideo
				v-else-if="media.type === 'video' || media.type === 'gif'"
				:video="mapToDriveFile(media, tweetData)"
				:class="$style.videoPlayer"
				autoplay
				loop
				muted
				playsinline
				controls
			/>
		</div>
	</div>
	<footer :class="$style.footer">
		<div :class="$style.stats">
			<span v-if="tweetData.replies != null">
				<i class="ti ti-message-circle"></i> {{ tweetData.replies }}
			</span>
			<span v-if="tweetData.retweets != null">
				<i class="ti ti-repeat"></i> {{ tweetData.retweets }}
			</span>
			<span v-if="tweetData.likes != null">
				<i class="ti ti-heart"></i> {{ tweetData.likes }}
			</span>
		</div>
		<a :href="tweetData.url" target="_blank" rel="noopener noreferrer" :class="$style.timestampLink">{{ formattedDate }}</a>
		<div v-if="tweetData.source" :class="$style.source" v-html="tweetData.source"></div>
	</footer>
</div>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { i18n } from '@/i18n.js';
import MkMediaImage from '@/components/MkMediaImage.vue';
import MkMediaVideo from '@/components/MkMediaVideo.vue';

interface DriveFile {
	id: string;
	createdAt: string;
	name: string;
	type: string; // MIME type
	md5: string;
	size: number;
	isSensitive: boolean;
	blurhash: string | null;
	properties: {
		width?: number;
		height?: number;
		orientation?: number;
		avgColor?: string;
		duration?: number; // For video
	};
	url: string;
	thumbnailUrl: string;
	comment: string | null;
	folderId: string | null;
	userId: string | null;
	user: any | null;
}

interface FxTweetAuthor {
	name: string;
	screen_name: string;
	avatar_url: string;
	banner_url?: string; // Optional, based on typical Twitter API structures
}

interface FxTweetMediaPhoto {
	type: 'photo';
	url: string;
	width: number;
	height: number;
	altText?: string;
}

interface FxTweetMediaVideo {
	type: 'video' | 'gif'; // FxEmbed might use 'gif' for animated GIFs
	url: string;
	thumbnail_url: string;
	width: number;
	height: number;
	format?: string; // e.g., "video/mp4"
	duration_millis?: number;
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
	id_str?: string; // FxEmbed might provide original tweet ID string
	replies?: number;
	retweets?: number;
	likes?: number;
	quote?: FxTweet; // Add quote property
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
		const response = await window.fetch(`https://api.fxtwitter.com/${props.screenName}/status/${props.tweetId}`);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data: FxTwitterApiResponse = await response.json();
		if (data.code !== 200 || !data.tweet) {
			throw new Error(data.message || 'Failed to fetch tweet data from API');
		}
		tweetData.value = data.tweet;
	} catch (e: any) {
		error.value = e.message ?? 'Failed to load tweet';
		console.error('Failed to fetch FxTwitter data:', e);
	} finally {
		fetching.value = false;
	}
};

onMounted(() => {
	fetchTweetData();
});

const formattedDate = computed(() => {
	if (tweetData.value?.created_timestamp) {
		return formatDateTime(new Date(tweetData.value.created_timestamp * 1000).toISOString());
	}
	return '';
});

// Helper function to process tweet text (used for main tweet and quote)
const processTweetText = (text: string | undefined) => {
	if (!text) return '';
	let processedText = text;
	const urlRegex = /(https?:\/\/[^\s]+)/g;
	processedText = processedText.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
	const mentionRegex = /@([a-zA-Z0-9_]+)/g;
	processedText = processedText.replace(mentionRegex, '<a href="https://twitter.com/$1" target="_blank" rel="noopener noreferrer">@$1</a>');
	const hashtagRegex = /#([^\s#!"$%&'()*+,-./:;<=>?@[\\\]^`{|}~]+)/gu;
	processedText = processedText.replace(hashtagRegex, (match, hashtagContent) => {
		return `<a href="https://twitter.com/hashtag/${encodeURIComponent(hashtagContent)}" target="_blank" rel="noopener noreferrer">${match}</a>`;
	});
	return processedText.replace(/\n/g, '<br>');
};

const tweetTextWithLinks = computed(() => {
	return processTweetText(tweetData.value?.text);
});

const quoteTextWithLinks = computed(() => {
	return processTweetText(tweetData.value?.quote?.text);
});

const quoteFormattedDate = computed(() => {
	if (tweetData.value?.quote?.created_timestamp) {
		return formatDateTime(new Date(tweetData.value.quote.created_timestamp * 1000).toISOString());
	}
	return '';
});

const mediaItems = computed((): FxTweetMedia[] => {
	return tweetData.value?.media?.all || tweetData.value?.media?.photos || tweetData.value?.media?.videos || [];
});

const quoteHasMedia = computed(() => {
	const quote = tweetData.value?.quote;
	if (!quote) return false;
	return (quote.media?.all && quote.media.all.length > 0) ||
	       (quote.media?.photos && quote.media.photos.length > 0) ||
	       (quote.media?.videos && quote.media.videos.length > 0);
});

function mapToDriveFile(media: FxTweetMedia, tweet: FxTweet | null): DriveFile {
	const isVideo = media.type === 'video' || media.type === 'gif';
	const name = media.url.substring(media.url.lastIndexOf('/') + 1) || `media_${media.type}`;

	return {
		id: tweet?.id_str || props.tweetId + '_' + name,
		createdAt: tweet?.created_at || new Date( (tweet?.created_timestamp || 0) * 1000).toISOString(),
		name: name,
		type: isVideo ? ( (media as FxTweetMediaVideo).format || 'video/mp4') : 'image/jpeg', // Guess MIME type
		md5: '', // Not available from FxTwitter
		size: 0, // Not available
		isSensitive: tweet?.possibly_sensitive || false,
		blurhash: null, // Not available
		properties: {
			width: media.width,
			height: media.height,
			duration: isVideo ? (media as FxTweetMediaVideo).duration_millis : undefined,
		},
		url: media.url,
		thumbnailUrl: isVideo ? (media as FxTweetMediaVideo).thumbnail_url : media.url,
		comment: null,
		folderId: null,
		userId: null,
		user: null,
	};
}

function formatDateTime(time: string): string {
	const date = new Date(time);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');

	return `${year}/${month}/${day} ${hours}:${minutes}`;
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

.body {
	margin-bottom: 12px;
	white-space: pre-wrap; // Handles line breaks
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
		// single item takes full width
	}
	&.grid2 {
		grid-template-columns: repeat(2, 1fr);
	}
	&.grid3 {
		grid-template-columns: repeat(2, 1fr); // First item larger or adjust as needed
		& > :first-child {
			grid-column: span 2; // Example: first item spans two columns
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
	object-fit: contain; // Change to contain to show full image
	border-radius: 8px;
	max-height: 100%; // Relative to mediaItemWrapper
	display: block; // Ensure it behaves as a block for sizing
}

.videoPlayer {
	width: 100%;
	border-radius: 8px;
	max-height: 100%; // Relative to mediaItemWrapper
	display: block; // Ensure it behaves as a block for sizing
	object-fit: contain; // Ensure video also contains
}

.mediaItemWrapper {
	overflow: hidden;
	display: flex;
	justify-content: center;
	align-items: center;
	height: 100%; // Make wrapper take full height of grid cell
	min-height: 0; // For flexbox to allow shrinking
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

	span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: default; // For tooltip
	}

	i {
		font-size: 1.1em;
	}
}

.timestampLink {
	color: var(--MI_THEME-fgTransparent);
	text-decoration: none;
	&:hover {
		text-decoration: underline;
	}
}

.source {
	// margin-top: 8px; // Adjusted by flex gap
}

.quoteContainer {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 6px;
	padding: 10px;
	margin-top: 12px;
	margin-bottom: 12px;
	font-size: 0.9em;
	background-color: var(--MI_THEME-panel); // Slightly different background for quote
}

.quoteHeader {
	display: flex;
	align-items: center;
	margin-bottom: 8px;
}

.quoteAvatar {
	width: 24px; // Smaller avatar for quote
	height: 24px;
	border-radius: 50%;
	margin-right: 8px;
}

.quoteAuthorInfo {
	display: flex;
	align-items: baseline; // Align name and screen name on baseline
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
	font-size: 0.95em; // Slightly smaller text for quote body

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
}

.quoteTimestampLink {
	color: var(--MI_THEME-fgTransparent);
	text-decoration: none;
	&:hover {
		text-decoration: underline;
	}
}

.quoteMediaIndicator {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparent);
	margin-top: 8px;
	display: flex;
	align-items: center;
	gap: 4px;
}

</style>
