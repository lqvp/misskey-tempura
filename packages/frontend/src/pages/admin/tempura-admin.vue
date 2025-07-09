<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkSwitch v-model="approvalRequiredForSignup" @change="onChange_approvalRequiredForSignup">
					<template #label>{{ i18n.ts.approvalRequiredForSignup }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template #caption>{{ i18n.ts.registerApprovalEmailRecommended }}</template>
				</MkSwitch>

				<MkSwitch v-model="blockMentionsFromUnfamiliarRemoteUsers" @change="onChange_blockMentionsFromUnfamiliarRemoteUsers">
					<template #label>{{ i18n.ts.blockMentionsFromUnfamiliarRemoteUsers }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template #caption>{{ i18n.ts.blockMentionsFromUnfamiliarRemoteUsersDescription }} Cherry-picked from Misskey.io (https://github.com/MisskeyIO/misskey/commit/82cc3987c13db4ad0da1589386027c222ce85ff8)</template>
				</MkSwitch>

				<MkSwitch v-model="enableLongIconUrl" @change="onChange_enableLongIconUrl">
					<template #label>{{ i18n.ts._serverSettings.enableLongIconUrl }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template #caption>{{ i18n.ts._serverSettings.enableLongIconUrlDescription }}</template>
				</MkSwitch>

				<div class="_gaps">
					<MkInput v-model="longIconUrl">
						<template #label>
							<span>{{ i18n.ts._serverSettings.longIconUrl }}</span>
							<span class="_beta">{{ i18n.ts.originalFeature }}</span>
						</template>
					</MkInput>
					<MkButton v-if="longIconUrl" primary @click="save_longIconUrl">{{ i18n.ts.save }}</MkButton>
				</div>

				<div class="_gaps">
					<MkInput v-model="validateMinimumUsernameLength" type="number" @update:modelValue="onUsernameMinLengthChange">
						<template #label>
							<span>{{ i18n.ts.validateMinimumUsernameLength }}</span>
							<span v-if="validateMinimumUsernameLengthChanged" class="_modified">{{ i18n.ts.modified }}</span>
							<span class="_beta">{{ i18n.ts.originalFeature }}</span>
						</template>
						<template #caption>{{ i18n.ts.validateMinimumUsernameLengthDescription }}</template>
					</MkInput>
					<MkButton v-if="validateMinimumUsernameLengthChanged" primary @click="save_validateMinimumUsernameLength">{{ i18n.ts.save }}</MkButton>
				</div>

				<div class="_gaps">
					<MkTextarea v-model="customSplashText">
						<template #label>{{ i18n.ts.customSplashText }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						<template #caption>{{ i18n.ts.customSplashTextDescription }}</template>
					</MkTextarea>
					<MkButton primary @click="save_customSplashText">{{ i18n.ts.save }}</MkButton>
				</div>

				<MkFolder>
					<template #icon><i class="ti ti-mail"></i></template>
					<template #label>Email Domain Settings<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template v-if="emailSettingsForm.savedState.emailWhitelist" #suffix>Enabled</template>
					<template v-else #suffix>Disabled</template>
					<template v-if="emailSettingsForm.modified.value" #footer>
						<MkFormFooter :form="emailSettingsForm"/>
					</template>

					<div class="_gaps_m">
						<MkSwitch v-model="emailSettingsForm.state.emailWhitelist">
							<template #label>Enable Whitelist Mode</template>
						</MkSwitch>

						<MkTextarea v-model="emailSettingsForm.state.bannedEmailDomains">
							<template #label>
								<span v-if="emailSettingsForm.state.emailWhitelist">Whitelist Email Domains List</span>
								<span v-else>Banned Email Domains List</span>
							</template>
						</MkTextarea>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-flower"></i></template>
					<template #label>はなみすきー風LP<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template v-if="hanaSettingsForm.savedState.useHanaEntrance" #suffix>Enabled</template>
					<template v-else #suffix>Disabled</template>
					<template v-if="hanaSettingsForm.modified.value" #footer>
						<MkFormFooter :form="hanaSettingsForm"/>
					</template>

					<div class="_gaps_m">
						<MkSwitch v-model="hanaSettingsForm.state.useHanaEntrance">
							<template #label>{{ i18n.ts._hana.useHanaEntrance }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						</MkSwitch>

						<MkInput
							v-model="hanaSettingsForm.state.hanaThemeColor"
							type="text"
							pattern="^#([A-Fa-f0-9]{6})$"
							maxlength="7"
						>
							<template #label>
								<span>{{ i18n.ts._hana.hanaThemeColor }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts._hana.hanaThemeColorDescription }}</template>
						</MkInput>

						<MkInput
							v-model="hanaSettingsForm.state.hanaThemeAltColor"
							type="text"
							pattern="^#([A-Fa-f0-9]{6})$"
							maxlength="7"
						>
							<template #label>
								<span>{{ i18n.ts._hana.hanaThemeAltColor }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts._hana.hanaThemeAltColorDescription }}</template>
						</MkInput>

						<MkInput
							v-model="hanaSettingsForm.state.hanaThemeWeakOpacity"
							type="number"
							min="0"
							max="1"
							step="0.1"
						>
							<template #label>
								<span>{{ i18n.ts._hana.hanaThemeWeakOpacity }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts._hana.hanaThemeWeakOpacityDescription }}</template>
						</MkInput>

						<MkInput
							v-model="hanaSettingsForm.state.hanaModeIcon"
							type="url"
						>
							<template #label>
								<span>{{ i18n.ts._hana.hanaModeIcon }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts._hana.hanaModeIconDescription }}</template>
						</MkInput>

						<MkInput
							v-model="hanaSettingsForm.state.hanaModeIconSize"
							type="number"
							min="0"
						>
							<template #label>
								<span>{{ i18n.ts._hana.hanaModeIconSize }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts._hana.hanaModeIconSizeDescription }}</template>
						</MkInput>

						<MkInput
							v-model="hanaSettingsForm.state.hanaModeIconRadius"
							type="number"
							min="0"
							max="100"
						>
							<template #label>
								<span>{{ i18n.ts._hana.hanaModeIconRadius }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts._hana.hanaModeIconRadiusDescription }}</template>
						</MkInput>

						<MkInput
							v-model="hanaSettingsForm.state.hanaModeBackground"
							type="url"
						>
							<template #label>
								<span>{{ i18n.ts._hana.hanaModeBackground }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts._hana.hanaModeBackgroundDescription }}</template>
						</MkInput>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-door-enter"></i></template>
					<template #label>{{ i18n.ts._entrance. title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template v-if="entranceSettingsForm.modified.value" #footer>
						<MkFormFooter :form="entranceSettingsForm"/>
					</template>

					<div class="_gaps_m">
						<MkSwitch v-model="entranceSettingsForm.state.entranceShowTimeLine">
							<template #label>{{ i18n.ts._entrance.showTimeLine }}</template>
							<template #caption>{{ i18n.ts._entrance.showTimeLineDescription }}</template>
						</MkSwitch>

						<MkSwitch v-model="entranceSettingsForm.state.entranceShowFeatured">
							<template #label>{{ i18n.ts._entrance.showFeatured }}</template>
							<template #caption>{{ i18n.ts._entrance.showFeaturedDescription }}</template>
						</MkSwitch>

						<MkSwitch v-model="entranceSettingsForm.state.entranceShowEmojis">
							<template #label>{{ i18n.ts._entrance.showEmojis }}</template>
							<template #caption>{{ i18n.ts._entrance.showEmojisDescription }}</template>
						</MkSwitch>

						<MkTextarea v-model="entranceSettingsForm.state.entranceSelectEmojis">
							<template #label>{{ i18n.ts._entrance.selectEmojis }}</template>
							<template #caption>{{ i18n.ts._entrance.selectEmojisDescription }}</template>
						</MkTextarea>

						<MkSwitch v-model="entranceSettingsForm.state.entranceShowStats">
							<template #label>{{ i18n.ts._entrance.showStats }}</template>
							<template #caption>{{ i18n.ts._entrance. showStatsDescription }}</template>
						</MkSwitch>

						<MkSwitch v-model="entranceSettingsForm.state.entranceShowFederation">
							<template #label>{{ i18n.ts._entrance.showFederation }}</template>
							<template #caption>{{ i18n.ts._entrance.showFederationDescription }}</template>
						</MkSwitch>

						<MkSwitch v-model="entranceSettingsForm.state.entranceShowDashboard">
							<template #label>{{ i18n.ts._entrance.showDashboard }}</template>
							<template #caption>{{ i18n.ts._entrance.showDashboardDescription }}</template>
						</MkSwitch>

						<MkFolder v-if="entranceSettingsForm.state.entranceShowDashboard">
							<template #icon><i class="ti ti-home-2"></i></template>
							<template #label>{{ i18n.ts._entrance. title2 }}</template>

							<div class="_gaps_m">
								<MkSwitch v-model="entranceSettingsForm.state.entranceShowSignup">
									<template #label>{{ i18n.ts._entrance.showSignup }}</template>
									<template #caption>{{ i18n.ts._entrance.showSignupDescription }}</template>
								</MkSwitch>

								<MkSwitch v-model="entranceSettingsForm.state.entranceShowAnotherInstance">
									<template #label>{{ i18n.ts._entrance.showAnotherInstance }}</template>
									<template #caption>{{ i18n.ts._entrance.showAnotherInstanceDescription }}</template>
								</MkSwitch>

								<MkSwitch v-model="entranceSettingsForm.state.entranceShowSignin">
									<template #label>{{ i18n.ts._entrance.showSignin }}</template>
									<template #caption>{{ i18n.ts._entrance.showSigninDescription }}</template>
								</MkSwitch>
							</div>
						</MkFolder>

						<MkFolder>
							<template #icon><i class="ti ti-box-margin"></i></template>
							<template #label>{{ i18n.ts._entrance.marginSettings }}</template>

							<div class="_gaps_m">
								<MkInput v-model="entranceSettingsForm.state.entranceMarginLeft" type="number" :min="0">
									<template #label>{{ i18n.ts._entrance.marginLeft }}</template>
								</MkInput>

								<MkInput v-model="entranceSettingsForm.state.entranceMarginRight" type="number" :min="0">
									<template #label>{{ i18n.ts._entrance.marginRight }}</template>
								</MkInput>

								<MkInput v-model="entranceSettingsForm.state.entranceMarginTop" type="number" :min="0">
									<template #label>{{ i18n.ts._entrance.marginTop }}</template>
								</MkInput>

								<MkInput v-model="entranceSettingsForm.state.entranceMarginBottom" type="number" :min="0">
									<template #label>{{ i18n.ts._entrance.marginBottom }}</template>
								</MkInput>
							</div>
						</MkFolder>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-user-star"></i></template>
					<template #label>{{ i18n.ts._extraSettings.defaultFollowedUsers }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

					<div class="_gaps">
						<MkTextarea v-model="defaultFollowedUsers">
							<template #label>{{ i18n.ts._extraSettings.defaultFollowedUsers }}</template>
							<template #caption>{{ i18n.ts._extraSettings.defaultFollowedUsersDescription }}</template>
						</MkTextarea>
						<MkTextarea v-model="forciblyFollowedUsers">
							<template #label>{{ i18n.ts._extraSettings.forciblyFollowedUsers }}</template>
							<template #caption>{{ i18n.ts._extraSettings.forciblyFollowedUsersDescription }}</template>
						</MkTextarea>
						<MkButton primary @click="save_defaultUsers">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-photo"></i></template>
					<template #label>{{ i18n.ts.backgroundImageUrls }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<div class="_gaps">
						<MkButton @click="addBackgroundImage">
							{{ i18n.ts.add }}
						</MkButton>
						<div v-for="(url, i) in backgroundImageUrls" :key="i" class="_gaps_s">
							<MkInput v-model="backgroundImageUrls[i]">
								<template #label>{{ i18n.ts.backgroundImageUrl }} #{{ i + 1 }}</template>
							</MkInput>
							<MkButton danger @click="removeBackgroundImage(i)">
								<i class="ti ti-trash"></i>
								<span>{{ i18n.ts.remove }}</span>
							</MkButton>
						</div>
						<MkButton primary @click="save_backgroundImageUrl">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-pointer"></i></template>
					<template #label>{{ i18n.ts._customCursor.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

					<div class="_gaps_m">
						<div class="_gaps">
							<MkInput v-model="customCursorUrl">
								<template #label>
									<span>{{ i18n.ts._customCursor.defaultCursorImageURL }}</span>
								</template>
								<template #caption>{{ i18n.ts._customCursor.defaultCursorImageURLDescription }}</template>
							</MkInput>
						</div>

						<div class="_gaps">
							<MkInput v-model="customCursorPointerUrl">
								<template #label>
									<span>{{ i18n.ts._customCursor.pointerCursorImageURL }}</span>
								</template>
								<template #caption>{{ i18n.ts._customCursor.pointerCursorImageURLDescription }}</template>
							</MkInput>
						</div>

						<div class="_gaps">
							<MkInput v-model="customCursorTextUrl">
								<template #label>
									<span>{{ i18n.ts._customCursor.textCursorImageURL }}</span>
								</template>
								<template #caption>{{ i18n.ts._customCursor.textCursorImageURLDescription }}</template>
							</MkInput>
						</div>

						<div class="_gaps">
							<MkInput v-model="customCursorProgressUrl">
								<template #label>{{ i18n.ts._customCursor.progressCursorImageURL }}</template>
								<template #caption>{{ i18n.ts._customCursor.progressCursorImageURLDescription }}</template>
							</MkInput>
						</div>

						<div class="_gaps">
							<MkInput v-model="customCursorWaitUrl">
								<template #label>{{ i18n.ts._customCursor.waitCursorImageURL }}</template>
								<template #caption>{{ i18n.ts._customCursor.waitCursorImageURLDescription }}</template>
							</MkInput>
						</div>

						<MkButton primary @click="save_customCursorUrl">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-robot"></i></template>
					<template #label>{{ i18n.ts._llm.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template v-if="serverGeminiEnabled" #suffix>Enabled</template>
					<template v-else #suffix>Disabled</template>
					<template v-if="geminiSettingsForm.modified.value" #footer>
						<MkFormFooter :form="geminiSettingsForm"/>
					</template>

					<div class="_gaps">
						<MkSwitch v-model="geminiSettingsForm.state.serverGeminiEnabled">
							<template #label>{{ i18n.ts._llm._server.serverGeminiEnabled }}</template>
							<template #caption>{{ i18n.ts._llm._server.serverGeminiEnabledDescription }}</template>
						</MkSwitch>

						<MkInput v-model="geminiSettingsForm.state.serverGeminiApiKey" type="text">
							<template #label>{{ i18n.ts._llm._server.serverGeminiApiKey }}</template>
							<template #caption>{{ i18n.ts._llm._server.serverGeminiApiKeyDescription }}</template>
						</MkInput>

						<MkSelect v-model="geminiSettingsForm.state.serverGeminiModels">
							<template #label>{{ i18n.ts._llm.geminiModelLabel }}</template>
							<template #caption>{{ i18n.ts._llm._server.serverGeminiModelsDescription }}</template>
							<option v-for="model in geminiModels" :key="model" :value="model">
								{{ model }}
							</option>
						</MkSelect>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-mail"></i></template>
					<template #label>{{ i18n.ts._contactForm._settings.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
					<template v-if="contactFormSettingsForm.savedState.enableContactForm" #suffix>Enabled</template>
					<template v-else #suffix>Disabled</template>
					<template v-if="contactFormSettingsForm.modified.value" #footer>
						<MkFormFooter :form="contactFormSettingsForm"/>
					</template>

					<div class="_gaps_m">
						<MkSwitch v-model="contactFormSettingsForm.state.enableContactForm">
							<template #label>{{ i18n.ts._contactForm._settings.enable }}</template>
							<template #caption>{{ i18n.ts._contactForm._settings.enableDescription }}</template>
						</MkSwitch>

						<MkInput v-model="contactFormSettingsForm.state.contactFormLimit" type="number" :min="1" :max="10">
							<template #label>{{ i18n.ts._contactForm._settings.limit }}</template>
							<template #caption>{{ i18n.ts._contactForm._settings.limitDescription }}</template>
						</MkInput>

						<MkSwitch v-model="contactFormSettingsForm.state.contactFormRequireAuth">
							<template #label>{{ i18n.ts._contactForm._settings.requireAuth }}</template>
							<template #caption>{{ i18n.ts._contactForm._settings.requireAuthDescription }}</template>
						</MkSwitch>
					</div>
				</MkFolder>
			</div>
		</FormSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import FormLink from '@/components/form/link.vue';
