<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/moderation" :label="i18n.ts.moderation" :keywords="['moderation']" icon="ti ti-shield" :inlining="['serverRules']">
			<div class="_gaps_m">
				<SearchMarker :keywords="['open', 'registration']">
					<MkSwitch :modelValue="enableRegistration" @update:modelValue="onChange_enableRegistration">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.openRegistration }}</SearchLabel></template>
						<template #caption>
							<div><SearchText>{{ i18n.ts._serverSettings.thisSettingWillAutomaticallyOffWhenModeratorsInactive }}</SearchText></div>
							<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> <SearchText>{{ i18n.ts._serverSettings.openRegistrationWarning }}</SearchText></div>
						</template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['email', 'required', 'signup']">
					<MkSwitch v-model="emailRequiredForSignup" @change="onChange_emailRequiredForSignup">
						<template #label><SearchLabel>{{ i18n.ts.emailRequiredForSignup }}</SearchLabel> ({{ i18n.ts.recommended }})</template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['ugc', 'content', 'visibility', 'visitor', 'guest']">
					<MkSelect v-model="ugcVisibilityForVisitor" @update:modelValue="onChange_ugcVisibilityForVisitor">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor }}</SearchLabel></template>
						<option value="all">{{ i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.all }}</option>
						<option value="local">{{ i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.localOnly }} ({{ i18n.ts.recommended }})</option>
						<option value="none">{{ i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.none }}</option>
						<template #caption>
							<div><SearchText>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor_description }}</SearchText></div>
							<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> <SearchText>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor_description2 }}</SearchText></div>
						</template>
					</MkSelect>

					<MkSwitch v-model="approvalRequiredForSignup" @change="onChange_approvalRequiredForSignup">
						<template #label>{{ i18n.ts.approvalRequiredForSignup }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						<template #caption>{{ i18n.ts.registerApprovalEmailRecommended }}</template>
					</MkSwitch>

					<MkSwitch v-model="blockMentionsFromUnfamiliarRemoteUsers" @change="onChange_blockMentionsFromUnfamiliarRemoteUsers">
						<template #label>{{ i18n.ts.blockMentionsFromUnfamiliarRemoteUsers }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
						<template #caption>{{ i18n.ts.blockMentionsFromUnfamiliarRemoteUsersDescription }} Cherry-picked from Misskey.io (https://github.com/MisskeyIO/misskey/commit/82cc3987c13db4ad0da1589386027c222ce85ff8)</template>
					</MkSwitch>

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
						<MkInput v-model="secondsPerSignup" type="number" @update:modelValue="v => secondsPerSignup = Number(v)">
							<template #label>
								<span>{{ i18n.ts.secondsPerSignup }}</span>
								<span v-if="secondsPerSignupChanged" class="_modified">{{ i18n.ts.modified }}</span>
								<span class="_beta">{{ i18n.ts.originalFeature }}</span>
							</template>
							<template #caption>{{ i18n.ts.secondsPerSignupDescription }}</template>
						</MkInput>
						<MkButton v-if="secondsPerSignupChanged" primary @click="save_secondsPerSignup">{{ i18n.ts.save }}</MkButton>
					</div>
				</SearchMarker>

				<XServerRules/>

				<SearchMarker :keywords="['preserved', 'usernames']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-lock-star"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.preservedUsernames }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="preservedUsernames">
								<template #caption>{{ i18n.ts.preservedUsernamesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_preservedUsernames">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['sensitive', 'words']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-message-exclamation"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.sensitiveWords }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="sensitiveWords">
								<template #caption>{{ i18n.ts.sensitiveWordsDescription }}<br>{{ i18n.ts.sensitiveWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_sensitiveWords">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['prohibited', 'words']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-message-x"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.prohibitedWords }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="prohibitedWords">
								<template #caption>{{ i18n.ts.prohibitedWordsDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_prohibitedWords">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['prohibited', 'name', 'user']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-user-x"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.prohibitedWordsForNameOfUser }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="prohibitedWordsForNameOfUser">
								<template #caption>{{ i18n.ts.prohibitedWordsForNameOfUserDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_prohibitedWordsForNameOfUser">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['hidden', 'tags', 'hashtags']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.hiddenTags }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="hiddenTags">
								<template #caption>{{ i18n.ts.hiddenTagsDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_hiddenTags">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['silenced', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.silencedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="silencedHosts">
								<template #caption>{{ i18n.ts.silencedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_silencedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['media', 'silenced', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.mediaSilencedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="mediaSilencedHosts">
								<template #caption>{{ i18n.ts.mediaSilencedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_mediaSilencedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['blocked', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-ban"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.blockedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="blockedHosts">
								<template #caption>{{ i18n.ts.blockedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_blockedHosts">{{ i18n.ts.save }}</MkButton>
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
import XServerRules from './server-rules.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import FormLink from '@/components/form/link.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSelect from '@/components/MkSelect.vue';

