<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="props.popup.component" v-bind="props.popup.props" v-on="props.popup.events"/>
</template>

<script lang="ts" setup>
import type { popups } from '@/os.js';

const props = defineProps<{
	popup: (typeof popups)['value'][number];
}>();
</script>
