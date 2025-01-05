<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="illegalTaikoContainer">
	<iframe
		:src="gameUrl"
		loading="lazy"
		scrolling="no"
		frameborder="0"
		allowfullscreen
		style="width: 100%; height: 100%; display: block; border: none;"
	/>
</div>
</template>

<script lang="ts" setup>
import { definePageMetadata } from '@/scripts/page-metadata.js';

const gameUrl = 'https://www.cjdgrevival.com/';

definePageMetadata(() => ({
	title: 'taiko',
	icon: 'ti ti-device-gamepad',
}));
</script>

<style scoped>
.illegalTaikoContainer {
    position: relative;
    width: 100%;
    height: calc(100vh - 64px);
    overflow: hidden;
}
</style>
