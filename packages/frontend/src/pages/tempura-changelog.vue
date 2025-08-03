<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="changelog-container _gaps_s">
			<MkFolder
				v-for="changelog in changelogs"
				:key="changelog.version"
				:defaultOpen="changelog.isDefault"
			>
				<template #label><span class="version-label">{{ changelog.version }}</span></template>

				<div class="content">
					<div v-for="(items, category) in changelog.context" :key="category" class="category-section">
						<h4 class="category-title">{{ category }}</h4>
						<ul class="change-list">
							<li v-for="(item, i) in items" :key="i" class="change-item">
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
import { computed, ref, onMounted } from 'vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._misskeyTempura.diff,
	icon: 'ti ti-pencil-star',
}));

const changelogs = ref<any[]>([]);

const parseMarkdown = (markdown: string) => {
	const sections = markdown.split('---');
	const parsedChangelogs = sections
		.map(section => section.trim())
		.filter(section => section.length > 0 && (section.startsWith('# ') || section.startsWith('## ')))
		.map((section, index) => {
			const lines = section.split('\n').map(line => line.trim());
			const versionLine = lines.shift() || '';
			const version = versionLine.replace(/^#+\s*/, '');

			lines.shift(); // Base or empty line

			const context: { [key: string]: string[] } = {};
			let currentCategory = 'General';

			for (const line of lines) {
				if (line.startsWith('### ')) {
					currentCategory = line.replace(/^###\s*/, '');
					if (!context[currentCategory]) {
						context[currentCategory] = [];
					}
				} else if (line.startsWith('* ') || /^[a-zA-Z]+:/.test(line)) {
					if (!context[currentCategory]) {
						context[currentCategory] = [];
					}
					context[currentCategory].push(line.replace(/^\*\s*/, ''));
				}
			}

			// カテゴリが General しかなく、中身も空の場合は無視する
			if (Object.keys(context).length === 1 && context['General']?.length === 0) {
				return null;
			}

			// contextが空のカテゴリを削除
			for (const key in context) {
				if (context[key].length === 0) {
					delete context[key];
				}
			}

			return {
				isDefault: index === 0,
				version: version,
				context: context,
			};
		})
		.filter(Boolean);

	changelogs.value = parsedChangelogs as any[];
};

onMounted(async () => {
	try {
		const res = await window.fetch('https://hackmd.io/@il2/misskey-tempura/download');
		if (res.ok) {
			const markdown = await res.text();
			parseMarkdown(markdown);
		}
	} catch (e) {
		console.error(e);
	}
});
</script>

<style lang="scss" module>
.changelog-container {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.version-label {
	font-weight: bold;
	font-size: 1.2em;
}

.content {
	padding: 12px 16px;
	background-color: var(--bg);
	border-top: 1px solid var(--divider);

	> .category-section {
		&:not(:last-child) {
			margin-bottom: 1em;
		}
	}
}

.category-title {
	font-size: 1.1em;
	font-weight: bold;
	margin-bottom: 0.5em;
	color: var(--accent);
}

.change-list {
	list-style-type: disc;
	padding-left: 20px;

	.change-item {
		margin-bottom: 0.5em;
		line-height: 1.5;
	}
}
</style>
