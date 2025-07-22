<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="600"
	:height="500"
	:canClose="false"
	@close="cancel"
>
	<div :class="$style.root">
		<div :class="$style.header">
			<h3>{{ i18n.ts._deliveryTargetPreset[editMode ? 'editPreset' : 'createPreset'] }}</h3>
		</div>

		<div :class="$style.body">
			<div class="_gaps">
				<MkInput v-model="preset.name" :placeholder="i18n.ts._deliveryTargetPreset.presetName">
					<template #label>{{ i18n.ts._deliveryTargetPreset.presetName }}</template>
				</MkInput>

				<MkTextarea v-model="preset.description" :placeholder="i18n.ts._deliveryTargetPreset.presetDescription">
					<template #label>{{ i18n.ts._deliveryTargetPreset.presetDescription }}</template>
				</MkTextarea>

				<MkRadios v-model="preset.mode" direction="vertical">
					<template #label>{{ i18n.ts._deliveryTargetControl.deliveryTargetControl }}</template>
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
					<div v-else>
						<MkInput v-model="searchQuery" type="search" :placeholder="i18n.ts.search" :class="$style.searchInput">
							<template #prefix><i class="ti ti-search"></i></template>
						</MkInput>

						<div :class="$style.servers">
							<MkCheckbox
								v-for="server in filteredServers"
								:key="server.host"
								v-model="preset.hosts"
								:value="server.host"
								:class="$style.serverItem"
							>
								<div :class="$style.serverInfo">
									<div :class="$style.serverHost">{{ server.host }}</div>
									<div :class="$style.serverCount">
										{{ i18n.tsx._deliveryTargetControl.followersCount({ count: server.followersCount }) }}
									</div>
								</div>
							</MkCheckbox>
						</div>

						<div v-if="searchQuery && servers.length > 0" :class="$style.searchInfo">
							{{ i18n.tsx._deliveryTargetControl.searchResults({
								count: filteredServers.length,
								total: servers.length
							}) }}
						</div>
					</div>
				</div>

				<MkSwitch v-model="preset.isDefault">
					<template #label>{{ i18n.ts._deliveryTargetPreset.setAsDefault }}</template>
				</MkSwitch>
			</div>
		</div>

		<div :class="$style.footer">
			<div class="_buttons">
				<MkButton @click="cancel">{{ i18n.ts.cancel }}</MkButton>
				<MkButton primary :disabled="!isValid" @click="save">
					<i class="ti ti-check"></i> {{ i18n.ts.save }}
				</MkButton>
			</div>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkCheckbox from '@/components/MkCheckbox.vue';
import MkButton from '@/components/MkButton.vue';
import type { DeliveryTargetPreset } from '@/utility/delivery-target-preset.js';
import { createDeliveryTargetPreset, validateDeliveryTargetPreset } from '@/utility/delivery-target-preset.js';
import { deepClone } from '@/utility/clone.js';

const props = withDefaults(defineProps<{
	preset?: DeliveryTargetPreset | null;
}>(), {
	preset: null,
});

const emit = defineEmits<{
	(ev: 'ok', preset: DeliveryTargetPreset): void;
	(ev: 'cancel'): void;
	(ev: 'closed'): void;
}>();

const dialog = ref<InstanceType<typeof MkModalWindow>>();
const editMode = computed(() => props.preset != null);

const preset = ref<DeliveryTargetPreset>(deepClone(props.preset) ?? createDeliveryTargetPreset());

const servers = ref<{ host: string; followersCount: number }[]>([]);
const serversLoading = ref(true);
const loadError = ref(false);
const searchQuery = ref('');

const filteredServers = computed(() => {
	if (!searchQuery.value.trim()) {
		return servers.value;
	}

	const query = searchQuery.value.toLowerCase().trim();
	return servers.value.filter(server =>
		server.host.toLowerCase().includes(query),
	);
});

const validation = computed(() => validateDeliveryTargetPreset(preset.value));
const isValid = computed(() => validation.value.isValid);

const loadServers = async () => {
	serversLoading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi<{ servers: { host: string; followersCount: number }[] }>('i/followers-servers', {});
		servers.value = result.servers;
	} catch (err) {
		console.error('Failed to load follower servers:', err);
		loadError.value = true;
	} finally {
		serversLoading.value = false;
	}
};

async function save() {
	if (!isValid.value) {
		const errorMessages = validation.value.errors.map(error => i18n.ts._deliveryTargetPreset[error]).join('\n');
		os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: errorMessages,
		});
		return;
	}

	preset.value.updatedAt = Date.now();
	emit('ok', preset.value);
	dialog.value?.close();
}

function cancel() {
	emit('cancel');
	dialog.value?.close();
}

onMounted(() => {
	loadServers();
});
</script>

<style lang="scss" module>
.root {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.header {
	padding: 16px 24px;
	border-bottom: 1px solid var(--MI_THEME-divider);

	h3 {
		margin: 0;
		font-size: 1.1em;
		font-weight: 600;
	}
}

.body {
	flex: 1;
	padding: 16px 24px;
	overflow-y: auto;
}

.footer {
	padding: 16px 24px;
	border-top: 1px solid var(--MI_THEME-divider);
}

.serverSelection {
	padding: 8px 0;
}

.searchInput {
	margin-bottom: 8px;
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
	gap: 4px;
	max-height: 200px;
	overflow-y: auto;
	padding: 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-bg);
}

.serverItem {
	width: 100%;
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

.searchInfo {
	margin-top: 8px;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
	padding: 4px 8px;
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
