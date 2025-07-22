<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:withOkButton="false"
	@click="cancel()"
	@close="cancel()"
>
	<template #header>{{ i18n.ts.schedulePostList }}</template>
	<div class="_spacer" style="--MI_SPACER-marginMin: 14px; --MI_SPACER-marginMax: 16px;">
		<MkPagination ref="paginationEl" :paginator="paginator">
			<template #empty>
				<div class="_fullinfo">
					<MkResult type="empty" :text="i18n.ts.nothing"/>
				</div>
			</template>

			<template #default="{ items }">
				<div class="_gaps">
					<MkNoteSimple v-for="item in items" :key="item.id" :scheduled="true" :note="item.note" @editScheduleNote="listUpdate"/>
				</div>
			</template>
		</MkPagination>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, markRaw } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';

const emit = defineEmits<{
	(ev: 'cancel'): void;
}>();

const dialogEl = ref();
const cancel = () => {
	emit('cancel');
	dialogEl.value.close();
};

const paginationEl = ref();
const paginator = markRaw(new Paginator('notes/schedule/list', {
	limit: 10,
	offsetMode: true,
}));

function listUpdate() {
	paginationEl.value.reload();
}
</script>
