<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 1150px;">
		<div :class="$style.root" class="_selectable">
			<header :class="$style.hero" class="_panel">
				<div :class="$style.eyebrow"><i class="ti ti-sparkles" aria-hidden="true"></i> {{ i18n.ts._misskeyTempura._changelog.guide }}</div>
				<h1 :class="$style.title">{{ i18n.ts._misskeyTempura._changelog.title }}</h1>
				<p v-if="catalog" :class="$style.introduction">{{ catalog.introduction }}</p>
				<div v-if="catalog" :class="$style.heroFooter">
					<span>{{ i18n.ts._misskeyTempura._changelog.categories }} <b>{{ sections.length }}</b></span>
					<span>{{ i18n.tsx._misskeyTempura._changelog.items({ count: totalItems }) }}</span>
					<span>{{ i18n.ts.version }} <b>{{ version }}</b></span>
				</div>
			</header>

			<MkLoading v-if="loading"/>
			<MkError v-else-if="error" @retry="loadCatalog"/>
			<div v-else-if="catalog" :class="$style.layout">
				<aside :class="$style.sidebar">
					<nav class="_panel" :class="$style.navigation" :aria-label="i18n.ts._misskeyTempura._changelog.categories">
						<h2 :class="$style.navTitle">{{ i18n.ts._misskeyTempura._changelog.categories }}</h2>
						<select
							:class="$style.categorySelect"
							:aria-label="i18n.ts._misskeyTempura._changelog.categories"
							:value="searching ? '' : selectedId ?? ''"
							@change="selectCategory(($event.target as HTMLSelectElement).value || null)"
						>
							<option value="">{{ i18n.ts._misskeyTempura._changelog.allCategories }}</option>
							<option v-for="section in sections" :key="section.id" :value="section.id">{{ section.title }}</option>
						</select>
						<div :class="$style.categoryList">
							<button
								type="button"
								class="_button"
								:class="[$style.category, { [$style.active]: !selectedId && !searching }]"
								:aria-pressed="!selectedId && !searching"
								@click="selectCategory(null)"
							>
								<span>{{ i18n.ts._misskeyTempura._changelog.allCategories }}</span>
								<span :class="$style.count">{{ totalItems }}</span>
							</button>
							<button
								v-for="section in sections"
								:key="section.id"
								type="button"
								class="_button"
								:class="[$style.category, { [$style.active]: selectedId === section.id && !searching }]"
								:aria-pressed="selectedId === section.id && !searching"
								@click="selectCategory(section.id)"
							>
								<span>{{ section.title }}</span>
								<span :class="$style.count">{{ countFeatureItems(section) }}</span>
							</button>
						</div>
					</nav>
				</aside>

				<div :class="$style.main">
					<div class="_panel" :class="$style.searchPanel">
						<label :class="$style.searchBox">
							<i class="ti ti-search" aria-hidden="true"></i>
							<input
								v-model="query"
								type="search"
								:class="$style.searchInput"
								:aria-label="i18n.ts._misskeyTempura._changelog.search"
								:placeholder="i18n.ts._misskeyTempura._changelog.search"
							>
						</label>
						<p :class="$style.searchHint">{{ i18n.ts._misskeyTempura._changelog.searchHint }}</p>
					</div>

					<div ref="resultsHeading" :class="$style.resultsHeading" role="status" aria-live="polite">
						<span>{{ searching ? i18n.tsx._misskeyTempura._changelog.results({ query: query.trim() }) : activeTitle }}</span>
						<span :class="$style.resultCount">{{ i18n.tsx._misskeyTempura._changelog.items({ count: resultCount }) }}</span>
					</div>

					<div v-if="!visibleSections.length" class="_panel" :class="$style.empty">
						<i class="ti ti-search-off" aria-hidden="true"></i>
						<p>{{ i18n.ts.noResults }}</p>
						<button type="button" class="_textButton" @click="query = ''">{{ i18n.ts.reset }}</button>
					</div>

					<section
						v-for="section in visibleSections"
						:key="section.id"
						class="_panel"
						:class="$style.section"
						:aria-labelledby="section.id"
					>
						<header :class="$style.sectionHeader">
							<span :class="$style.sectionNumber" aria-hidden="true">{{ String(sections.findIndex(s => s.id === section.id) + 1).padStart(2, '0') }}</span>
							<h2 :id="section.id" :class="$style.sectionTitle">{{ section.title }}</h2>
						</header>
						<div :class="$style.sectionBody">
							<div v-for="(group, gi) in section.groups" :key="gi" :class="$style.group">
								<h3 v-if="group.title" :class="$style.groupTitle">{{ group.title }}</h3>
								<p v-for="(paragraph, pi) in group.paragraphs" :key="pi" :class="$style.paragraph">{{ paragraph }}</p>
								<ul v-if="group.items.length" :class="$style.items">
									<li v-for="(item, ii) in group.items" :key="ii" :class="$style.item">
										<Mfm :text="item.text" :isNote="false"/>
										<ul v-if="item.children.length" :class="$style.children">
											<li v-for="(child, ci) in item.children" :key="ci"><Mfm :text="child" :isNote="false"/></li>
										</ul>
									</li>
								</ul>
							</div>
						</div>
					</section>

					<details v-if="catalog.notes.length" class="_panel" :class="$style.notes">
						<summary><i class="ti ti-info-circle" aria-hidden="true"></i> {{ i18n.ts._misskeyTempura._changelog.notes }}</summary>
						<ul :class="$style.items">
							<li v-for="(note, ni) in catalog.notes" :key="ni">{{ note }}</li>
						</ul>
					</details>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef, useTemplateRef } from 'vue';