import MkFolder from '@/components/MkFolder.vue';
import { useForm } from '@/composables/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';
import { geminiModels } from '@/utility/tempura-script/models.js';

const meta = await misskeyApi('admin/meta');

const approvalRequiredForSignup = ref<boolean>(false);
const blockMentionsFromUnfamiliarRemoteUsers = ref<boolean>(false);
const validateMinimumUsernameLength = ref<number>();
const useHanaEntrance = ref<boolean>(false);
const hanaThemeColor = ref<string>();
const hanaThemeAltColor = ref<string>();
const hanaThemeWeakOpacity = ref<number>();
const hanaModeIcon = ref<string>();
const hanaModeIconSize = ref<number>(128);
const hanaModeIconRadius = ref<number>(50);
const hanaModeBackground = ref<string>();
const defaultFollowedUsers = ref<string>('');
const forciblyFollowedUsers = ref<string>('');
const backgroundImageUrls = ref<string[]>([]);
const customSplashText = ref<string>('');
const enableLongIconUrl = ref<boolean>(false);
const longIconUrl = ref<string>();
const entranceShowTimeLine = ref<boolean>(false);
const entranceShowFeatured = ref<boolean>(false);
const entranceShowEmojis = ref<boolean>(false);
const entranceSelectEmojis = ref<string[]>([]);
const entranceShowStats = ref<boolean>(false);
const entranceShowFederation = ref<boolean>(false);
const entranceShowDashboard = ref<boolean>(false);
const entranceShowSignup = ref<boolean>(false);
const entranceShowAnotherInstance = ref<boolean>(false);
const entranceShowSignin = ref<boolean>(false);
const entranceMarginLeft = ref<number>();
const entranceMarginRight = ref<number>();
const entranceMarginTop = ref<number>();
const entranceMarginBottom = ref<number>();
const serverGeminiEnabled = ref<boolean>(false);
const serverGeminiApiKey = ref<string>('');
const serverGeminiModels = ref<string>('gemini-2.0-flash');
const customCursorUrl = ref<string | null>(null);
const customCursorPointerUrl = ref<string | null>(null);
const customCursorTextUrl = ref<string | null>(null);
const customCursorProgressUrl = ref<string | null>(null);
const customCursorWaitUrl = ref<string | null>(null);
const enableContactForm = ref<boolean>(true);
const contactFormLimit = ref<number>(3);
const contactFormRequireAuth = ref<boolean>(false);

