<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-llm" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['llm', 'ai', 'language model']">
	<MkFolder>
		<template #icon><i class="ti ti-robot"></i></template>
		<template #label><SearchLabel>{{ i18n.ts._llm.title }}</SearchLabel></template>

		<div class="_gaps_m">
			<SearchMarker markerId="tempura-settings-llm-connection" :inlining="['tempura-settings-llm']" :keywords="['llm', 'openai', 'api', 'token', 'model']">
				<FormSection first>
					<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.llmConnection }}</SearchLabel></template>
					<div class="_gaps_m">
						<SearchMarker :keywords="['llm', 'openai', 'api', 'server']">
							<MkPreferenceContainer v-if="instance?.serverOpenAIEnabled && $i?.policies.canUseGeminiLLMAPI" k="useGeminiLLMAPI">
								<MkSwitch v-model="useGeminiLLMAPI">
									<SearchLabel>{{ i18n.ts._llm.useGeminiLLMAPI }}</SearchLabel>
									<template #caption>{{ i18n.ts._llm.useGeminiLLMAPIDescription }}</template>
								</MkSwitch>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'openai', 'token', 'api key']">
							<MkPreferenceContainer k="openaiToken">
								<MkInput v-model="openaiToken" type="text" :disabled="useGeminiLLMAPI">
									<template #label><SearchLabel>{{ i18n.ts._llm.openaiTokenLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.openaiTokenCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'openai', 'base', 'url', 'endpoint']">
							<MkPreferenceContainer k="openaiBaseUrl">
								<MkInput v-model="openaiBaseUrl" type="text" :disabled="useGeminiLLMAPI">
									<template #label><SearchLabel>{{ i18n.ts._llm.openaiBaseUrlLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.openaiBaseUrlCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'openai', 'model', 'version', 'fetch', 'list']">
							<MkPreferenceContainer k="openaiModel">
								<div class="_gaps_s">
									<MkSelect v-if="modelItems.length > 0" v-model="openaiModel" :items="modelItems" :disabled="useGeminiLLMAPI">
										<template #label><SearchLabel>{{ i18n.ts._llm.openaiModelLabel }}</SearchLabel></template>
										<template #caption>
											<span v-if="selectedModelInfo?.imageInput === 'supported'">{{ i18n.ts._llm.modelImageSupported }}</span>
											<span v-else-if="selectedModelInfo?.imageInput === 'unsupported'">{{ i18n.ts._llm.modelImageUnsupported }}</span>
											<span v-else>{{ i18n.ts._llm.modelImageUnknown }}</span>
										</template>
									</MkSelect>
									<MkInput v-else v-model="openaiModel" type="text" :disabled="useGeminiLLMAPI">
										<template #label><SearchLabel>{{ i18n.ts._llm.openaiModelLabel }}</SearchLabel></template>
										<template #caption>{{ i18n.ts._llm.openaiModelCaption }}</template>
									</MkInput>
									<div class="_buttons">
										<MkButton :disabled="fetchingModels" @click="refreshModels">{{ fetchingModels ? i18n.ts.loading : i18n.ts._llm.fetchModels }}</MkButton>
									</div>
									<div v-if="fetchError" class="_formCaption" style="color: var(--MI_THEME-warn);">{{ i18n.ts._llm.fetchModelsError }}</div>
								</div>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'openai', 'temperature', 'sampling']">
							<MkPreferenceContainer k="openaiTemperature">
								<MkInput v-model="openaiTemperature" type="number" style="margin: 0;" :disabled="useGeminiLLMAPI">
									<template #label><SearchLabel>{{ i18n.ts._llm.openaiTemperatureLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.openaiTemperatureCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'openai', 'media', 'images', 'photos']">
							<MkPreferenceContainer k="useGeminiWithMedia">
								<MkSwitch v-model="useGeminiWithMedia">
									<SearchLabel>{{ i18n.ts._llm.useGeminiWithMedia }}</SearchLabel>
									<template #caption>{{ i18n.ts._llm.useGeminiWithMediaDescription }}</template>
								</MkSwitch>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'openai', 'image', 'vision', 'force']">
							<MkPreferenceContainer k="openaiForceImageInput">
								<MkSwitch v-model="openaiForceImageInput" :disabled="useGeminiLLMAPI">
									<SearchLabel>{{ i18n.ts._llm.openaiForceImageInputLabel }}</SearchLabel>
									<template #caption>{{ i18n.ts._llm.openaiForceImageInputCaption }}</template>
								</MkSwitch>
							</MkPreferenceContainer>
						</SearchMarker>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker markerId="tempura-settings-llm-prompt" :inlining="['tempura-settings-llm']" :keywords="['llm', 'prompt', 'system', 'summary']">
				<FormSection>
					<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.llmPrompt }}</SearchLabel></template>
					<div class="_gaps_m">
						<SearchMarker :keywords="['llm', 'system', 'prompt', 'instruction']">
							<MkPreferenceContainer k="geminiSystemPrompt">
								<MkInput v-model="geminiSystemPrompt" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiSystemPromptLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.geminiSystemPromptCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'note', 'summarize', 'prompt']">
							<MkPreferenceContainer k="geminiPromptNote">
								<MkInput v-model="geminiPromptNote" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiSummarizePromptLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.geminiSummarizePromptCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'profile', 'summarize', 'prompt']">
							<MkPreferenceContainer k="geminiPromptProfile">
								<MkInput v-model="geminiPromptProfile" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiProfileSummarizePromptLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.geminiProfileSummarizePromptCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker markerId="tempura-settings-llm-note" :inlining="['tempura-settings-llm']" :keywords="['llm', 'note', 'prompt', 'style', 'text']">
				<FormSection>
					<template #label><SearchLabel>{{ i18n.ts._llm.notesPrompt }}</SearchLabel></template>
					<div class="_gaps_m">
						<SearchMarker :keywords="['llm', 'notes', 'long', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteLongText">
								<MkInput v-model="geminiNoteLongText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteLongText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'notes', 'short', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteShortText">
								<MkInput v-model="geminiNoteShortText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteShortText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'notes', 'simple', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteSimpleText">
								<MkInput v-model="geminiNoteSimpleText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteSimpleText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'notes', 'casual', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteCasualText">
								<MkInput v-model="geminiNoteCasualText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCasualText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'notes', 'professional', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteProfessionalText">
								<MkInput v-model="geminiNoteProfessionalText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteProfessionalText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'notes', 'cat', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteCatText">
								<MkInput v-model="geminiNoteCatText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCatText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'notes', 'custom', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteCustomText">
								<MkInput v-model="geminiNoteCustomText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCustomText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker markerId="tempura-settings-llm-tldigest" :inlining="['tempura-settings-llm']" :keywords="['llm', 'timeline', 'digest', 'summary', 'visibility', 'cw']">
				<FormSection>
					<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.llmTlDigest }}</SearchLabel></template>
					<div class="_gaps_m">
						<SearchMarker :keywords="['llm', 'timeline', 'digest', 'visibility', 'followers', 'privacy']">
							<div class="_gaps_s">
								<div><SearchLabel>{{ i18n.ts._tlDigest.visibilitiesLabel }}</SearchLabel></div>
								<div style="display: flex; flex-wrap: wrap; gap: 8px;">
									<MkCheckbox
										v-for="vis in tlDigestVisibilityOptions"
										:key="vis.value"
										:modelValue="tlDigestVisibilities"
										:value="vis.value"
										@update:modelValue="onUpdateTlDigestVisibilities"
									>
										{{ vis.label }}
									</MkCheckbox>
								</div>
								<div class="_formCaption">{{ i18n.ts._tlDigest.visibilitiesCaption }}</div>
								<div v-if="isFollowersConsentStale" class="_gaps_s">
									<div class="_formCaption" style="color: var(--MI_THEME-warn);">{{ i18n.ts._tlDigest.followersConsentStale }}</div>
									<div class="_buttons">
										<MkButton @click="reconfirmFollowersConsent">{{ i18n.ts._tlDigest.followersReconfirm }}</MkButton>
									</div>
								</div>
							</div>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'timeline', 'digest', 'cw', 'content warning']">
							<MkPreferenceContainer k="tlDigestCwMode">
								<MkSelect v-model="tlDigestCwMode" :items="tlDigestCwModeItems">
									<template #label><SearchLabel>{{ i18n.ts._tlDigest.cwModeLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._tlDigest.cwModeCaption }}</template>
								</MkSelect>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'timeline', 'digest', 'user', 'block', 'allow', 'filter']">
							<div class="_gaps_m">
								<MkRadios v-model="tlDigestUserFilterMode" :options="tlDigestUserFilterModeItems" vertical>
									<template #label><SearchLabel>{{ i18n.ts._tlDigest.userFilterModeLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._tlDigest.userFilterModeCaption }}</template>
								</MkRadios>
								<div v-if="tlDigestUserFilterMode !== 'off'" v-adaptive-border :class="$style.userFilterPanel">
									<div :class="$style.userFilterHeader">
										<div :class="$style.userFilterTitle">
											<i class="ti ti-users" :class="$style.userFilterTitleIcon"></i>
											<SearchLabel>{{ i18n.ts._tlDigest.userFilterUsersLabel }}</SearchLabel>
											<span :class="$style.userFilterCount">{{ tlDigestUserFilterUsers.length }}/{{ MAX_TL_DIGEST_FILTER_USERS }}</span>
										</div>
										<MkButton small rounded primary :disabled="isTlDigestFilterUserLimitReached" @click="addTlDigestFilterUser">
											<i class="ti ti-user-plus"></i> {{ i18n.ts._tlDigest.userFilterUsersAdd }}
										</MkButton>
									</div>

									<div v-if="tlDigestUserFilterUsers.length === 0" :class="$style.userFilterEmpty">
										<i class="ti ti-user-search" :class="$style.userFilterEmptyIcon"></i>
										<div>{{ i18n.ts._tlDigest.userFilterUsersEmpty }}</div>
									</div>
									<div v-else :class="$style.userList">
										<div v-for="item in tlDigestUserFilterUsers" :key="item.id" :class="$style.userListItem">
											<!-- 取得できなかったユーザーはリンクを張らない (プロフィールが存在しないため遷移先が 404 になる) -->
											<MkA v-if="item.user != null" :to="userProfilePath(item.user)" :class="$style.userCardLink">
												<MkUserCardMini :user="item.user" :withChart="false"/>
											</MkA>
											<div v-else v-adaptive-bg :class="$style.unknownUser" :title="item.id">
												<i class="ti ti-user-question" :class="$style.unknownUserIcon"></i>
												<span :class="$style.unknownUserId">{{ item.id }}</span>
											</div>
											<button class="_button" :class="$style.userRemoveButton" :title="i18n.ts._tlDigest.userFilterUsersRemove" :aria-label="i18n.ts._tlDigest.userFilterUsersRemove" @click="removeTlDigestFilterUser(item.id)">
												<i class="ti ti-x"></i>
												<span :class="$style.visuallyHidden">{{ i18n.ts._tlDigest.userFilterUsersRemove }}</span>
											</button>
										</div>
									</div>

									<div class="_formCaption">{{ i18n.tsx._tlDigest.userFilterUsersCaption({ max: MAX_TL_DIGEST_FILTER_USERS }) }}</div>
									<div v-if="tlDigestUserFilterMode === 'allow' && tlDigestUserFilterUsers.length === 0" class="_formCaption" style="color: var(--MI_THEME-warn);">
										{{ i18n.ts._tlDigest.userFilterUsersIgnored }}
									</div>
								</div>
							</div>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'timeline', 'digest', 'prompt', 'instruction']">
							<MkPreferenceContainer k="tlDigestPrompt">
								<MkInput v-model="tlDigestPrompt" type="text">
									<template #label><SearchLabel>{{ i18n.ts._tlDigest.promptLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._tlDigest.promptCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>
					</div>
				</FormSection>
			</SearchMarker>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import MkCheckbox from '@/components/MkCheckbox.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import FormSection from '@/components/form/section.vue';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { fetchInstance } from '@/instance.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import { computeLLMDestination, fetchAvailableModels, detectImageInputSupport, resolveLLMDestination } from '@/utility/tempura-script/llm.js';
