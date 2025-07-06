<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.label"><i class="ti ti-server-2"></i> {{ i18n.ts._deliveryTargetControl.deliveryTargetControl }}</div>

	<div :class="$style.body">
		<MkRadios v-model="deliveryMode" direction="vertical">
			<option value="include">{{ i18n.ts._deliveryTargetControl.deliveryTargetInclude }}</option>
			<option value="exclude">{{ i18n.ts._deliveryTargetControl.deliveryTargetExclude }}</option>
		</MkRadios>

		<div :class="$style.serverSelection">
			<MkLoading v-if="serversLoading"/>
			<div v-else-if="loadError" :class="$style.errorMessage">
				<i class="ti ti-alert-circle"></i>
				<span>{{ i18n.ts._deliveryTargetControl.loadError }}</span>
				<button class="_button" :class="$style.retryButton" @click="loadServers">
					<i class="ti ti-refresh"></i>
					{{ i18n.ts.retry }}
				</button>
			</div>
			<div v-else-if="servers.length === 0" :class="$style.noServers">
				<i class="ti ti-info-circle"></i>
				{{ i18n.ts._deliveryTargetControl.noFollowersFromRemoteServers }}
			</div>
			<div v-else :class="$style.servers">
				<label v-for="server in servers" :key="server.host" :class="$style.server">
					<input
						v-model="selectedHosts"
						:value="server.host"
						type="checkbox"
						:class="$style.checkbox"
					>
					<div :class="$style.serverInfo">
						<div :class="$style.serverHost">{{ server.host }}</div>
						<div :class="$style.serverCount">
							{{ i18n.tsx._deliveryTargetControl.followersCount({ count: server.followersCount }) }}
						</div>
					</div>
				</label>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import MkRadios from '@/components/MkRadios.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

export type DeliveryTargetEditorModelValue = {
	mode: 'include' | 'exclude';
	hosts: string[];
};

const props = withDefaults(defineProps<{
	modelValue: DeliveryTargetEditorModelValue;
}>(), {
	modelValue: () => ({ mode: 'include', hosts: [] }),
});

const emit = defineEmits<{
	(ev: 'update:modelValue', value: DeliveryTargetEditorModelValue): void;
	(ev: 'destroyed'): void;
}>();

const deliveryMode = ref<'include' | 'exclude'>(props.modelValue.mode);
const selectedHosts = ref<string[]>([...props.modelValue.hosts]);
const servers = ref<{ host: string; followersCount: number }[]>([]);
const serversLoading = ref(true);
const loadError = ref(false);

// Watch for props changes
watch(() => props.modelValue, (newValue) => {
	deliveryMode.value = newValue.mode;
	selectedHosts.value = [...newValue.hosts];
}, { deep: true });

// Clear selected hosts when switching to 'include' mode
watch(deliveryMode, (newMode) => {
	if (newMode === 'include') {
		selectedHosts.value = [];
	}
});

// Watch for internal changes and emit
watch([deliveryMode, selectedHosts], () => {
	emit('update:modelValue', {
		mode: deliveryMode.value,
		hosts: selectedHosts.value,
	});
}, { deep: true });

const loadServers = async () => {
	serversLoading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('i/followers-servers', {}) as { servers: { host: string; followersCount: number }[] };
		servers.value = result.servers;
	} catch (err) {
		console.error('Failed to load follower servers:', err);
		loadError.value = true;
	} finally {
		serversLoading.value = false;
	}
};

onMounted(() => {
	loadServers();
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 8px 24px;
}

.label {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;
	color: var(--MI_THEME-accent);
	display: flex;
	align-items: center;
	gap: 4px;
}

.body {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.serverSelection {
	padding: 8px 0;
}

.noServers {
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
	padding: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	font-size: 0.9em;
}

.servers {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 180px;
	overflow-y: auto;
	padding: 4px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-bg);
}

.server {
	display: flex;
	align-items: center;
	padding: 8px 12px;
	border-radius: 4px;
	cursor: pointer;
	transition: background-color 0.2s;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.checkbox {
	margin-right: 12px;
	accent-color: var(--MI_THEME-accent);
}

.serverInfo {
	flex: 1;
	min-width: 0;
}

.serverHost {
	font-weight: 500;
	color: var(--MI_THEME-fg);
	word-break: break-all;
	line-height: 1.3;
}

.serverCount {
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
	margin-top: 2px;
	line-height: 1.2;
}

.errorMessage {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 16px;
	color: var(--MI_THEME-error);
	font-size: 0.9em;
	text-align: center;
}

.retryButton {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 6px 12px;
	border-radius: 4px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fg);
	font-size: 0.85em;
	transition: background-color 0.2s;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}
</style>
