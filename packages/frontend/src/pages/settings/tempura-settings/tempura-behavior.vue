<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-behavior" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['behavior', 'interaction', 'actions', 'default']">
	<MkFolder>
		<template #icon><i class="ti ti-mood-happy"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.behavior }}</SearchLabel></template>
		<div class="_gaps_m">
			<div class="_gaps_m">
				<MkPreferenceContainer k="reactionChecksMuting">
					<SearchMarker :keywords="['reaction', 'muting', 'block', 'ignore', 'notifications']">
						<MkSwitch v-model="reactionChecksMuting">
							<SearchLabel>{{ i18n.ts._reactionChecksMuting.title }}</SearchLabel>
							<template #caption>{{ i18n.ts._reactionChecksMuting.caption }}</template>
						</MkSwitch>
					</SearchMarker>
				</MkPreferenceContainer>
			</div>

			<MkFolder>
				<template #icon><i class="ti ti-server-off"></i></template>
				<template #label><SearchLabel>{{ i18n.ts._tempura.perServerMuteWordsTitle }}</SearchLabel></template> <!-- TODO: Add i18n key -->
				<div class="_gaps_m">
					<MkInfo>{{ i18n.ts._tempura.perServerMuteWordsDescription }}</MkInfo> <!-- TODO: Add i18n key -->

					<div :class="$style.metadataRoot" class="_gaps_s">
						<div v-if="perServerMuteWords.length === 0 && !isAddingNewPerServerMute">
							<MkInfo>{{ i18n.ts.noEntries }}</MkInfo> <!-- TODO: Add i18n key -->
						</div>
						<div v-for="(entry, index) in perServerMuteWords" :key="index" v-panel :class="$style.fieldDragItem">
							<button class="_button" :class="$style.dragItemRemove" @click="removePerServerMuteEntry(index)"><i class="ti ti-x"></i></button>
							<div :class="$style.dragItemForm">
								<div class="_gaps_s">
									<MkInput v-model="entry.fqdn" :placeholder="String(i18n.ts.fqdnPlaceholder)" small @change="markChanged" />
									<MkTextarea v-model="entry.rawWords" :placeholder="String(i18n.ts.muteWordsPlaceholder)" small :rows="3" @change="markChanged" />
								</div>
							</div>
						</div>
					</div>
				</div>
				<template #footer>
					<div class="_buttons">
						<MkButton @click="addPerServerMuteEntry"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
						<MkButton v-if="perServerMuteChanged" primary :disabled="!perServerMuteChanged" @click="savePerServerMuteSettings">
							<i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}
						</MkButton>
					</div>
				</template>
			</MkFolder>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, ref, watch, nextTick } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import FormSplit from '@/components/form/split.vue'; // Assuming this path is correct
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const $i = ensureSignin();

const reactionChecksMuting = prefer.model('reactionChecksMuting');

// Per-Server Mute Words
interface PerServerMuteEntry {
	fqdn: string;
	words: (string[] | string)[]; // Parsed words
	rawWords: string; // Raw string from textarea for editing
}
const perServerMuteWords = ref<PerServerMuteEntry[]>([]);
const perServerMuteChanged = ref(false);
const isAddingNewPerServerMute = ref(false); // To control visibility of "No entries" message

// Load initial settings
const initialPerServerMuteWords = ($i as any).perServerMuteWords;
if (initialPerServerMuteWords && Array.isArray(initialPerServerMuteWords)) {
	perServerMuteWords.value = initialPerServerMuteWords.map((setting: any) => ({
		fqdn: setting.fqdn,
		words: setting.words, // Keep parsed words from server
		rawWords: setting.words.map((w: string[] | string) => Array.isArray(w) ? w.join(' ') : w).join('\n'),
	}));
}

watch(perServerMuteWords, () => {
	markChanged();
}, { deep: true });

function markChanged() {
	perServerMuteChanged.value = true;
}

function parseMuteWordsInput(rawWords: string): (string[] | string)[] {
	let lines = rawWords.trim().split('\n').map(line => line.trim()).filter(line => line !== '');
	const parsedWords: (string[] | string)[] = []; // Correct type: string[] | string
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const regexp = line.match(/^\/(.+)\/(.*)$/);
		if (regexp) {
			try {
				new RegExp(regexp[1], regexp[2]); // Validate regex
				parsedWords.push(line); // Store as raw regex string
			} catch (err: any) {
				os.alert({
					type: 'error',
					title: i18n.ts.regexpError,
					text: i18n.tsx.regexpErrorDescription({ tab: 'per-server mute', line: i + 1 }) + '\n' + err.toString(),
				});
				throw err; // Prevent adding invalid regex
			}
		} else {
			parsedWords.push(line.split(' ').filter(w => w !== ''));
		}
	}
	return parsedWords;
}