import catalogUrl from '../../../../diff.md?url&no-inline';
import { version } from '@@/js/config.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { countFeatureItems, fetchFeatureCatalog, searchFeatureCatalog } from '@/utility/tempura-script/feature-catalog.js';

const catalog = shallowRef<Awaited<ReturnType<typeof fetchFeatureCatalog>> | null>(null);
const loading = ref(true);
const error = ref(false);
let controller: AbortController | null = null;
const resultsHeading = useTemplateRef<HTMLElement>('resultsHeading');
const sections = computed(() => catalog.value?.sections ?? []);
const totalItems = computed(() => sections.value.reduce((count, section) => count + countFeatureItems(section), 0));
const selectedId = ref<string | null>(null);
const query = ref('');
const searching = computed(() => query.value.trim().length > 0);
const visibleSections = computed(() => searching.value
	? searchFeatureCatalog(sections.value, query.value)
	: sections.value.filter(section => selectedId.value === null || section.id === selectedId.value));
const activeTitle = computed(() => sections.value.find(section => section.id === selectedId.value)?.title ?? i18n.ts._misskeyTempura._changelog.allCategories);
const resultCount = computed(() => visibleSections.value.reduce((count, section) => count + countFeatureItems(section), 0));

async function loadCatalog(): Promise<void> {
	controller?.abort();
	const request = new AbortController();
	controller = request;
	loading.value = true;
	error.value = false;
	try {
		const loaded = await fetchFeatureCatalog(catalogUrl, request.signal);
		if (request.signal.aborted || controller !== request) return;
		catalog.value = loaded;
		selectedId.value = loaded.sections[0]?.id ?? null;
	} catch (err) {
		if (request.signal.aborted || controller !== request) return;
		console.error('Failed to load the Tempura feature catalog', err);
		error.value = true;
	} finally {
		if (controller === request) {
			controller = null;
			loading.value = false;
		}
	}
}

function ensureCatalog(): void {
	if (!catalog.value && !controller) void loadCatalog();
}

function cancelLoading(): void {
	controller?.abort();
	controller = null;
	loading.value = false;
}

// RouterView caches pages; leaving it deactivates rather than unmounts them.
onMounted(ensureCatalog);
onActivated(ensureCatalog);
onDeactivated(cancelLoading);
onUnmounted(cancelLoading);

async function selectCategory(id: string | null): Promise<void> {
	selectedId.value = id;
	query.value = '';
	await nextTick();
	const heading = resultsHeading.value;
	if (!heading) return;
	const margin = parseFloat(window.getComputedStyle(heading).scrollMarginTop) || 0;
	if (heading.getBoundingClientRect().top < margin) heading.scrollIntoView({ block: 'start' });
}

definePage(() => ({
	title: i18n.ts._misskeyTempura.diff,
	icon: 'ti ti-pencil-star',
}));
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.hero {
	padding: clamp(24px, 5cqi, 48px);
	border-top: 3px solid var(--MI_THEME-accent);
}

.eyebrow {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-accent);
	font-size: 0.85em;
	font-weight: 700;
}

.title {
	margin: 14px 0;
	font-size: clamp(1.5em, 4cqi, 2em);
	line-height: 1.4;
	letter-spacing: -0.025em;
}

.introduction {
	max-width: 65em;
	margin: 0;
	color: var(--MI_THEME-fg);
	line-height: 1.9;
}