const originalMinimumUsernameLength = ref<number>();
const validateMinimumUsernameLengthChanged = computed(() =>
	validateMinimumUsernameLength.value !== originalMinimumUsernameLength.value,
);

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

async function init() {
	approvalRequiredForSignup.value = meta.approvalRequiredForSignup;
	blockMentionsFromUnfamiliarRemoteUsers.value = meta.blockMentionsFromUnfamiliarRemoteUsers;
	validateMinimumUsernameLength.value = meta.validateMinimumUsernameLength;
	originalMinimumUsernameLength.value = meta.validateMinimumUsernameLength;
	useHanaEntrance.value = meta.useHanaEntrance;
	hanaThemeColor.value = meta.hanaThemeColor;
	hanaThemeAltColor.value = meta.hanaThemeAltColor;
	hanaModeIcon.value = meta.hanaModeIcon;
	hanaModeIconSize.value = meta.hanaModeIconSize;
	hanaModeIconRadius.value = meta.hanaModeIconRadius;
	hanaModeBackground.value = meta.hanaModeBackground;
	hanaThemeWeakOpacity.value = meta.hanaThemeWeakOpacity;
	defaultFollowedUsers.value = meta.defaultFollowedUsers.join('\n');
	forciblyFollowedUsers.value = meta.forciblyFollowedUsers.join('\n');
	backgroundImageUrls.value = meta.backgroundImageUrls;
	customSplashText.value = meta.customSplashText.join('\n');
	enableLongIconUrl.value = meta.enableLongIconUrl;
	longIconUrl.value = meta.longIconUrl;
	entranceShowTimeLine.value = meta.entranceShowTimeLine;
	entranceShowFeatured.value = meta.entranceShowFeatured;
	entranceShowEmojis.value = meta.entranceShowEmojis;
	entranceSelectEmojis.value = meta.entranceSelectEmojis;
	entranceShowStats.value = meta.entranceShowStats;
	entranceShowFederation.value = meta.entranceShowFederation;
	entranceShowDashboard.value = meta.entranceShowDashboard;
	entranceShowSignup.value = meta.entranceShowSignup;
	entranceShowAnotherInstance.value = meta.entranceShowAnotherInstance;
	entranceShowSignin.value = meta.entranceShowSignin;
	entranceMarginLeft.value = meta.entranceMarginLeft;
	entranceMarginRight.value = meta.entranceMarginRight;
	entranceMarginTop.value = meta.entranceMarginTop;
	entranceMarginBottom.value = meta.entranceMarginBottom;
	serverGeminiEnabled.value = meta.serverGeminiEnabled;
	serverGeminiApiKey.value = meta.serverGeminiApiKey;
	serverGeminiModels.value = meta.serverGeminiModels;
	customCursorUrl.value = meta.customCursorUrl;
	customCursorPointerUrl.value = meta.customCursorPointerUrl;
	customCursorTextUrl.value = meta.customCursorTextUrl;
	customCursorProgressUrl.value = meta.customCursorProgressUrl;
	customCursorWaitUrl.value = meta.customCursorWaitUrl;
	enableContactForm.value = meta.enableContactForm;
	contactFormLimit.value = meta.contactFormLimit;
	contactFormRequireAuth.value = meta.contactFormRequireAuth;
}