function addPerServerMuteEntry() {
	perServerMuteWords.value.push({ fqdn: '', rawWords: '', words: [] });
	markChanged();
	isAddingNewPerServerMute.value = true; // Hide "No entries" message if it was visible
	nextTick(() => {
		// Focus the FQDN input of the newly added row
		const fqdnInputs = window.document.querySelectorAll(`.${(CSS.escape((moduleClassMap as any).fieldDragItem))} input[type="text"]`);
		if (fqdnInputs.length > 0) {
			(fqdnInputs[fqdnInputs.length - 1] as HTMLElement).focus();
		}
	});
}

function removePerServerMuteEntry(index: number) {
	perServerMuteWords.value.splice(index, 1);
	markChanged();
	if (perServerMuteWords.value.length === 0) {
		isAddingNewPerServerMute.value = false; // Show "No entries" if list becomes empty
	}
}

// Helper to get CSS module class names if $style is not directly usable in script
const moduleClassMap = computed(() => (window as any).$style || {});

async function savePerServerMuteSettings() {
	if (!perServerMuteChanged.value) return;
	try {
		const settingsToSave: { fqdn: string, words: (string[] | string)[] }[] = [];
		for (const entry of perServerMuteWords.value) {
			const fqdn = entry.fqdn.trim().toLowerCase();
			if (!fqdn) {
				os.alert({ text: String(i18n.ts.pleaseEnterFqdn) + ` (Entry: ${entry.rawWords.substring(0, 20)}...)` }); // Added space
				return;
			}
			if (!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:[a-zA-Z]{2,6}|xn--[a-zA-Z0-9]+)$/.test(fqdn)) {
				os.alert({ text: String(i18n.ts.invalidFqdnFormat) + `: ${fqdn}` });
				return;
			}
			if (!entry.rawWords.trim()) {
				os.alert({ text: String(i18n.ts.pleaseEnterMuteWords) + ` (FQDN: ${fqdn})` });
				return;
			}
			try {
				const parsedWords = parseMuteWordsInput(entry.rawWords);
				settingsToSave.push({ fqdn, words: parsedWords });
			} catch (err) {
				// Error already alerted by parseMuteWordsInput
				return;
			}
		}

		await misskeyApi('i/update', {
			perServerMuteWords: settingsToSave,
		});
		perServerMuteChanged.value = false;
		os.toast(i18n.ts.saved);
		// Update $i.profile if necessary, or rely on next full profile fetch
		// This direct update to $i might not be ideal, better to refetch or have a centralized store update mechanism.
		// For now, this is a simple way to reflect changes locally.
		// Ideally, $i should be refetched or its type updated properly.
		($i as any).perServerMuteWords = settingsToSave;
	} catch (err) {
		console.error(err);
		os.alert({ text: String(i18n.ts.error), type: 'error' });
	}
}
</script>

<style lang="scss" module>
.sectionContent { /* This div wraps the list and potentially an add button if it were outside the footer */
	display: flex;
	flex-direction: column;
	gap: var(--MI-gap-m);
}

/* Removed .addEntryForm as a separate block, inputs are now in .fieldDragItem or a modal */
/* .formSplitInputs is not used in this new structure */
/* .addButton is now part of the footer or a direct action in a modal */

.metadataRoot { /* Added to wrap the list, similar to admin/settings.vue */
	container-type: inline-size;
}

.fieldDragItem {
	display: flex;
	padding: 10px;
	align-items: center; /* Align remove button and form content vertically */
	border-radius: 6px;
	gap: 8px;
}

.dragItemRemove {
	cursor: pointer;
	width: 32px;
	height: 32px;
	opacity: 0.7;
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: transparent; // Ensure button itself is transparent
	border: none; // Remove button border
	opacity: 1;
	color: #ff2a2a;

		&:hover, &:focus {
		opacity: .7;
	}

	&:active {
		cursor: pointer;
	}
	i { // Style the icon directly if needed
		font-size: 1.2em; // Adjust icon size
	}
}

.dragItemForm {
	flex-grow: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: var(--MI-gap-s); /* Add gap between FQDN input and Mute words textarea */
}

.entryDetails {
	/* This class might not be needed if FormSplit handles the layout */
}

.entryFqdn { /* This class might not be needed if MkInput handles its own styling */
	/* display: block;
	font-weight: bold;
	margin-bottom: 4px;
	word-break: break-all; */
}

.entryWords { /* This class might not be needed if MkTextarea handles its own styling */
	/* white-space: pre-wrap;
	word-break: break-all;
	font-size: 0.9em;
	opacity: 0.8;
	max-height: 10em;
	overflow-y: auto;
	background-color: var(--panel-bg, var(--MI_THEME-panel));
	padding: 4px 6px;
	border-radius: 4px;
	border: 1px solid var(--MI_THEME-divider); */
}
</style>
