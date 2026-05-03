<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div style="overflow: clip;">
		<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
			<div class="_gaps_m znqjceqz">
				<div v-panel class="about">
					<div class="container">
						<img :src="tempurasvg" alt="" class="icon" draggable="false"/>
						<div class="misskey">Misskey-tempura</div>
						<div class="version">{{ displayVersion }}</div>
					</div>
				</div>
				<MkMfm :text="i18n.ts._misskeyTempura.about" style="text-align: center;"/>
				<FormLink to="/tempura-changelog">
					<template #icon><i class="ti ti-sparkles"></i></template>
					{{ i18n.ts._misskeyTempura.diff }}
				</FormLink>
				<FormSection>
					<template #label>{{ i18n.ts._misskeyTempura.contributors }}</template>
					<div :class="$style.contributors">
						<a v-for="c in contributors" :key="c.github" :href="`https://github.com/${c.github}`" target="_blank" :class="$style.contributor">
							<img :src="`https://github.com/${c.github}.png`" :class="$style.contributorAvatar">
							<span :class="$style.contributorUsername">{{ c.name }}</span>
						</a>
					</div>
				</FormSection>
				<FormSection>
					<template #label>{{ i18n.ts._misskeyTempura.servers.official }}</template>
					<template #description>{{ i18n.ts._misskeyTempura.servers.officialDescription }}</template>

					<div :class="$style.serverGrid">
						<a v-for="s in officialServers" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer" :class="[$style.serverCard, $style.serverCardOfficial]">
							<img :src="getServerIconUrl(s)" :class="$style.serverIcon" :alt="`${s.name} icon`">
							<div :class="$style.serverInfo">
								<div :class="$style.serverNameRow">
									<span :class="$style.serverName">{{ s.name }}</span>
									<span :class="$style.badgeOfficial">OFFICIAL</span>
								</div>
								<span :class="$style.serverDesc">{{ s.description }}</span>
							</div>
						</a>
					</div>
				</FormSection>

				<FormSection>
					<template #label>{{ i18n.ts._misskeyTempura.servers.partner }}</template>
					<template #description>{{ i18n.ts._misskeyTempura.servers.partnerDescription }}</template>

					<div :class="$style.serverList">
						<a v-for="s in endorsedServers" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer" :class="[$style.serverCard, $style.serverCardPartner]">
							<img :src="getServerIconUrl(s)" :class="$style.serverIcon" :alt="`${s.name} icon`">
							<div :class="$style.serverInfo">
								<div :class="$style.serverNameRow">
									<span :class="$style.serverName">{{ s.name }}</span>
									<span :class="$style.badgeEndorsed"><i class="ti ti-check"></i> PARTNER</span>
								</div>
								<span :class="$style.serverDesc">{{ s.description }}</span>
							</div>
						</a>
					</div>
				</FormSection>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { version } from '@@/js/config.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import tempurasvg from '/client-assets/logo-tempura.svg';
import MkMfm from '@/components/global/MkMfm.js';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy.js';

const contributors = [
	{ github: 'lqvp', name: 'lqvp' },
	{ github: 'r-ca', name: 'ろむねこ' },
	{ github: 'chan-mai', name: 'mq1' },
	{ github: 'Steve-0628', name: 'すてさん' },
	{ github: 'r2iz', name: 'r2iz' },
	{ github: 'tai-cha', name: 'taichan' },
	{ github: 'sim1222', name: 'こけっち' },
	{ github: 'harumaki2000', name: 'harumaki2000' },
];

const officialServers = [
	{ name: 'Tempura Official', url: 'https://misskey.vip', description: 'lqvpが運営する公式サーバー' },
	{ name: 'Tempura Develop', url: 'https://mi-tempura.n8.lc', description: 'lqvpが運営する開発用サーバー' },
];

const endorsedServers = [
	{ name: 'しゃふすきー', url: 'https://shahu.ski', description: 'tempuraを利用した信頼できるサーバー' },
	{ name: 'もじもじデート', url: 'https://mojimoji.date', description: 'tempuraを利用した信頼できるサーバー2' },
	{ name: 'よるすきー', url: 'https://misskey.blue', description: 'tempuraを利用した信頼できるサーバー3' },
];

type ServerMeta = {
	iconUrl?: string | null;
	faviconUrl?: string | null;
};

const serverMetaByUrl = ref(new Map<string, ServerMeta>());