function addBackgroundImage() {
	backgroundImageUrls.value.push('');
}

function removeBackgroundImage(index: number) {
	backgroundImageUrls.value.splice(index, 1);
}

function save_backgroundImageUrl() {
	os.apiWithDialog('admin/update-meta', {
		backgroundImageUrls: backgroundImageUrls.value.filter(url => url !== ''),
	}).then(() => {
		fetchInstance(true);
	});
}

function onChange_approvalRequiredForSignup(value: boolean) {
	os.apiWithDialog('admin/update-meta', {
		approvalRequiredForSignup: value,
	}).then(() => {
		fetchInstance(true);
	});
}

function onChange_blockMentionsFromUnfamiliarRemoteUsers(value: boolean) {
	os.apiWithDialog('admin/update-meta', {
		blockMentionsFromUnfamiliarRemoteUsers: value,
	}).then(() => {
		fetchInstance(true);
	});
}

function onChange_enableLongIconUrl(value: boolean) {
	os.apiWithDialog('admin/update-meta', {
		enableLongIconUrl: value,
	}).then(() => {
		fetchInstance(true);
	});
}

const hanaSettingsForm = useForm({
	useHanaEntrance: meta.useHanaEntrance,
	hanaThemeColor: meta.hanaThemeColor || '#fd709a',
	hanaThemeAltColor: meta.hanaThemeAltColor || '#f77062',
	hanaThemeWeakOpacity: meta.hanaThemeWeakOpacity || 0.2,
	hanaModeIcon: meta.hanaModeIcon,
	hanaModeIconSize: meta.hanaModeIconSize || 128,
	hanaModeIconRadius: meta.hanaModeIconRadius ?? 50,
	hanaModeBackground: meta.hanaModeBackground,
}, async (state) => {
	const hexColorRegex = /^#([A-Fa-f0-9]{6})$/;
	if (!hexColorRegex.test(state.hanaThemeColor) || !hexColorRegex.test(state.hanaThemeAltColor)) {
		os.alert({
			type: 'error',
			text: 'カラーコードの形式が正しくありません (#000000 形式で入力してください)',
		});
		return;
	}

	if (state.hanaThemeWeakOpacity < 0 || state.hanaThemeWeakOpacity > 1) {
		os.alert({
			type: 'error',
			text: '透明度は0から1の間で指定してください',
		});
		return;
	}

	if (state.hanaModeIconSize < 0) {
		os.alert({
			type: 'error',
			text: 'アイコンサイズは0以上の値を指定してください',
		});
		return;
	}

	if (state.hanaModeIconRadius < 0 || state.hanaModeIconRadius > 100) {
		os.alert({
			type: 'error',
			text: '角丸の値は0から100の間で指定してください',
		});
		return;
	}

	await os.apiWithDialog('admin/update-meta', {
		useHanaEntrance: state.useHanaEntrance,
		hanaThemeColor: state.hanaThemeColor,
		hanaThemeAltColor: state.hanaThemeAltColor,
		hanaThemeWeakOpacity: state.hanaThemeWeakOpacity,
		hanaModeIcon: state.hanaModeIcon,
		hanaModeIconSize: state.hanaModeIconSize,
		hanaModeIconRadius: state.hanaModeIconRadius,
		hanaModeBackground: state.hanaModeBackground,
	});
	fetchInstance(true);
});