.heroFooter {
	display: flex;
	flex-wrap: wrap;
	gap: 20px;
	margin-top: 24px;
	padding-top: 18px;
	border-top: 1px solid var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);
	font-size: 0.85em;

	b {
		margin-left: 8px;
		color: var(--MI_THEME-accent);
	}
}

.layout {
	display: grid;
	grid-template-columns: 230px minmax(0, 1fr);
	align-items: start;
	gap: 24px;
}

.sidebar {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 12px);
	min-width: 0;
}

.navigation {
	padding: 16px 8px;
}

.navTitle {
	margin: 0;
	padding: 0 12px 12px;
	color: var(--MI_THEME-fg);
	font-size: 0.8em;
}

.categorySelect {
	display: none;
	width: 100%;
	padding: 10px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font: inherit;
}

.categoryList {
	max-height: 65vh;
	overflow-y: auto;
	scrollbar-width: thin;
}

.category {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	box-sizing: border-box;
	width: 100%;
	padding: 11px 12px;
	border-radius: var(--MI-radius);
	text-align: left;
	font-size: 0.85em;
	line-height: 1.5;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
		font-weight: 700;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: -2px;
	}
}

.count {
	flex-shrink: 0;
	font-size: 0.85em;
	font-variant-numeric: tabular-nums;
}

.main {
	display: flex;
	flex-direction: column;
	gap: 16px;
	min-width: 0;
}

.searchPanel {
	padding: 18px 20px;
}

.searchBox {
	display: flex;
	align-items: center;
	gap: 12px;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: var(--MI-radius);
	padding: 0 14px;

	&:focus-within {
		border-color: var(--MI_THEME-accent);
		outline: 2px solid var(--MI_THEME-accentedBg);
	}

	> i {
		color: var(--MI_THEME-accent);
	}
}

.searchInput {
	width: 100%;
	min-width: 0;
	padding: 14px 0;
	border: 0;
	outline: 0;
	background: transparent;
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 0.9em;
}

.searchHint {
	margin: 10px 0 0;
	color: var(--MI_THEME-fg);
	font-size: 0.75em;
}

.resultsHeading {
	scroll-margin-top: calc(var(--MI-stickyTop, 0px) + 12px);
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: 12px;
	padding: 4px;
	font-size: 0.85em;
	overflow-wrap: anywhere;
}

.resultCount {
	flex-shrink: 0;
	color: var(--MI_THEME-accent);
	font-variant-numeric: tabular-nums;
}

.section {
	overflow-wrap: anywhere;
}

.sectionHeader {
	display: flex;
	align-items: baseline;
	gap: 14px;
	padding: 24px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.sectionNumber {
	color: var(--MI_THEME-accent);
	font-size: 0.8em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.sectionTitle {
	margin: 0;
	font-size: 1.2em;
	line-height: 1.5;
}

.sectionBody {
	padding: 0 24px;
}

.group {
	padding: 24px 0;

	& + & {
		border-top: 1px solid var(--MI_THEME-divider);
	}
}

.groupTitle {
	margin: 0 0 16px;
	font-size: 1em;
	color: var(--MI_THEME-accent);
}

.paragraph {
	margin: 0 0 12px;
	line-height: 1.9;
}

.items {
	margin: 0;
	padding-left: 1.3em;
	line-height: 1.9;

	> li + li {
		margin-top: 12px;
	}

	> li::marker {
		color: var(--MI_THEME-accent);
	}
}

.item {
	padding-left: 4px;
}

.children {
	margin-top: 10px;
	padding-left: 1.3em;
	font-size: 0.95em;

	> li + li {
		margin-top: 8px;
	}
}

.empty {
	padding: 40px 24px;
	text-align: center;

	> i {
		font-size: 2em;
		color: var(--MI_THEME-accent);
	}
}

.notes {
	padding: 18px 24px;
	color: var(--MI_THEME-fg);
	font-size: 0.85em;
	overflow-wrap: anywhere;

	> summary {
		cursor: pointer;
		font-weight: 700;
		line-height: 1.8;
	}

	> ul {
		margin-top: 16px;
	}
}

@container (max-width: 750px) {
	.layout {
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
	}

	.sidebar {
		position: static;
	}

	.navigation {
		padding: 14px;
	}

	.navTitle {
		padding-left: 0;
	}

	.categoryList {
		display: none;
	}

	.categorySelect {
		display: block;
	}

	.sectionHeader {
		padding: 20px;
	}

	.sectionBody {
		padding: 0 20px;
	}
}
</style>
