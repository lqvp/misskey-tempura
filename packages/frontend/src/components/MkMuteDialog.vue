<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :preferType="'dialog'" :zPriority="'high'" @closed="emit('closed')">
	<div :class="$style.root">
		<header>{{ i18n.ts.mutePeriod }}</header>

		<section>
			<div>
				<MkSelect v-model="expiration" small>
					<template #label>{{ i18n.ts._poll.expiration }}</template>
					<option value="at">{{ i18n.ts._poll.at }}</option>
					<option value="after">{{ i18n.ts._poll.after }}</option>
					<option value="indefinitely">{{ i18n.ts.indefinitely }}</option>
				</MkSelect>
				<section v-if="expiration === 'at'">
					<MkInput v-model="atDate" small type="date" class="input">
						<template #label>{{ i18n.ts._poll.deadlineDate }}</template>
					</MkInput>
					<MkInput v-model="atTime" small type="time" class="input">
						<template #label>{{ i18n.ts._poll.deadlineTime }}</template>
					</MkInput>
				</section>
				<section v-else-if="expiration === 'after'">
					<MkInput v-model="after" small type="number" class="input">
						<template #label>{{ i18n.ts._poll.duration }}</template>
					</MkInput>
					<MkSelect v-model="unit" small>
						<option value="minute">{{ i18n.ts._time.minute }}</option>
						<option value="hour">{{ i18n.ts._time.hour }}</option>
						<option value="day">{{ i18n.ts._time.day }}</option>
					</MkSelect>
				</section>
			</div>
		</section>

		<div :class="$style.buttons">
			<MkButton primary @click="ok">{{ i18n.ts.ok }}</MkButton>
			<MkButton @click="cancel">{{ i18n.ts.cancel }}</MkButton>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { ref, watch, useTemplateRef } from 'vue';
import MkInput from './MkInput.vue';
import MkSelect from './MkSelect.vue';
import MkButton from './MkButton.vue';
import MkModal from './MkModal.vue';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { addTime } from '@/utility/time.js';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{
	(ev: 'done', v: number | null): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');

const expiration = ref<'at' | 'after' | 'indefinitely'>('indefinitely');
const atDate = ref(formatDateTimeString(addTime(new Date(), 1, 'day'), 'yyyy-MM-dd'));
const atTime = ref('00:00');
const after = ref(10);
const unit = ref<'minute' | 'hour' | 'day'>('minute');

const calcAt = () => {
	return new Date(`${atDate.value} ${atTime.value}`).getTime();
};

const calcAfter = () => {
	let base = parseInt(after.value.toString());
	if (unit.value === 'day') {
		base *= 24 * 60 * 60;
	} else if (unit.value === 'hour') {
		base *= 60 * 60;
	} else if (unit.value === 'minute') {
		base *= 60;
	}
	return base * 1000;
};

const ok = () => {
	let expiresAt: number | null;
	switch (expiration.value) {
		case 'at':
			expiresAt = calcAt();
			break;
		case 'after':
			expiresAt = Date.now() + (calcAfter() ?? 0);
			break;
		case 'indefinitely':
			expiresAt = null;
			break;
	}
	emit('done', expiresAt);
	modal.value?.close();
};

const cancel = () => {
	modal.value?.close();
};
</script>

<style lang="scss" module>
.root {
	position: relative;
	margin: auto;
	padding: 32px;
	min-width: 320px;
	max-width: 480px;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	border-radius: 16px;

	> header {
		font-weight: bold;
		font-size: 1.1em;
		margin-bottom: 16px;
	}

	> section {
		margin-bottom: 16px;
		> div {
			display: flex;
			flex-direction: column;
			gap: 12px;

			> section {
				display: flex;
				gap: 8px;
				align-items: flex-end;

				> .input {
					flex: 1 1 auto;
				}
			}
		}
	}

	.buttons {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
}
</style>