const entranceSettingsForm = useForm({
	entranceShowTimeLine: meta.entranceShowTimeLine,
	entranceShowFeatured: meta.entranceShowFeatured,
	entranceShowEmojis: meta.entranceShowEmojis,
	entranceSelectEmojis: meta.entranceSelectEmojis.join('\n'),
	entranceShowStats: meta.entranceShowStats,
	entranceShowFederation: meta.entranceShowFederation,
	entranceShowDashboard: meta.entranceShowDashboard,
	entranceShowSignup: meta.entranceShowSignup,
	entranceShowAnotherInstance: meta.entranceShowAnotherInstance,
	entranceShowSignin: meta.entranceShowSignin,
	entranceMarginLeft: Number(meta.entranceMarginLeft),
	entranceMarginRight: Number(meta.entranceMarginRight),
	entranceMarginTop: Number(meta.entranceMarginTop),
	entranceMarginBottom: Number(meta.entranceMarginBottom),
}, async (state) => {
	const emojis = state.entranceSelectEmojis.split('\n').filter(emoji => emoji.trim() !== '');
	if (emojis.length > 5) {
		os.alert({
			type: 'error',
			text: '表示する絵文字は最大5個までです。',
		});
		return;
	}

	const parsedMargins = {
		entranceMarginLeft: Number(state.entranceMarginLeft),
		entranceMarginRight: Number(state.entranceMarginRight),
		entranceMarginTop: Number(state.entranceMarginTop),
		entranceMarginBottom: Number(state.entranceMarginBottom),
	};

	if (Object.values(parsedMargins).some(isNaN)) {
		os.alert({
			type: 'error',
			text: 'マージン値は数値で入力してください',
		});
		return;
	}
	await os.apiWithDialog('admin/update-meta', {
		entranceShowTimeLine: state.entranceShowTimeLine,
		entranceShowFeatured: state.entranceShowFeatured,
		entranceShowEmojis: state.entranceShowEmojis,
		entranceSelectEmojis: state.entranceSelectEmojis.split('\n').slice(0, 5),
		entranceShowStats: state.entranceShowStats,
		entranceShowFederation: state.entranceShowFederation,
		entranceShowDashboard: state.entranceShowDashboard,
		entranceShowSignup: state.entranceShowSignup,
		entranceShowAnotherInstance: state.entranceShowAnotherInstance,
		entranceShowSignin: state.entranceShowSignin,
		entranceMarginLeft: state.entranceMarginLeft,
		entranceMarginRight: state.entranceMarginRight,
		entranceMarginTop: state.entranceMarginTop,
		entranceMarginBottom: state.entranceMarginBottom,
	});
	fetchInstance(true);
});

