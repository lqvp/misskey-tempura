<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="temp-settings" :keywords="['appearance']">
	<MkFolder>
		<template #icon><i class="ti ti-mood-happy"></i></template>
		<template #label>{{ i18n.ts.behavior }}</template>
		<div class="_gaps_m">
			<div class="_gaps_m">
				<MkPreferenceContainer k="reactionChecksMuting">
					<SearchMarker ;keywords="['reaction']">
						<MkSwitch v-model="reactionChecksMuting">
							{{ i18n.ts._reactionChecksMuting.title }}
							<template #caption>{{ i18n.ts._reactionChecksMuting.caption }}</template>
						</MkSwitch>
					</SearchMarker>
				</MkPreferenceContainer>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

const reactionChecksMuting = prefer.model('reactionChecksMuting');

</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
