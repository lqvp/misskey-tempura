<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition :name="prefer.s.animation ? '_transition_zoom' : ''" appear>
	<div :class="$style.root">
		<MkResult type="notFound" :text="i18n.ts.noSuchUser"/>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

</script>

<style lang="scss" module>
.root {
	padding: 32px;
	text-align: center;
  align-items: center;
}

.text {
	margin: 0 0 8px 0;
}

.button {
	margin: 0 auto;
}

.img {
	vertical-align: bottom;
  width: 128px;
	height: 128px;
	margin-bottom: 16px;
	border-radius: 16px;
}
</style>