const meta = await misskeyApi('admin/meta');

const enableRegistration = ref(!meta.disableRegistration);
const emailRequiredForSignup = ref(meta.emailRequiredForSignup);
const ugcVisibilityForVisitor = ref(meta.ugcVisibilityForVisitor);
const sensitiveWords = ref(meta.sensitiveWords.join('\n'));
const prohibitedWords = ref(meta.prohibitedWords.join('\n'));
const prohibitedWordsForNameOfUser = ref(meta.prohibitedWordsForNameOfUser.join('\n'));
const hiddenTags = ref(meta.hiddenTags.join('\n'));
const preservedUsernames = ref(meta.preservedUsernames.join('\n'));
const blockedHosts = ref(meta.blockedHosts.join('\n'));
const silencedHosts = ref(meta.silencedHosts?.join('\n') ?? '');
const mediaSilencedHosts = ref(meta.mediaSilencedHosts.join('\n'));
const approvalRequiredForSignup = ref(meta.approvalRequiredForSignup);
const blockMentionsFromUnfamiliarRemoteUsers = ref(meta.blockMentionsFromUnfamiliarRemoteUsers);
const validateMinimumUsernameLength = ref(meta.validateMinimumUsernameLength);
const secondsPerSignup = ref(meta.secondsPerSignup);
const originalMinimumUsernameLength = ref<number>();
const originalSecondsPerSignup = ref<number>(0);
const validateMinimumUsernameLengthChanged = computed(() =>
	validateMinimumUsernameLength.value !== originalMinimumUsernameLength.value
);
const secondsPerSignupChanged = computed(() =>
	secondsPerSignup.value !== originalSecondsPerSignup.value
);

async function onChange_enableRegistration(value: boolean) {
	if (value) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts.acknowledgeNotesAndEnable,
		});
		if (canceled) return;
	}

	enableRegistration.value = value;

	os.apiWithDialog('admin/update-meta', {
		disableRegistration: !value,
	}).then(() => {
		fetchInstance(true);
	});
}

function onChange_emailRequiredForSignup(value: boolean) {
	os.apiWithDialog('admin/update-meta', {
		emailRequiredForSignup: value,
	}).then(() => {
		fetchInstance(true);
	});
}

function onChange_ugcVisibilityForVisitor(value: string) {
	os.apiWithDialog('admin/update-meta', {
		ugcVisibilityForVisitor: value,
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

function onUsernameMinLengthChange(value: string | number) {
	validateMinimumUsernameLength.value = Number(value);
}

function save_validateMinimumUsernameLength() {
	os.apiWithDialog('admin/update-meta', {
		validateMinimumUsernameLength: validateMinimumUsernameLength.value ?? undefined,
	}).then(() => {
		fetchInstance(true);
		originalMinimumUsernameLength.value = validateMinimumUsernameLength.value ?? undefined;
	});
}

function save_secondsPerSignup() {
	os.apiWithDialog('admin/update-meta', {
		secondsPerSignup: secondsPerSignup.value,
	}).then(() => {
		fetchInstance(true);
		originalSecondsPerSignup.value = secondsPerSignup.value;
	});
}

function save_preservedUsernames() {
	os.apiWithDialog('admin/update-meta', {
		preservedUsernames: preservedUsernames.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_sensitiveWords() {
	os.apiWithDialog('admin/update-meta', {
		sensitiveWords: sensitiveWords.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_prohibitedWords() {
	os.apiWithDialog('admin/update-meta', {
		prohibitedWords: prohibitedWords.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_prohibitedWordsForNameOfUser() {
	os.apiWithDialog('admin/update-meta', {
		prohibitedWordsForNameOfUser: prohibitedWordsForNameOfUser.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_hiddenTags() {
	os.apiWithDialog('admin/update-meta', {
		hiddenTags: hiddenTags.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_blockedHosts() {
	os.apiWithDialog('admin/update-meta', {
		blockedHosts: blockedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
	});
}

function save_silencedHosts() {
	os.apiWithDialog('admin/update-meta', {
		silencedHosts: silencedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
	});
}

function save_mediaSilencedHosts() {
	os.apiWithDialog('admin/update-meta', {
		mediaSilencedHosts: mediaSilencedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
	});
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.moderation,
	icon: 'ti ti-shield',
}));
</script>