import type { LLMDestination, LLMModelInfo } from '@/utility/tempura-script/llm.js';
import { openaiModels } from '@/utility/tempura-script/models.js';
import {
	MAX_TL_DIGEST_FILTER_USERS,
	SELECTABLE_TL_DIGEST_VISIBILITIES,
	normalizeTlDigestFilterUserIds,
	normalizeTlDigestVisibilities,
} from '@/utility/tempura-script/tl-digest/core.js';
import type { TlDigestVisibility } from '@/utility/tempura-script/tl-digest/core.js';

const instance = ref< Awaited<ReturnType<typeof fetchInstance>> | null>(null);

fetchInstance(true).then((res) => {
	instance.value = res;
});

const useGeminiLLMAPI = prefer.model('useGeminiLLMAPI');
const useGeminiWithMedia = prefer.model('useGeminiWithMedia');
const openaiForceImageInput = prefer.model('openaiForceImageInput');
const openaiTemperature = prefer.model('openaiTemperature');
const openaiToken = prefer.model('openaiToken');
const openaiBaseUrl = prefer.model('openaiBaseUrl');
const openaiModel = prefer.model('openaiModel');
const geminiSystemPrompt = prefer.model('geminiSystemPrompt');
const geminiPromptNote = prefer.model('geminiPromptNote');
const geminiPromptProfile = prefer.model('geminiPromptProfile');
const geminiNoteLongText = prefer.model('geminiNoteLongText');
const geminiNoteShortText = prefer.model('geminiNoteShortText');
const geminiNoteSimpleText = prefer.model('geminiNoteSimpleText');
const geminiNoteCasualText = prefer.model('geminiNoteCasualText');
const geminiNoteProfessionalText = prefer.model('geminiNoteProfessionalText');
const geminiNoteCatText = prefer.model('geminiNoteCatText');
const geminiNoteCustomText = prefer.model('geminiNoteCustomText');
const tlDigestVisibilities = prefer.model('tlDigestVisibilities');
const tlDigestFollowersConsent = prefer.model('tlDigestFollowersConsent');
const tlDigestCwMode = prefer.model('tlDigestCwMode');
const tlDigestPrompt = prefer.model('tlDigestPrompt');
const tlDigestUserFilterMode = prefer.model('tlDigestUserFilterMode');
const tlDigestUserFilterUserIds = prefer.model('tlDigestUserFilterUserIds');

