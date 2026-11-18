<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-cloud"></i></template>
	<template #label><SearchLabel>{{ i18n.ts.drive }}</SearchLabel></template>
	<!-- 設定項目が無いため、このコンポーネントは現在 tempura-settings.vue から描画していない。
	     描画していないページへの検索結果を作らないよう、SearchMarker も登録しない。 -->
	<div class="_gaps_m">
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import MkFolder from '@/components/MkFolder.vue';
import { i18n } from '@/i18n.js';
</script>
