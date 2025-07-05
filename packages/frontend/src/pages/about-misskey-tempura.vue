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
					<div ref="containerEl" class="container" :class="{ playing: easterEggEngine != null }">
						<img src="https://github.com/lqvp.png" alt="" class="icon" draggable="false" @load="iconLoaded" @click="gravity"/>
						<div class="misskey">Misskey-tempura</div>
						<div class="version">{{ displayVersion }}</div>
						<span v-for="emoji in easterEggEmojis" :key="emoji.id" class="emoji" :data-physics-x="emoji.left" :data-physics-y="emoji.top" :class="{ _physics_circle_: !emoji.emoji.startsWith(':') }">
							<MkCustomEmoji v-if="emoji.emoji[0] === ':'" class="emoji" :name="emoji.emoji" :normal="true" :noStyle="true" :fallbackToImage="true"/>
							<MkEmoji v-else class="emoji" :emoji="emoji.emoji" :normal="true" :noStyle="true"/>
						</span>
					</div>
					<button v-if="thereIsTreasure" class="_button treasure" @click="getTreasure"><img src="/fluent-emoji/1f3c6.png" class="treasureImg"></button>
				</div>
				<div style="text-align: center;">
					{{ i18n.ts._misskeyTempura.about }}
				</div>
				<FormLink to="https://hackmd.io/@il2/misskey-tempura" external>
					<template #icon><i class="ti ti-sparkles"></i></template>
					{{ i18n.ts.originalFeature }}
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
import { nextTick, onBeforeUnmount, ref, shallowRef, computed } from 'vue';
import { version } from '@@/js/config.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { physics } from '@/utility/physics.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { store } from '@/store.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { claimAchievement, claimedAchievements } from '@/utility/achievements.js';
import { $i } from '@/i.js';

const contributors = [
	{ github: 'lqvp', name: 'lqvp' },
	{ github: 'r-ca', name: 'ろむねこ' },
	{ github: 'chan-mai', name: 'mq1' },
	{ github: 'ruruke', name: 'ruruke' },
	{ github: 'Steve-0628', name: 'すてさん' },
	{ github: 'r2iz', name: 'r2iz' },
	{ github: 'tai-cha', name: 'taichan' },
	{ github: 'buachigithub', name: 'buachi' },
	{ github: 'Misaki0331', name: '水咲(みさき)' },
	{ github: 'harumaki2000', name: 'harumaki2000' },
	{ github: 'sim1222', name: 'こけっち' },
];

const displayVersion = computed(() => {
	return version.split('tempura-')[1];
});

const thereIsTreasure = ref($i && !claimedAchievements.includes('foundTreasure'));

let easterEggReady = false;
const easterEggEmojis = ref<{
	id: string,
	top: number,
	left: number,
	emoji: string
}[]>([]);
const easterEggEngine = ref<{ stop: () => void } | null>(null);
const containerEl = shallowRef<HTMLElement>();

function iconLoaded() {
	const emojis = store.s.reactions;
	const containerWidth = containerEl.value.offsetWidth;
	for (let i = 0; i < 32; i++) {
		easterEggEmojis.value.push({
			id: i.toString(),
			top: -(128 + (Math.random() * 256)),
			left: (Math.random() * containerWidth),
			emoji: emojis[Math.floor(Math.random() * emojis.length)],
		});
	}

	nextTick(() => {
		easterEggReady = true;
	});
}

function gravity() {
	if (!easterEggReady) return;
	easterEggReady = false;
	easterEggEngine.value = physics(containerEl.value);
}

function getTreasure() {
	thereIsTreasure.value = false;
	claimAchievement('foundTreasure');
}

onBeforeUnmount(() => {
	if (easterEggEngine.value) {
		easterEggEngine.value.stop();
	}
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

		> .treasure {
			position: absolute;
			top: 60px;
			left: 0;
			right: 0;
			margin: 0 auto;
			width: min-content;

			> .treasureImg {
				width: 25px;
				vertical-align: bottom;
			}
		}

		> .container {
			position: relative;
			text-align: center;
			padding: 16px;

			&.playing {
				&, * {
					user-select: none;
				}

				* {
					will-change: transform;
				}

				> .emoji {
					visibility: visible;
				}
			}

			> .icon {
				display: block;
				width: 80px;
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

			> .emoji {
				position: absolute;
				z-index: 1;
				top: 0;
				left: 0;
				visibility: hidden;

				> .emoji {
					pointer-events: none;
					font-size: 24px;
					width: 24px;
				}
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

.patronsWithIcon {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	grid-gap: 12px;
}

.patronWithIcon {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 6px;
}

.patronIcon {
	width: 24px;
	border-radius: 100%;
}

.patronName {
	margin-left: 12px;
}
</style>