const visibilityLabels = i18n.ts._visibility as Record<string, string>;
const tlDigestVisibilityOptions = SELECTABLE_TL_DIGEST_VISIBILITIES.map((value) => ({
	value,
	label: visibilityLabels[value] ?? value,
}));

const tlDigestUserFilterModeItems = computed(() => [
	{ value: 'off' as const, label: i18n.ts._tlDigest.userFilterModeOff, icon: 'ti ti-filter-off' },
	{ value: 'block' as const, label: i18n.ts._tlDigest.userFilterModeBlock, icon: 'ti ti-user-x' },
	{ value: 'allow' as const, label: i18n.ts._tlDigest.userFilterModeAllow, icon: 'ti ti-user-check' },
]);

// ユーザー ID だけでは設定画面に名前を出せないため、表示用に Lite 情報をキャッシュする
const tlDigestFilterUsers = ref<Misskey.entities.UserLite[]>([]);

/**
 * 保存済み ID の一覧を表示用の行に変換する。
 * users/show は凍結・削除済みのユーザーを返さないため、取得できなかった ID も
 * 行として残す (名前が分からないだけで、削除操作は常にできるようにする)。
 */
const tlDigestUserFilterUsers = computed<{ id: string; user: Misskey.entities.UserLite | null }[]>(() => {
	const known = new Map(tlDigestFilterUsers.value.map((user) => [user.id, user]));
	return normalizeTlDigestFilterUserIds(tlDigestUserFilterUserIds.value).map((id) => ({
		id,
		user: known.get(id) ?? null,
	}));
});

