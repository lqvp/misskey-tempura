<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="noLink ? 'div' : 'MkA'" :to="forModeration ? `/admin/roles/${role.id}` : `/roles/${role.id}`" :class="[$style.root, { [$style.rainbow]: role.isRainbow }]" tabindex="-1" :style="role.isRainbow ? {} : { '--color': role.color }">
	<template v-if="forModeration">
		<i v-if="role.isPublic" class="ti ti-world" :class="$style.icon" style="color: var(--MI_THEME-success)"></i>
		<i v-else class="ti ti-lock" :class="$style.icon" style="color: var(--MI_THEME-warn)"></i>
	</template>

	<div v-adaptive-bg class="_panel" :class="$style.body">
		<div :class="$style.bodyTitle">
			<span :class="$style.bodyIcon">
				<template v-if="role.iconUrl">
					<img :class="$style.bodyBadge" :src="role.iconUrl"/>
				</template>
				<template v-else>
					<i v-if="role.isAdministrator" class="ti ti-crown" style="color: var(--MI_THEME-accent);"></i>
					<i v-else-if="role.isModerator" class="ti ti-shield" style="color: var(--MI_THEME-accent);"></i>
					<i v-else class="ti ti-user" style="opacity: 0.7;"></i>
				</template>
			</span>
			<span :class="$style.bodyName">{{ role.name }}</span>
			<template v-if="detailed">
				<span v-if="role.target === 'manual'" :class="$style.bodyUsers">{{ role.usersCount }} users</span>
				<span v-else-if="role.target === 'conditional'" :class="$style.bodyUsers">? users</span>
			</template>
		</div>
		<div :class="$style.bodyDescription">{{ role.description }}</div>
	</div>
</component>
</template>

<script lang="ts" setup>
import { } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	role: Misskey.entities.Role;
	forModeration: boolean;
	detailed?: boolean;
	noLink?: boolean
}>(), {
	detailed: true,
	noLink: false,
});
</script>

	<style lang="scss" module>
	.root {
	display: flex;
	align-items: center;
	}

	.icon {
	margin: 0 12px;
	}

	.body {
	display: block;
	padding: 16px 20px;
	flex: 1;
	border-left: solid 6px var(--color);
	}

	.rainbow .body {
	border-left: none;
	position: relative;
	}

	.rainbow .body::before {
	content: '';
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 6px;
	background: linear-gradient(
		to bottom,
		#ff0000, /* Red */
		#ff7f00, /* Orange */
		#ffff00, /* Yellow */
		#00ff00, /* Green */
		#00ffff, /* Cyan */
		#0000ff, /* Blue */
		#8b00ff  /* Violet */
	);
	animation: rainbowShimmer 2s linear infinite;
	opacity: 0.7;
	}

	@keyframes rainbowShimmer {
		0% {
			background-position: 0% 0%;
		}
		100% {
			background-position: 0% 200%;
		}
	}

	.bodyTitle {
	display: flex;
	}

	.bodyIcon {
	margin-right: 8px;
	}

	.bodyBadge {
	height: 1.3em;
	vertical-align: -20%;
	}

	.bodyName {
	font-weight: bold;
	}

	.bodyUsers {
	margin-left: auto;
	opacity: 0.7;
	}

	.bodyDescription {
	opacity: 0.7;
	font-size: 85%;
	}
	</style>
