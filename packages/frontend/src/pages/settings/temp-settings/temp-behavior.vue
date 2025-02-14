<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-mood-happy"></i></template>
	<template #label>{{ i18n.ts.behavior }}</template>
	<div class="_gaps_m">
		<div class="_gaps_m">
			<MkSwitch v-model="reactionChecksMuting">
				{{ i18n.ts._reactionChecksMuting.title }}
				<template #caption>{{ i18n.ts._reactionChecksMuting.caption }}</template>
			</MkSwitch>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';

const reactionChecksMuting = computed(defaultStore.makeGetterSetter('reactionChecksMuting'));

</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