/** 表示用キャッシュのうち、現在保存されていない ID の行を落とす */
function pruneTlDigestFilterUsersCache(): void {
	const saved = new Set(normalizeTlDigestFilterUserIds(tlDigestUserFilterUserIds.value));
	tlDigestFilterUsers.value = tlDigestFilterUsers.value.filter((user) => saved.has(user.id));
}

function syncTlDigestFilterUsers(ids: string[]): void {
	tlDigestFilterUsers.value = tlDigestFilterUsers.value.filter((user) => ids.includes(user.id));
	// 取得済みの ID は問い合わせ直さない (行の表示内容が変わらないため)
	const missing = ids.filter((id) => !tlDigestFilterUsers.value.some((user) => user.id === id));
	if (missing.length === 0) return;
	misskeyApi('users/show', { userIds: missing }).then((users) => {
		// 取得中にフィルタ設定が変わっている可能性があるので、要求時点の `ids` ではなく
		// 解決時点の保存済み ID を基準にする (削除済みの ID が表示に復活しないようにする)
		const saved = new Set(normalizeTlDigestFilterUserIds(tlDigestUserFilterUserIds.value));
		// 同じユーザーを重複させない (取得済みと追加分の和集合)
		const merged = new Map(tlDigestFilterUsers.value.map((user) => [user.id, user]));
		for (const user of users) merged.set(user.id, user);
		tlDigestFilterUsers.value = [...merged.values()].filter((user) => saved.has(user.id));
	}).catch(() => {
		// 表示用の取得に失敗してもフィルタ自体は ID ベースで動くため、致命的ではない
	});
}

