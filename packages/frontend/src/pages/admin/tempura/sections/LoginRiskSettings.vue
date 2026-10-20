<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-shield-search"></i></template>
	<template #label>{{ i18n.ts._loginRisk.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.enableLoginRiskDetection" #suffix>{{ i18n.ts.enabled }}</template>
	<template v-else #suffix>{{ i18n.ts.disabled }}</template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<div style="font-size: 0.9em; opacity: 0.8;">{{ i18n.ts._loginRisk.description }}</div>

		<MkSwitch v-model="form.state.enableLoginRiskDetection">
			<template #label>{{ i18n.ts._loginRisk.enable }}</template>
		</MkSwitch>

		<MkInput v-model="form.state.loginRiskNotifyThreshold" type="number" :min="1" :max="1000">
			<template #label>{{ i18n.ts._loginRisk.notifyThreshold }}</template>
		</MkInput>

		<MkInput v-model="form.state.loginRiskStepUpThreshold" type="number" :min="1" :max="1000">
			<template #label>{{ i18n.ts._loginRisk.stepUpThreshold }}</template>
		</MkInput>

		<MkSwitch v-model="form.state.loginRiskFlagUnverifiedUsers">
			<template #label>{{ i18n.ts._loginRisk.flagUnverifiedUsers }}</template>
			<template #caption>{{ i18n.ts._loginRisk.flagUnverifiedUsersDescription }}</template>
		</MkSwitch>

		<MkSwitch v-model="form.state.loginRiskShowDetailsToUser">
			<template #label>{{ i18n.ts._loginRisk.showDetailsToUser }}</template>
			<template #caption>{{ i18n.ts._loginRisk.showDetailsToUserDescription }}</template>
		</MkSwitch>

		<MkFolder>
			<template #icon><i class="ti ti-stethoscope"></i></template>
			<template #label>{{ i18n.ts._loginRisk.diagnose }}</template>

			<div class="_gaps_m">
				<MkButton inline :disabled="diagnoseFetching" @click="fetchDiagnose"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>

				<MkInfo v-if="diagnoseError != null" warn>{{ i18n.ts.somethingHappened }}: {{ diagnoseError }}</MkInfo>

				<MkLoading v-if="diagnoseFetching && diagnose == null"/>
				<template v-else-if="diagnose != null">
					<MkInfo v-if="diagnose.verdict === 'privateIp'" warn>{{ i18n.ts._loginRisk.privateIpWarning }}</MkInfo>

					<div class="_gaps_s">
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts._loginRisk.ipAddress }}</template>
							<template #value><span class="_monospace">{{ diagnose.ip }}</span></template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>X-Forwarded-For</template>
							<template #value><span class="_monospace">{{ diagnose.xForwardedFor ?? i18n.ts.none }}</span></template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>CF-Connecting-IP</template>
							<template #value>{{ diagnose.hasCfConnectingIp ? i18n.ts.yes : i18n.ts.no }}</template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>CF-IPCountry</template>
							<template #value>{{ diagnose.hasCfIpCountry ? i18n.ts.yes : i18n.ts.no }}</template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts._loginRisk.country }}</template>
							<template #value>{{ diagnose.intel.country ?? i18n.ts.unknown }}</template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts._loginRisk.asn }}</template>
							<template #value>{{ diagnose.intel.asn != null ? `AS${diagnose.intel.asn}` : i18n.ts.unknown }}{{ diagnose.intel.asnOrg ? ` (${diagnose.intel.asnOrg})` : '' }}</template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts._loginRisk.reputation }}</template>
							<template #value>{{ matchedLists.length > 0 ? matchedLists.join(', ') : i18n.ts.none }}</template>
						</MkKeyValue>
					</div>

					<div class="_gaps_s">
						<div><b>{{ i18n.ts._loginRisk.sources }}</b></div>
						<MkKeyValue v-for="source in diagnose.sources" :key="source.name">
							<template #key><span class="_monospace">{{ source.name }}</span></template>
							<template #value>
								<span v-if="source.loaded"><i class="ti ti-check" style="color: var(--MI_THEME-success);"></i> {{ i18n.ts._loginRisk.loaded }}</span>
								<span v-else><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> {{ i18n.ts._loginRisk.notLoaded }}</span>
								<span v-if="source.version != null"> / {{ i18n.ts.version }}: {{ source.version }}</span>
								<span v-if="source.entries != null"> / {{ i18n.ts._loginRisk.entries }}: {{ source.entries.toLocaleString() }}</span>
								<span v-if="source.updatedAt != null"> / {{ i18n.ts.updatedAt }}: <MkTime :time="source.updatedAt" mode="detail"/></span>
							</template>
						</MkKeyValue>
					</div>
				</template>
			</div>
		</MkFolder>

		<div style="font-size: 85%; opacity: 0.7;">{{ i18n.ts._loginRisk.spamhausCredit }}</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkTime from '@/components/global/MkTime.vue';
import * as os from '@/os.js';
import { useForm } from '@/composables/use-form.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	enableLoginRiskDetection: props.meta.enableLoginRiskDetection,
	loginRiskNotifyThreshold: props.meta.loginRiskNotifyThreshold,
	loginRiskStepUpThreshold: props.meta.loginRiskStepUpThreshold,
	loginRiskFlagUnverifiedUsers: props.meta.loginRiskFlagUnverifiedUsers,
	loginRiskShowDetailsToUser: props.meta.loginRiskShowDetailsToUser,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableLoginRiskDetection: state.enableLoginRiskDetection,
		loginRiskNotifyThreshold: state.loginRiskNotifyThreshold,
		loginRiskStepUpThreshold: state.loginRiskStepUpThreshold,
		loginRiskFlagUnverifiedUsers: state.loginRiskFlagUnverifiedUsers,
		loginRiskShowDetailsToUser: state.loginRiskShowDetailsToUser,
	}, undefined, {
		'0b4b9a0e-6f0d-4c8e-9d3a-5f2f7a1c8e41': {
			text: i18n.ts._loginRisk.invalidThresholds,
		},
	});
	fetchInstance(true);
});

const diagnose = ref<Misskey.entities.AdminLoginRiskDiagnoseResponse | null>(null);
const diagnoseFetching = ref(false);
const diagnoseError = ref<string | null>(null);

const matchedLists = computed(() => {
	const intel = diagnose.value?.intel;
	if (intel == null) return [];
	return (['tor', 'spamhausDrop', 'datacenter', 'vpn'] as const).filter(k => intel[k]);
});

async function fetchDiagnose() {
	diagnoseFetching.value = true;
	try {
		diagnose.value = await misskeyApi('admin/login-risk/diagnose', {});
		diagnoseError.value = null;
	} catch (err) {
		diagnoseError.value = (err as { message?: string } | null)?.message ?? String(err);
	} finally {
		diagnoseFetching.value = false;
	}
}

fetchDiagnose();
</script>