function onUsernameMinLengthChange(value: number) {
	validateMinimumUsernameLength.value = value;
}

function save_longIconUrl() {
	os.apiWithDialog('admin/update-meta', {
		longIconUrl: longIconUrl.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_validateMinimumUsernameLength() {
	os.apiWithDialog('admin/update-meta', {
		validateMinimumUsernameLength: validateMinimumUsernameLength.value,
	}).then(() => {
		fetchInstance(true);
		originalMinimumUsernameLength.value = validateMinimumUsernameLength.value;
	});
}

function save_defaultUsers() {
	os.apiWithDialog('admin/update-meta', {
		defaultFollowedUsers: defaultFollowedUsers.value.split('\n'),
		forciblyFollowedUsers: forciblyFollowedUsers.value.split('\n'),
	}, undefined, {
		'bcf088ec-fec5-42d0-8b9e-16d3b4797a4d': {
			text: i18n.ts._extraSettings.defaultFollowedUsersDuplicated,
		},
	}).then(() => {
		fetchInstance(true);
	});
}

function save_customSplashText() {
	os.apiWithDialog('admin/update-meta', {
		customSplashText: customSplashText.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_customCursorUrl() {
	os.apiWithDialog('admin/update-meta', {
		customCursorUrl: customCursorUrl.value,
		customCursorPointerUrl: customCursorPointerUrl.value,
		customCursorTextUrl: customCursorTextUrl.value,
		customCursorProgressUrl: customCursorProgressUrl.value,
		customCursorWaitUrl: customCursorWaitUrl.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const geminiSettingsForm = useForm({
	serverGeminiEnabled: meta.serverGeminiEnabled,
	serverGeminiApiKey: meta.serverGeminiApiKey ?? '',
	serverGeminiModels: meta.serverGeminiModels || 'gemini-2.0-flash',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		serverGeminiEnabled: state.serverGeminiEnabled,
		serverGeminiApiKey: state.serverGeminiApiKey,
		serverGeminiModels: state.serverGeminiModels,
	});
	fetchInstance(true);
});

const contactFormSettingsForm = useForm({
	enableContactForm: meta.enableContactForm,
	contactFormLimit: meta.contactFormLimit,
	contactFormRequireAuth: meta.contactFormRequireAuth,
}, async (state) => {
	if (state.contactFormLimit < 1 || state.contactFormLimit > 10) {
		os.alert({
			type: 'error',
			text: '制限値は1から10の間で設定してください',
		});
		return;
	}
	await os.apiWithDialog('admin/update-meta', {
		enableContactForm: state.enableContactForm,
		contactFormLimit: state.contactFormLimit,
		contactFormRequireAuth: state.contactFormRequireAuth,
	});
	fetchInstance(true);
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.moderation,
	icon: 'ti ti-shield',
}));
</script>