/** ユーザー設定ページのパス (リモートユーザーは /@username@host) */
function userProfilePath(user: Misskey.entities.UserLite): string {
	return user.host == null ? `/@${user.username}` : `/@${user.username}@${user.host}`;
}

const isTlDigestFilterUserLimitReached = computed(() =>
	tlDigestUserFilterUsers.value.length >= MAX_TL_DIGEST_FILTER_USERS,
);

async function addTlDigestFilterUser(): Promise<void> {
	if (normalizeTlDigestFilterUserIds(tlDigestUserFilterUserIds.value).length >= MAX_TL_DIGEST_FILTER_USERS) return;
	const user = await os.selectUser({ includeSelf: false });
	if (user == null) return;
	// 選択ダイアログを開いている間に削除や別タブからの同期で一覧が変わっている可能性があるため、
	// ダイアログを開く前の配列ではなく現時点の保存済み ID に対して追加する
	const latest = normalizeTlDigestFilterUserIds(tlDigestUserFilterUserIds.value);
	if (latest.includes(user.id)) return;
	if (latest.length >= MAX_TL_DIGEST_FILTER_USERS) return;
	const next = [...latest, user.id];
	if (!tlDigestFilterUsers.value.some((u) => u.id === user.id)) {
		tlDigestFilterUsers.value = [...tlDigestFilterUsers.value.filter((u) => latest.includes(u.id)), user];
	}
	tlDigestUserFilterUserIds.value = next;
}

function removeTlDigestFilterUser(userId: string): void {
	tlDigestUserFilterUserIds.value = normalizeTlDigestFilterUserIds(tlDigestUserFilterUserIds.value)
		.filter((id) => id !== userId);
	// 削除は表示にも即座に反映する (取得中の応答が後から来ても復活させない)
	pruneTlDigestFilterUsersCache();
	syncTlDigestFilterUsers(tlDigestUserFilterUserIds.value);
}

const tlDigestCwModeItems = computed(() => [
	{ value: 'cwOnly' as const, label: i18n.ts._tlDigest.cwModeCwOnly },
	{ value: 'exclude' as const, label: i18n.ts._tlDigest.cwModeExclude },
	{ value: 'include' as const, label: i18n.ts._tlDigest.cwModeInclude },
]);

const currentLlmDestination = computed<LLMDestination | null>(() => computeLLMDestination({
	useServerApi: useGeminiLLMAPI.value,
	serverEnabled: instance.value?.serverOpenAIEnabled === true,
	serverDestinationId: instance.value?.serverOpenAIDestinationId,
	token: openaiToken.value,
	baseUrl: openaiBaseUrl.value,
}));

const isFollowersConsentStale = computed(() => {
	if (!tlDigestVisibilities.value.includes('followers')) return false;
	if (useGeminiLLMAPI.value && instance.value == null) return false;
	if (currentLlmDestination.value == null) return false;
	return tlDigestFollowersConsent.value !== currentLlmDestination.value;
});

function formatLlmDestinationText(destination: LLMDestination | null): string {
	if (destination != null && destination.startsWith('server:')) {
		return i18n.ts._tlDigest.destinationServer;
	}
	if (destination != null && destination.startsWith('direct:')) {
		const rawOrigin = destination.slice('direct:'.length);
		try {
			return i18n.tsx._tlDigest.destinationDirect({ host: new URL(rawOrigin).host });
		} catch {
			return i18n.tsx._tlDigest.destinationDirect({ host: rawOrigin });
		}
	}
	if (useGeminiLLMAPI.value) {
		return i18n.ts._tlDigest.destinationServer;
	}
	const rawUrl = (openaiBaseUrl.value || 'https://api.openai.com/v1').trim();
	try {
		const host = new URL(rawUrl).host;
		return i18n.tsx._tlDigest.destinationDirect({ host });
	} catch {
		return i18n.tsx._tlDigest.destinationDirect({ host: rawUrl });
	}
}

async function confirmFollowersConsent(destination: LLMDestination | null): Promise<boolean> {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts._tlDigest.followersConfirmTitle,
		text: i18n.tsx._tlDigest.followersConfirmText({
			destination: formatLlmDestinationText(destination),
		}),
	});
	return !canceled;
}

