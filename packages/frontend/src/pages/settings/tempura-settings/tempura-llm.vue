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
							<MkPreferenceContainer k="tlDigestVisibilities">
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
								</div>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'timeline', 'digest', 'cw', 'content warning']">
							<MkPreferenceContainer k="tlDigestCwMode">
								<MkSelect v-model="tlDigestCwMode" :items="tlDigestCwModeItems">
									<template #label><SearchLabel>{{ i18n.ts._tlDigest.cwModeLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._tlDigest.cwModeCaption }}</template>
								</MkSelect>
							</MkPreferenceContainer>
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
import FormSection from '@/components/form/section.vue';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { fetchInstance } from '@/instance.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import { fetchAvailableModels, detectImageInputSupport } from '@/utility/tempura-script/llm.js';
import type { LLMModelInfo } from '@/utility/tempura-script/llm.js';
import { openaiModels } from '@/utility/tempura-script/models.js';
import {
	SELECTABLE_TL_DIGEST_VISIBILITIES,
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
const tlDigestCwMode = prefer.model('tlDigestCwMode');
const tlDigestPrompt = prefer.model('tlDigestPrompt');

const visibilityLabels = i18n.ts._visibility as Record<string, string>;
const tlDigestVisibilityOptions = SELECTABLE_TL_DIGEST_VISIBILITIES.map((value) => ({
	value,
	label: visibilityLabels[value] ?? value,
}));

const tlDigestCwModeItems = computed(() => [
	{ value: 'cwOnly' as const, label: i18n.ts._tlDigest.cwModeCwOnly },
	{ value: 'exclude' as const, label: i18n.ts._tlDigest.cwModeExclude },
	{ value: 'include' as const, label: i18n.ts._tlDigest.cwModeInclude },
]);

function resolveLlmDestinationText(): string {
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

async function onUpdateTlDigestVisibilities(next: TlDigestVisibility[]): Promise<void> {
	const normalized = normalizeTlDigestVisibilities(next);
	const hadFollowers = tlDigestVisibilities.value.includes('followers');
	const wantsFollowers = normalized.includes('followers');

	if (!hadFollowers && wantsFollowers) {
		const { canceled } = await os.confirm({
			type: 'warning',
			title: i18n.ts._tlDigest.followersConfirmTitle,
			text: i18n.tsx._tlDigest.followersConfirmText({
				destination: resolveLlmDestinationText(),
			}),
		});
		if (canceled) {
			return;
		}
	}

	tlDigestVisibilities.value = normalized;
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
