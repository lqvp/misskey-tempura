<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-cloud"></i></template>
	<template #label>{{ i18n.ts.drive }}</template>
	<div class="_gaps_m">
		<div class="_gaps_m">
			<MkSelect v-model="imageCompressionMode">
				<template #label>{{ i18n.ts._imageCompressionMode.title }}</template>
				<option value="resizeCompress">{{ i18n.ts._imageCompressionMode.resizeCompress }}</option>
				<option value="noResizeCompress">{{ i18n.ts._imageCompressionMode.noResizeCompress }}</option>
				<option value="resizeCompressLossy">{{ i18n.ts._imageCompressionMode.resizeCompressLossy }}</option>
				<option value="noResizeCompressLossy">{{ i18n.ts._imageCompressionMode.noResizeCompressLossy }}</option>
				<template #caption>{{ i18n.ts._imageCompressionMode.description }}</template>
			</MkSelect>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';

const imageCompressionMode = computed(defaultStore.makeGetterSetter('imageCompressionMode'));

</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
