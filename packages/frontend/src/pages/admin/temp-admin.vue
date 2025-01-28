<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkStickyContainer>
		<template #header><XHeader :tabs="headerTabs"/></template>
		<MkSpacer :contentMax="700" :marginMin="16" :marginMax="32">
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
								<template #label>{{ i18n.ts.useHanaEntrance }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
							</MkSwitch>

							<MkInput
								v-model="hanaSettingsForm.state.hanaThemeColor"
								type="text"
								pattern="^#([A-Fa-f0-9]{6})$"
								maxlength="7"
							>
								<template #label>
									<span>{{ i18n.ts.hanaThemeColor }}</span>
									<span class="_beta">{{ i18n.ts.originalFeature }}</span>
								</template>
								<template #caption>{{ i18n.ts.hanaThemeColorDescription }}</template>
							</MkInput>

							<MkInput
								v-model="hanaSettingsForm.state.hanaThemeAltColor"
								type="text"
								pattern="^#([A-Fa-f0-9]{6})$"
								maxlength="7"
							>
								<template #label>
									<span>{{ i18n.ts.hanaThemeAltColor }}</span>
									<span class="_beta">{{ i18n.ts.originalFeature }}</span>
								</template>
								<template #caption>{{ i18n.ts.hanaThemeAltColorDescription }}</template>
							</MkInput>

							<MkInput
								v-model="hanaSettingsForm.state.hanaThemeWeakOpacity"
								type="number"
								min="0"
								max="1"
								step="0.1"
							>
								<template #label>
									<span>{{ i18n.ts.hanaThemeWeakOpacity }}</span>
									<span class="_beta">{{ i18n.ts.originalFeature }}</span>
								</template>
								<template #caption>{{ i18n.ts.hanaThemeWeakOpacityDescription }}</template>
							</MkInput>

							<MkInput
								v-model="hanaSettingsForm.state.hanaModeIcon"
								type="url"
							>
								<template #label>
									<span>{{ i18n.ts.hanaModeIcon }}</span>
									<span class="_beta">{{ i18n.ts.originalFeature }}</span>
								</template>
								<template #caption>{{ i18n.ts.hanaModeIconDescription }}</template>
							</MkInput>

							<MkInput
								v-model="hanaSettingsForm.state.hanaModeIconSize"
								type="number"
								min="0"
							>
								<template #label>
									<span>{{ i18n.ts.hanaModeIconSize }}</span>
									<span class="_beta">{{ i18n.ts.originalFeature }}</span>
								</template>
								<template #caption>{{ i18n.ts.hanaModeIconSizeDescription }}</template>
							</MkInput>

							<MkInput
								v-model="hanaSettingsForm.state.hanaModeIconRadius"
								type="number"
								min="0"
								max="100"
							>
								<template #label>
									<span>{{ i18n.ts.hanaModeIconRadius }}</span>
									<span class="_beta">{{ i18n.ts.originalFeature }}</span>
								</template>
								<template #caption>{{ i18n.ts.hanaModeIconRadiusDescription }}</template>
							</MkInput>

							<MkInput
								v-model="hanaSettingsForm.state.hanaModeBackground"
								type="url"
							>
								<template #label>
									<span>{{ i18n.ts.hanaModeBackground }}</span>
									<span class="_beta">{{ i18n.ts.originalFeature }}</span>
								</template>
								<template #caption>{{ i18n.ts.hanaModeBackgroundDescription }}</template>
							</MkInput>
						</div>
					</MkFolder>

					<MkFolder>
						<template #icon><i class="ti ti-user-star"></i></template>
						<template #label>{{ i18n.ts.defaultFollowedUsers }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>

						<div class="_gaps">
							<MkTextarea v-model="defaultFollowedUsers">
								<template #label>{{ i18n.ts.defaultFollowedUsers }}</template>
								<template #caption>{{ i18n.ts.defaultFollowedUsersDescription }}</template>
							</MkTextarea>
							<MkTextarea v-model="forciblyFollowedUsers">
								<template #label>{{ i18n.ts.forciblyFollowedUsers }}</template>
								<template #caption>{{ i18n.ts.forciblyFollowedUsersDescription }}</template>
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
				</div>
			</FormSuspense>
		</MkSpacer>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import XHeader from './_header_.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkButton from '@/components/MkButton.vue';
import FormLink from '@/components/form/link.vue';
import MkFolder from '@/components/MkFolder.vue';
import { useForm } from '@/scripts/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';

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
			text: i18n.ts.defaultFollowedUsersDuplicated,
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

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: i18n.ts.moderation,
	icon: 'ti ti-shield',
}));
</script>