function resolveRemoteUrl(baseUrl: string, maybeRelativeUrl: string): string {
	return new URL(maybeRelativeUrl, baseUrl).toString();
}

async function fetchServerMeta(serverUrl: string): Promise<ServerMeta | null> {
	try {
		const res = await window.fetch(new URL('/api/meta', serverUrl), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ detail: false }),
			signal: AbortSignal.timeout(5000),
		});

		if (!res.ok) return null;
		const data = (await res.json()) as unknown;
		if (typeof data !== 'object' || data == null) return null;

		const maybeIconUrl = (data as Record<string, unknown>).iconUrl;
		const maybeFaviconUrl = (data as Record<string, unknown>).faviconUrl;

		return {
			iconUrl: typeof maybeIconUrl === 'string' ? maybeIconUrl : null,
			faviconUrl: typeof maybeFaviconUrl === 'string' ? maybeFaviconUrl : null,
		};
	} catch {
		return null;
	}
}

function getServerIconUrl(server: { url: string }): string {
	const meta = serverMetaByUrl.value.get(server.url);
	const rawSrc = meta?.iconUrl ?? meta?.faviconUrl ?? `${server.url}/favicon.ico`;
	const resolvedSrc = resolveRemoteUrl(server.url, rawSrc);
	return getProxiedImageUrlNullable(resolvedSrc, 'preview') ?? '/client-assets/dummy.png';
}

onMounted(async () => {
	const allServers = [...officialServers, ...endorsedServers];
	const results = await Promise.all(
		allServers.map(async (s) => [s.url, await fetchServerMeta(s.url)] as const),
	);

	serverMetaByUrl.value = new Map(
		results.filter((result): result is [string, ServerMeta] => result[1] != null),
	);
});

const displayVersion = computed(() => {
	return version.split('tempura-')[1];
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._misskeyTempura.aboutTempura,
	icon: null,
}));
</script>

<style lang="scss" scoped>
.znqjceqz {
	> .about {
		position: relative;
		border-radius: var(--MI-radius);

		> .container {
			position: relative;
			text-align: center;
			padding: 16px;

			> .icon {
				display: block;
				width: 300px;
				margin: 0 auto;
				border-radius: 16px;
				position: relative;
				z-index: 1;
			}

			> .misskey {
				margin: 0.75em auto 0 auto;
				width: max-content;
				position: relative;
				z-index: 1;
			}

			> .version {
				margin: 0 auto;
				width: max-content;
				opacity: 0.5;
				position: relative;
				z-index: 1;
			}
		}
	}
}
</style>

<style lang="scss" module>
.contributors {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	grid-gap: 12px;
}

.contributor {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 6px;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.contributorAvatar {
	width: 30px;
	border-radius: 100%;
}

.contributorUsername {
	margin-left: 12px;
}

.serverList {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.serverGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	gap: 12px;
}

.serverCard {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 16px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	text-decoration: none;
	color: var(--MI_THEME-fg);
	transition: background 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		border-color: var(--MI_THEME-accent);
		text-decoration: none;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px var(--MI_THEME-shadow);
	}

	&:active {
		transform: translateY(0);
		box-shadow: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.serverCardOfficial {
	background: var(--MI_THEME-accentedBg);
	border-color: var(--MI_THEME-accent);

	&:hover {
		background: var(--MI_THEME-driveFolderBg);
	}
}

.serverCardPartner {
	background: var(--MI_THEME-panel);
	border-color: var(--MI_THEME-divider);
}

.serverIcon {
	width: 48px;
	height: 48px;
	border-radius: 8px;
	flex: 0 0 auto;
}

.serverInfo {
	flex: 1;
	min-width: 0;
}

.serverNameRow {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 4px;
}

.serverName {
	font-weight: bold;
	font-size: 1.1em;
}

.serverDesc {
	display: block;
	font-size: 0.9em;
	opacity: 0.7;
	line-height: 1.4;
	margin-top: 4px;
}

.badgeOfficial, .badgeEndorsed {
	font-size: 0.7em;
	padding: 2px 6px;
	border-radius: 4px;
	font-weight: bold;
}

.badgeOfficial {
	background: var(--MI_THEME-love);
  color: var(--MI_THEME-fgOnAccent);
}

.badgeEndorsed {
	background: var(--MI_THEME-badge);
	color: var(--MI_THEME-fgOnAccent);
}
</style>
