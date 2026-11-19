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
			<SearchMarker markerId="tempura-settings-llm-connection" :inlining="['tempura-settings-llm']" :keywords="['llm', 'gemini', 'openai', 'api', 'token', 'model']">
				<FormSection first>
					<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.llmConnection }}</SearchLabel></template>
					<div class="_gaps_m">
						<SearchMarker :keywords="['llm', 'provider', 'gemini', 'openai']">
							<MkPreferenceContainer k="llmProvider">
								<MkSelect v-model="llmProvider" :items="providerItems">
									<template #label><SearchLabel>{{ i18n.ts._llm.llmProviderLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.llmProviderCaption }}</template>
								</MkSelect>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'api', 'server']">
							<MkPreferenceContainer v-if="serverLlmEnabled && $i?.policies.canUseGeminiLLMAPI" k="useGeminiLLMAPI">
								<MkSwitch v-model="useGeminiLLMAPI">
									<SearchLabel>{{ i18n.ts._llm.useGeminiLLMAPI }}</SearchLabel>
									<template #caption>{{ i18n.ts._llm.useGeminiLLMAPIDescription }}</template>
								</MkSwitch>
							</MkPreferenceContainer>
						</SearchMarker>

						<template v-if="llmProvider === 'gemini'">
						<SearchMarker :keywords="['llm', 'gemini', 'media', 'images', 'photos']">
							<MkPreferenceContainer k="useGeminiWithMedia">
								<MkSwitch v-model="useGeminiWithMedia">
									<SearchLabel>{{ i18n.ts._llm.useGeminiWithMedia }}</SearchLabel>
									<template #caption>{{ i18n.ts._llm.useGeminiWithMediaDescription }}</template>
								</MkSwitch>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'token', 'api key']">
							<MkPreferenceContainer k="geminiToken">
								<MkInput v-model="geminiToken" type="text" :disabled="useGeminiLLMAPI">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiTokenLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.geminiTokenCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'model', 'version']">
							<MkPreferenceContainer k="geminiModel">
								<MkSelect v-model="geminiModel" :items="geminiModelItems" :disabled="useGeminiLLMAPI">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiModelLabel }}</SearchLabel></template>
								</MkSelect>
							</MkPreferenceContainer>
						</SearchMarker>
						</template>

						<template v-else>
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

							<SearchMarker :keywords="['llm', 'openai', 'model', 'version']">
								<MkPreferenceContainer k="openaiModel">
									<MkInput v-model="openaiModel" type="text" :disabled="useGeminiLLMAPI">
										<template #label><SearchLabel>{{ i18n.ts._llm.openaiModelLabel }}</SearchLabel></template>
										<template #caption>{{ i18n.ts._llm.openaiModelCaption }}</template>
									</MkInput>
								</MkPreferenceContainer>
							</SearchMarker>
						</template>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker markerId="tempura-settings-llm-prompt" :inlining="['tempura-settings-llm']" :keywords="['llm', 'prompt', 'system', 'summary']">
				<FormSection>
					<template #label><SearchLabel>{{ i18n.ts._tempuraSettings.llmPrompt }}</SearchLabel></template>
					<div class="_gaps_m">
						<SearchMarker :keywords="['llm', 'gemini', 'thinking', 'budget']">
							<MkPreferenceContainer k="geminiThinkingBudget">
								<MkInput v-model="geminiThinkingBudget" type="number">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiThinkingBudgetLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.geminiThinkingBudgetCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'system', 'prompt', 'instruction']">
							<MkPreferenceContainer k="geminiSystemPrompt">
								<MkInput v-model="geminiSystemPrompt" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiSystemPromptLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.geminiSystemPromptCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'note', 'summarize', 'prompt']">
							<MkPreferenceContainer k="geminiPromptNote">
								<MkInput v-model="geminiPromptNote" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiSummarizePromptLabel }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._llm.geminiSummarizePromptCaption }}</template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'profile', 'summarize', 'prompt']">
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
						<SearchMarker :keywords="['llm', 'gemini', 'notes', 'long', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteLongText">
								<MkInput v-model="geminiNoteLongText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteLongText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'notes', 'short', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteShortText">
								<MkInput v-model="geminiNoteShortText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteShortText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'notes', 'simple', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteSimpleText">
								<MkInput v-model="geminiNoteSimpleText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteSimpleText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'notes', 'casual', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteCasualText">
								<MkInput v-model="geminiNoteCasualText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCasualText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'notes', 'professional', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteProfessionalText">
								<MkInput v-model="geminiNoteProfessionalText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteProfessionalText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'notes', 'cat', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteCatText">
								<MkInput v-model="geminiNoteCatText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCatText }}</SearchLabel></template>
								</MkInput>
							</MkPreferenceContainer>
						</SearchMarker>

						<SearchMarker :keywords="['llm', 'gemini', 'notes', 'custom', 'text', 'format']">
							<MkPreferenceContainer k="geminiNoteCustomText">
								<MkInput v-model="geminiNoteCustomText" type="text">
									<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCustomText }}</SearchLabel></template>
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
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSection from '@/components/form/section.vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { fetchInstance } from '@/instance.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import { geminiModels } from '@/utility/tempura-script/models.js';

const instance = ref<Misskey.entities.MetaDetailed | null>(null);

fetchInstance(true).then((res) => {
	instance.value = res;
});

const llmProvider = prefer.model('llmProvider');
const openaiToken = prefer.model('openaiToken');
const openaiBaseUrl = prefer.model('openaiBaseUrl');
const openaiModel = prefer.model('openaiModel');
const providerItems = [{ value: 'gemini', label: 'Gemini' }, { value: 'openai', label: 'OpenAI' }];
const serverLlmEnabled = computed(() => llmProvider.value === 'openai' ? instance.value?.serverOpenAIEnabled === true : instance.value?.serverGeminiEnabled === true);
const useGeminiLLMAPI = prefer.model('useGeminiLLMAPI');
const useGeminiWithMedia = prefer.model('useGeminiWithMedia');
const geminiToken = prefer.model('geminiToken');
const geminiModel = prefer.model('geminiModel');
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
const geminiThinkingBudget = prefer.model('geminiThinkingBudget');
const geminiModelItems = computed(() => geminiModels.map((model) => ({ value: model, label: model })));
</script>
