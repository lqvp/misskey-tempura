<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/security" :label="i18n.ts.security" :keywords="['security']" icon="ti ti-lock" :inlining="['botProtection']">
			<div class="_gaps_m">
				<XBotProtection/>

				<SearchMarker v-slot="slotProps" :keywords="['sensitive', 'media', 'detection']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.sensitiveMediaDetection }}</SearchLabel></template>
						<template v-if="sensitiveMediaDetectionForm.savedState.sensitiveMediaDetection === 'all'" #suffix>{{ i18n.ts.all }}</template>
						<template v-else-if="sensitiveMediaDetectionForm.savedState.sensitiveMediaDetection === 'local'" #suffix>{{ i18n.ts.localOnly }}</template>
						<template v-else-if="sensitiveMediaDetectionForm.savedState.sensitiveMediaDetection === 'remote'" #suffix>{{ i18n.ts.remoteOnly }}</template>
						<template v-else #suffix>{{ i18n.ts.none }}</template>
						<template v-if="sensitiveMediaDetectionForm.modified.value" #footer>
							<MkFormFooter :form="sensitiveMediaDetectionForm"/>
						</template>

						<div class="_gaps_m">
							<div><SearchText>{{ i18n.ts._sensitiveMediaDetection.description }}</SearchText></div>

							<MkInfo warn><SearchText>{{ i18n.ts._sensitiveMediaDetection.externalServiceInfo }}</SearchText></MkInfo>

							<MkRadios
								v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetection"
								:options="[
									{ value: 'none', label: i18n.ts.none },
									{ value: 'all', label: i18n.ts.all },
									{ value: 'local', label: i18n.ts.localOnly },
									{ value: 'remote', label: i18n.ts.remoteOnly },
								]"
							>
							</MkRadios>

							<SearchMarker :keywords="['api', 'url', 'endpoint', 'sensitive']">
								<MkInput v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionApiUrl" type="url">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.apiUrl }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.apiUrlDescription }}</SearchText></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['api', 'key', 'token', 'sensitive']">
								<MkInput v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionApiKey" type="password" autocomplete="new-password">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.apiKey }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.apiKeyDescription }}</SearchText></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['timeout', 'sensitive']">
								<MkInput v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionTimeout" type="number" :min="1">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.timeout }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.timeoutDescription }}</SearchText></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['max', 'images', 'chunk', 'sensitive']">
								<MkInput v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionMaxImagesPerRequest" type="number" :min="1">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.maxImagesPerRequest }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.maxImagesPerRequestDescription }}</SearchText></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['sensitivity']">
								<MkRange v-model="sensitiveMediaDetectionForm.state.sensitiveMediaDetectionSensitivity" :min="0" :max="4" :step="1" :textConverter="(v) => `${v + 1}`">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.sensitivity }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.sensitivityDescription }}</SearchText></template>
								</MkRange>
							</SearchMarker>

							<SearchMarker :keywords="['video', 'analyze']">
								<MkSwitch v-model="sensitiveMediaDetectionForm.state.enableSensitiveMediaDetectionForVideos">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.analyzeVideos }}</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.analyzeVideosDescription }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker :keywords="['flag', 'automatically']">
								<MkSwitch v-model="sensitiveMediaDetectionForm.state.setSensitiveFlagAutomatically">
									<template #label><SearchLabel>{{ i18n.ts._sensitiveMediaDetection.setSensitiveFlagAutomatically }}</SearchLabel> ({{ i18n.ts.notRecommended }})</template>
									<template #caption><SearchText>{{ i18n.ts._sensitiveMediaDetection.setSensitiveFlagAutomaticallyDescription }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>

							<!-- 現状 false positive が多すぎて実用に耐えない
					<MkSwitch v-model="disallowUploadWhenPredictedAsPorn">
						<template #label>{{ i18n.ts._sensitiveMediaDetection.disallowUploadWhenPredictedAsPorn }}</template>
					</MkSwitch>
					-->
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['email', 'validation']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Active Email Validation</SearchLabel></template>
						<template v-if="emailValidationForm.savedState.enableActiveEmailValidation" #suffix>Enabled</template>
						<template v-else #suffix>Disabled</template>
						<template v-if="emailValidationForm.modified.value" #footer>
							<MkFormFooter :form="emailValidationForm"/>
						</template>

						<div class="_gaps_m">
							<div><SearchText>{{ i18n.ts.activeEmailValidationDescription }}</SearchText></div>

							<SearchMarker>
								<MkSwitch v-model="emailValidationForm.state.enableActiveEmailValidation">
									<template #label><SearchLabel>Enable</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="emailValidationForm.state.enableVerifymailApi">
									<template #label><SearchLabel>Use Verifymail.io API</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emailValidationForm.state.verifymailAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Verifymail.io API Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="emailValidationForm.state.enableTruemailApi">
									<template #label><SearchLabel>Use TrueMail API</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emailValidationForm.state.truemailInstance">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>TrueMail API Instance</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emailValidationForm.state.truemailAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>TrueMail API Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['banned', 'email', 'domains', 'blacklist']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Email Domain Settings<span class="_beta">{{ i18n.ts.originalFeature }}</span></SearchLabel></template>
						<template v-if="emailSettingsForm.savedState.emailWhitelist" #suffix>Enabled</template>
				<template v-else #suffix>Disabled</template>
				<template v-if="emailSettingsForm.modified.value" #footer>
							<MkFormFooter :form="emailSettingsForm"/>
						</template>

						<div class="_gaps_m">
					<MkSwitch v-model="emailSettingsForm.state.emailWhitelist">
						<template #label>Enable Whitelist Mode</template>
					</MkSwitch>

							<SearchMarker>
								<MkTextarea v-model="emailSettingsForm.state.bannedEmailDomains">
									<template #label><SearchLabel>
							<span v-if="emailSettingsForm.state.emailWhitelist">Whitelist Email Domains List</span>
							<span v-else>Banned Email Domains List</span>
						</SearchLabel></template>
								</MkTextarea>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['log', 'ipAddress']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Log IP address</SearchLabel></template>
						<template v-if="ipLoggingForm.savedState.enableIpLogging" #suffix>Enabled</template>
						<template v-else #suffix>Disabled</template>
						<template v-if="ipLoggingForm.modified.value" #footer>
							<MkFormFooter :form="ipLoggingForm"/>
						</template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="ipLoggingForm.state.enableIpLogging">
									<template #label><SearchLabel>Enable</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['login', 'risk', 'suspicious', 'signin']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #icon><SearchIcon><i class="ti ti-shield-search"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts._loginRisk.title }}</SearchLabel></template>
						<template v-if="loginRiskForm.savedState.enableLoginRiskDetection" #suffix>{{ i18n.ts.enabled }}</template>
						<template v-else #suffix>{{ i18n.ts.disabled }}</template>
						<template v-if="loginRiskForm.modified.value" #footer>
							<MkFormFooter :form="loginRiskForm"/>
						</template>

						<div class="_gaps_m">
							<div><SearchText>{{ i18n.ts._loginRisk.description }}</SearchText></div>

							<SearchMarker>
								<MkSwitch v-model="loginRiskForm.state.enableLoginRiskDetection">
									<template #label><SearchLabel>{{ i18n.ts._loginRisk.enable }}</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker :keywords="['notify', 'threshold']">
								<MkInput v-model="loginRiskForm.state.loginRiskNotifyThreshold" type="number" :min="1" :max="1000">
									<template #label><SearchLabel>{{ i18n.ts._loginRisk.notifyThreshold }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['stepUp', 'threshold', 'email', 'code']">
								<MkInput v-model="loginRiskForm.state.loginRiskStepUpThreshold" type="number" :min="1" :max="1000">
									<template #label><SearchLabel>{{ i18n.ts._loginRisk.stepUpThreshold }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker :keywords="['flag', 'unverified']">
								<MkSwitch v-model="loginRiskForm.state.loginRiskFlagUnverifiedUsers">
									<template #label><SearchLabel>{{ i18n.ts._loginRisk.flagUnverifiedUsers }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._loginRisk.flagUnverifiedUsersDescription }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker :keywords="['footprint', 'history', 'user']">
								<MkSwitch v-model="loginRiskForm.state.loginRiskShowDetailsToUser">
									<template #label><SearchLabel>{{ i18n.ts._loginRisk.showDetailsToUser }}</SearchLabel></template>
									<template #caption><SearchText>{{ i18n.ts._loginRisk.showDetailsToUserDescription }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker :keywords="['diagnose', 'ipAddress', 'proxy']">
								<MkFolder>
									<template #icon><i class="ti ti-stethoscope"></i></template>
									<template #label><SearchLabel>{{ i18n.ts._loginRisk.diagnose }}</SearchLabel></template>

									<div class="_gaps_m">
										<MkButton inline :disabled="loginRiskDiagnoseFetching" @click="fetchLoginRiskDiagnose"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>

										<MkInfo v-if="loginRiskDiagnoseError != null" warn>{{ i18n.ts.somethingHappened }}: {{ loginRiskDiagnoseError }}</MkInfo>

										<MkLoading v-if="loginRiskDiagnoseFetching && loginRiskDiagnose == null"/>
										<template v-else-if="loginRiskDiagnose != null">
											<MkInfo v-if="loginRiskDiagnose.verdict === 'privateIp'" warn>{{ i18n.ts._loginRisk.privateIpWarning }}</MkInfo>

											<div class="_gaps_s">
												<MkKeyValue oneline>
													<template #key>{{ i18n.ts._loginRisk.ipAddress }}</template>
													<template #value><span class="_monospace">{{ loginRiskDiagnose.ip }}</span></template>
												</MkKeyValue>
												<MkKeyValue oneline>
													<template #key>X-Forwarded-For</template>
													<template #value><span class="_monospace">{{ loginRiskDiagnose.xForwardedFor ?? i18n.ts.none }}</span></template>
												</MkKeyValue>
												<MkKeyValue oneline>
													<template #key>CF-Connecting-IP</template>
													<template #value>{{ loginRiskDiagnose.hasCfConnectingIp ? i18n.ts.yes : i18n.ts.no }}</template>
												</MkKeyValue>
												<MkKeyValue oneline>
													<template #key>CF-IPCountry</template>
													<template #value>{{ loginRiskDiagnose.hasCfIpCountry ? i18n.ts.yes : i18n.ts.no }}</template>
												</MkKeyValue>
												<MkKeyValue oneline>
													<template #key>{{ i18n.ts._loginRisk.country }}</template>
													<template #value>{{ loginRiskDiagnose.intel.country ?? i18n.ts.unknown }}</template>
												</MkKeyValue>
												<MkKeyValue oneline>
													<template #key>{{ i18n.ts._loginRisk.asn }}</template>
													<template #value>{{ loginRiskDiagnose.intel.asn != null ? `AS${loginRiskDiagnose.intel.asn}` : i18n.ts.unknown }}{{ loginRiskDiagnose.intel.asnOrg ? ` (${loginRiskDiagnose.intel.asnOrg})` : '' }}</template>
												</MkKeyValue>
												<MkKeyValue oneline>
													<template #key>{{ i18n.ts._loginRisk.reputation }}</template>
													<template #value>{{ loginRiskDiagnoseMatchedLists.length > 0 ? loginRiskDiagnoseMatchedLists.join(', ') : i18n.ts.none }}</template>
												</MkKeyValue>
											</div>

											<div class="_gaps_s">
												<div><b>{{ i18n.ts._loginRisk.sources }}</b></div>
												<MkKeyValue v-for="source in loginRiskDiagnose.sources" :key="source.name">
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
							</SearchMarker>

							<div style="font-size: 85%; opacity: 0.7;"><SearchText>{{ i18n.ts._loginRisk.spamhausCredit }}</SearchText></div>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import XBotProtection from './bot-protection.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRange from '@/components/MkRange.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';

