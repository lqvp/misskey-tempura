<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div v-if="error" :class="$style.errorMessage">
			{{ error }}
		</div>
		<div v-else :class="$style.changelogContainer" class="_gaps_s">
			<MkFolder
				v-for="changelog in changelogs"
				:key="changelog.version"
				:defaultOpen="isCurrentVersion(changelog.version)"
			>
				<template #label>
					<MkSparkle v-if="isCurrentVersion(changelog.version)">
						<span :class="$style.versionLabel">{{ changelog.version }}</span>
					</MkSparkle>
					<span v-else :class="$style.versionLabel">{{ changelog.version }}</span>
				</template>

				<div :class="$style.content">
					<div v-for="(items, category) in changelog.context" :key="category" :class="$style.categorySection">
						<h4 :class="$style.categoryTitle">{{ category }}</h4>
						<ul :class="$style.changeList">
							<li v-for="(item, i) in items" :key="i" :class="$style.changeItem">
								<Mfm :text="item" :isNote="false"/>
							</li>
						</ul>
					</div>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { version } from '@@/js/config.js';
import { computed, ref, onMounted } from 'vue';
import type { TempuraChangelogEntry } from '@/utility/tempura-script/parse-tempura-changelog.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkSparkle from '@/components/MkSparkle.vue';
import { parseTempuraChangelogMarkdown } from '@/utility/tempura-script/parse-tempura-changelog.js';

const changelogs = ref<TempuraChangelogEntry[]>([]);
const error = ref<string | null>(null);

const currentTempuraVersion = computed(() => version.split('tempura-')[1] ?? '');
const isCurrentVersion = (changelogVersion: string): boolean => {
	const current = currentTempuraVersion.value;
	if (current === changelogVersion) return true;
	if (!current.startsWith(changelogVersion)) return false;

	const next = current[changelogVersion.length];
	return next === '-' || next === '+' || next === '.';
};

const parseMarkdown = (markdown: string) => {
	changelogs.value = parseTempuraChangelogMarkdown(markdown);
};

onMounted(async () => {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
	try {
		const res = await window.fetch('https://hackmd.io/@il2/misskey-tempura/download', {
			signal: controller.signal,
		});
		if (res.ok) {
			const markdown = await res.text();
			parseMarkdown(markdown);
		} else {
			console.error(`Failed to fetch changelog: ${res.status}`);
			error.value = 'changelogの取得に失敗しました';
		}
	} catch (err) {
		console.error(err);
		error.value = err instanceof DOMException && err.name === 'AbortError'
			? 'changelogの取得がタイムアウトしました'
			: 'changelogの取得に失敗しました';
	} finally {
		window.clearTimeout(timeoutId);
	}
});

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._misskeyTempura.diff,
	icon: 'ti ti-pencil-star',
}));
</script>

<style lang="scss" module>
.changelogContainer {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.errorMessage {
	color: var(--MI_THEME-error);
	background-color: var(--MI_THEME-infoWarnBg);
	border: 1px solid var(--MI_THEME-error);
	padding: 12px;
	border-radius: 8px;
	text-align: center;
}

.versionLabel {
	font-weight: bold;
}

.content {
	padding: 12px 16px;
	border-top: 1px solid var(--MI_THEME-divider);

	> .categorySection {
		&:not(:last-child) {
			margin-bottom: 1em;
		}
	}
}

.categoryTitle {
	font-size: 1.1em;
	font-weight: bold;
	margin-bottom: 0.5em;
	color: var(--MI_THEME-accent);
}

.changeList {
	list-style-type: disc;
	padding-left: 20px;

	.changeItem {
		margin-bottom: 0.5em;
		line-height: 1.5;
	}
}
</style>
