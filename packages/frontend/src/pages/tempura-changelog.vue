<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div v-if="error" class="$style.errorMessage">
			{{ error }}
		</div>
		<div v-else :class="$style.changelogContainer" class="_gaps_s">
			<MkFolder
				v-for="changelog in changelogs"
				:key="changelog.version"
				:defaultOpen="version.split('tempura-')[1]?.startsWith(changelog.version)"
			>
				<template #label>
					<MkSparkle v-if="version.split('tempura-')[1]?.startsWith(changelog.version)">
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
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkSparkle from '@/components/MkSparkle.vue';

interface Changelog {
	version: string;
	context: Record<string, string[]>;
}

const changelogs = ref<Changelog[]>([]);
const error = ref<string | null>(null);

const parseMarkdown = (markdown: string) => {
	const sections = markdown.split('---');
	const parsedChangelogs = sections
		.map(section => section.trim())
		.filter(section => section.length > 0 && (section.startsWith('# ') || section.startsWith('## ')))
		.map((section) => {
			const lines = section.split('\n').map(line => line.trim());
			const versionLine = lines.shift() ?? '';
			const v = versionLine.replace(/^#+\s*/, '');

			lines.shift();

			const context: { [key: string]: string[] } = { 'General': [] };
			let currentCategory = 'General';

			for (const line of lines) {
				if (line.startsWith('### ')) {
					currentCategory = line.replace(/^###\s*/, '');
					context[currentCategory] = [];
				} else if (line.startsWith('* ') || /^[a-zA-Z]+:/.test(line)) {
					context[currentCategory].push(line.replace(/^\*\s*/, ''));
				}
			}

			if (Object.keys(context).length === 1 && context['General'].length === 0) {
				return null;
			}

			for (const key in context) {
				if (context[key].length === 0) {
					delete context[key];
				}
			}

			return {
				version: v,
				context: context,
			};
		})
		.filter(Boolean);

	changelogs.value = parsedChangelogs as Changelog[];
};

onMounted(async () => {
	try {
		const res = await window.fetch('https://hackmd.io/@il2/misskey-tempura/download');
		if (res.ok) {
			const markdown = await res.text();
			parseMarkdown(markdown);
		} else {
			console.error(`Failed to fetch changelog: ${res.status}`);
			error.value = 'チェンジログの取得に失敗しました';
		}
	} catch (err) {
		console.error(err);
		error.value = 'チェンジログの取得に失敗しました';
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
