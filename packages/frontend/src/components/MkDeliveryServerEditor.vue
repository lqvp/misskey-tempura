<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.padding]: true }]">
	<div :class="[$style.label, { [$style.withAccent]: !showDetail }]" @click="showDetail = !showDetail">
		<i class="ti" :class="showDetail ? 'ti-chevron-up' : 'ti-chevron-down'"></i>
		{{ summaryText }}
	</div>
	<section v-if="showDetail">
		<div>
			<MkLoading v-if="fetching" mini/>
			<template v-else>
				<div v-for="server in servers" :key="server" :class="$style.server">
					<label :class="$style.checkbox">
						<input type="checkbox" :checked="isSelected(server)" @change="toggleServer(server)">
						<span :class="$style.serverName">{{ server }}</span>
					</label>
				</div>
				<div v-if="servers.length === 0" :class="$style.empty">{{ i18n.ts.noServers }}</div>
			</template>
		</div>
	</section>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	modelValue: string[] | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', value: string[] | null): void;
	(ev: 'destroyed'): void;
}>();

const fetching = ref(true);
const servers = ref<string[]>([]);
const selectedServers = ref<string[]>(props.modelValue ?? []);
const showDetail = ref(!prefer.s.defaultScheduledNoteDelete);

const summaryText = computed(() => {
	if (showDetail.value) {
		return i18n.ts.selectDeliveryServers;
	}
	return selectedServers.value.length > 0
		? `${i18n.ts.selectDeliveryServers} (${selectedServers.value.length})`
		: i18n.ts.selectDeliveryServers;
});

// サーバーリストを取得する
async function fetchDeliveryServers() {
	try {
		fetching.value = true;
		const result = await misskeyApi('i/followers-servers');
		servers.value = Array.isArray(result) ? result : [];
	} catch (e) {
		console.error(e);
		servers.value = [];
	} finally {
		fetching.value = false;
	}
}

function isSelected(server: string): boolean {
	return selectedServers.value.includes(server);
}

function toggleServer(server: string) {
	if (isSelected(server)) {
		selectedServers.value = selectedServers.value.filter(s => s !== server);
	} else {
		selectedServers.value.push(server);
	}
	emit('update:modelValue', selectedServers.value.length > 0 ? selectedServers.value : null);
}

// 初期化
fetchDeliveryServers();
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 8px 0px;

	>span {
		opacity: 0.7;
	}

	>section {
		>div {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
	}
}

.padding {
	padding: 8px 24px;
}

.label {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;
	cursor: pointer;
}

.withAccent {
	color: var(--MI_THEME-accent);
}

.server {
	padding: 8px;
	border-bottom: solid 1px var(--MI_THEME-divider);

	&:last-child {
		border-bottom: none;
	}
}

.checkbox {
	display: flex;
	align-items: center;
	cursor: pointer;

	> input {
		margin-right: 8px;
	}
}

.serverName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.empty {
	text-align: center;
	padding: 16px;
	opacity: 0.7;
}
</style>