const meta = await misskeyApi('admin/meta');

const sensitiveMediaDetectionForm = useForm({
	sensitiveMediaDetection: meta.sensitiveMediaDetection,
	sensitiveMediaDetectionSensitivity: meta.sensitiveMediaDetectionSensitivity === 'veryLow' ? 0 :
	meta.sensitiveMediaDetectionSensitivity === 'low' ? 1 :
	meta.sensitiveMediaDetectionSensitivity === 'medium' ? 2 :
	meta.sensitiveMediaDetectionSensitivity === 'high' ? 3 :
	meta.sensitiveMediaDetectionSensitivity === 'veryHigh' ? 4 : 0,
	setSensitiveFlagAutomatically: meta.setSensitiveFlagAutomatically,
	enableSensitiveMediaDetectionForVideos: meta.enableSensitiveMediaDetectionForVideos,
	sensitiveMediaDetectionApiUrl: meta.sensitiveMediaDetectionApiUrl,
	sensitiveMediaDetectionApiKey: meta.sensitiveMediaDetectionApiKey,
	sensitiveMediaDetectionTimeout: meta.sensitiveMediaDetectionTimeout,
	sensitiveMediaDetectionMaxImagesPerRequest: meta.sensitiveMediaDetectionMaxImagesPerRequest,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		sensitiveMediaDetection: state.sensitiveMediaDetection,
		sensitiveMediaDetectionSensitivity:
			state.sensitiveMediaDetectionSensitivity === 0 ? 'veryLow' :
			state.sensitiveMediaDetectionSensitivity === 1 ? 'low' :
			state.sensitiveMediaDetectionSensitivity === 2 ? 'medium' :
			state.sensitiveMediaDetectionSensitivity === 3 ? 'high' :
			state.sensitiveMediaDetectionSensitivity === 4 ? 'veryHigh' :
			null as never,
		setSensitiveFlagAutomatically: state.setSensitiveFlagAutomatically,
		enableSensitiveMediaDetectionForVideos: state.enableSensitiveMediaDetectionForVideos,
		sensitiveMediaDetectionApiUrl: state.sensitiveMediaDetectionApiUrl,
		sensitiveMediaDetectionApiKey: state.sensitiveMediaDetectionApiKey,
		sensitiveMediaDetectionTimeout: state.sensitiveMediaDetectionTimeout,
		sensitiveMediaDetectionMaxImagesPerRequest: state.sensitiveMediaDetectionMaxImagesPerRequest,
	});
	fetchInstance(true);
});

