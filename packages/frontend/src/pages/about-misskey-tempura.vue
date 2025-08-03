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
				<FormLink to="/tempura-changelog" external>
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
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { version } from '@@/js/config.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import tempurasvg from '/client-assets/logo-tempura.svg';
import MkMfm from '@/components/global/MkMfm.js';

const contributors = [
	{ github: 'lqvp', name: 'lqvp' },
	{ github: 'r-ca', name: 'ろむねこ' },
	{ github: 'chan-mai', name: 'mq1' },
	{ github: 'ruruke', name: 'ruruke' },
	{ github: 'Steve-0628', name: 'すてさん' },
	{ github: 'r2iz', name: 'r2iz' },
	{ github: 'tai-cha', name: 'taichan' },
	{ github: 'sim1222', name: 'こけっち' },
];

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
</style>