async function onUpdateTlDigestVisibilities(next: TlDigestVisibility[]): Promise<void> {
	const normalized = normalizeTlDigestVisibilities(next);
	const hadFollowers = tlDigestVisibilities.value.includes('followers');
	const wantsFollowers = normalized.includes('followers');

	if (!hadFollowers && wantsFollowers) {
		const destination = await resolveLLMDestination();
		if (destination == null) {
			await os.alert({
				type: 'warning',
				text: useGeminiLLMAPI.value ? i18n.ts._llm._error.serverDisabled : i18n.ts._llm._error.tokenMissing,
			});
			return;
		}
		if (!await confirmFollowersConsent(destination)) {
			return;
		}
		tlDigestFollowersConsent.value = destination;
	} else if (hadFollowers && !wantsFollowers) {
		tlDigestFollowersConsent.value = null;
	}

	tlDigestVisibilities.value = normalized;
}

async function reconfirmFollowersConsent(): Promise<void> {
	const destination = await resolveLLMDestination();
	if (destination == null) return;
	if (!await confirmFollowersConsent(destination)) {
		return;
	}
	tlDigestFollowersConsent.value = destination;
}

// モデル一覧 (API から動的取得、失敗時はフォールバックリスト)
const models = ref<LLMModelInfo[]>([]);
const fetchingModels = ref(false);
const fetchError = ref(false);
const modelItems = computed(() => models.value.map((m) => ({ value: m.id, label: m.id })));
const selectedModelInfo = computed(() => models.value.find((m) => m.id === openaiModel.value));

function fallbackModels(): LLMModelInfo[] {
	return openaiModels.map((id) => ({ id, imageInput: detectImageInputSupport({ id }) }));
}

let refreshGeneration = 0;

async function refreshModels(): Promise<void> {
	// 未設定なら取得しない (初期状態でエラーを表示しない)
	if (!useGeminiLLMAPI.value && !openaiToken.value) {
		models.value = fallbackModels();
		return;
	}
	// 取得要求ごとに世代番号を付け、古い応答で最新の一覧を上書きしない
	const generation = ++refreshGeneration;
	fetchingModels.value = true;
	fetchError.value = false;
	try {
		const result = await fetchAvailableModels();
		if (generation !== refreshGeneration) return;
		if (result.length === 0) {
			// 取得に失敗した場合は自由入力 (フォールバックリストなし) に戻す
			models.value = [];
			fetchError.value = true;
		} else {
			models.value = result;
		}
	} catch {
		if (generation === refreshGeneration) {
			models.value = [];
			fetchError.value = true;
		}
	} finally {
		if (generation === refreshGeneration) {
			fetchingModels.value = false;
		}
	}
}

onMounted(refreshModels);

// 保存済みのユーザー ID から表示用のユーザー情報を復元する
onMounted(() => {
	syncTlDigestFilterUsers(normalizeTlDigestFilterUserIds(tlDigestUserFilterUserIds.value));
});

// 設定変更時にモデル一覧を再取得する
let refreshModelsTimer: number | null = null;
watch([useGeminiLLMAPI, openaiToken, openaiBaseUrl], () => {
	// 連続入力で毎回APIを叩かないようデバウンスする
	if (refreshModelsTimer != null) window.clearTimeout(refreshModelsTimer);
	refreshModelsTimer = window.setTimeout(() => {
		refreshModelsTimer = null;
		refreshModels();
	}, 500);
});
</script>

<style lang="scss" module>
.userFilterPanel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.userFilterHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.userFilterTitle {
	display: flex;
	align-items: center;
	min-width: 0;
	gap: 6px;
	font-weight: bold;
}

.userFilterTitleIcon {
	color: var(--MI_THEME-accent);
}

.userFilterCount {
	flex: none;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.85em;
	font-weight: normal;
}

.userFilterEmpty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 24px 16px;
	border: dashed 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
	text-align: center;
}

.userFilterEmptyIcon {
	font-size: 1.6em;
	color: var(--MI_THEME-accent);
}

.userList {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.userListItem {
	display: flex;
	align-items: center;
	gap: 8px;
}

.userCardLink {
	flex: 1;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}
}

.unknownUser {
	display: flex;
	align-items: center;
	flex: 1;
	min-width: 0;
	gap: 10px;
	padding: 16px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
}

.unknownUserIcon {
	flex: none;
	font-size: 1.4em;
}

.unknownUserId {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: monospace;
}

.userRemoveButton {
	flex: none;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-error);
	}
}

.visuallyHidden {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