const ipLoggingForm = useForm({
	enableIpLogging: meta.enableIpLogging,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableIpLogging: state.enableIpLogging,
	});
	fetchInstance(true);
});

const loginRiskForm = useForm({
	enableLoginRiskDetection: meta.enableLoginRiskDetection,
	loginRiskNotifyThreshold: meta.loginRiskNotifyThreshold,
	loginRiskStepUpThreshold: meta.loginRiskStepUpThreshold,
	loginRiskFlagUnverifiedUsers: meta.loginRiskFlagUnverifiedUsers,
	loginRiskShowDetailsToUser: meta.loginRiskShowDetailsToUser,
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

const loginRiskDiagnose = ref<Misskey.entities.AdminLoginRiskDiagnoseResponse | null>(null);
const loginRiskDiagnoseFetching = ref(false);
const loginRiskDiagnoseError = ref<string | null>(null);

const loginRiskDiagnoseMatchedLists = computed(() => {
	const intel = loginRiskDiagnose.value?.intel;
	if (intel == null) return [];
	return (['tor', 'spamhausDrop', 'datacenter', 'vpn'] as const).filter(k => intel[k]);
});

async function fetchLoginRiskDiagnose() {
	loginRiskDiagnoseFetching.value = true;
	try {
		loginRiskDiagnose.value = await misskeyApi('admin/login-risk/diagnose', {});
		loginRiskDiagnoseError.value = null;
	} catch (err) {
		// ページを開くたびにダイアログを出さないよう、エラーはインラインで表示する
		loginRiskDiagnoseError.value = (err as { message?: string } | null)?.message ?? String(err);
	} finally {
		loginRiskDiagnoseFetching.value = false;
	}
}

fetchLoginRiskDiagnose();

const emailSettingsForm = useForm({
	emailWhitelist: meta.emailWhitelist,
	bannedEmailDomains: meta.bannedEmailDomains?.join('\n') || '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		emailWhitelist: state.emailWhitelist,
		bannedEmailDomains: state.bannedEmailDomains.split('\n'),
	});
	fetchInstance(true);
});

const emailValidationForm = useForm({
	enableActiveEmailValidation: meta.enableActiveEmailValidation,
	enableVerifymailApi: meta.enableVerifymailApi,
	verifymailAuthKey: meta.verifymailAuthKey,
	enableTruemailApi: meta.enableTruemailApi,
	truemailInstance: meta.truemailInstance,
	truemailAuthKey: meta.truemailAuthKey,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableActiveEmailValidation: state.enableActiveEmailValidation,
		enableVerifymailApi: state.enableVerifymailApi,
		verifymailAuthKey: state.verifymailAuthKey,
		enableTruemailApi: state.enableTruemailApi,
		truemailInstance: state.truemailInstance,
		truemailAuthKey: state.truemailAuthKey,
	});
	fetchInstance(true);
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.security,
	icon: 'ti ti-lock',
}));
</script>
