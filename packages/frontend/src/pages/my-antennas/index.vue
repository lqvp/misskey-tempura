<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div>
			<MkResult v-if="antennas.length === 0" type="empty"/>

			<MkButton type="routerLink" to="/my/antennas/create" primary :class="$style.add"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>

			<div v-if="antennas.length > 0" class="_gaps">
				<div v-for="antenna in antennas" :key="antenna.id" :class="$style.antenna">
					<MkA :class="$style.main" :to="`/timeline/antenna/${antenna.id}`">
						<div class="name">{{ antenna.name }}</div>
						<div :class="$style.status">
							<span :class="[$style.statusChip, antenna.isActive ? $style.active : $style.inactive]">
								{{ antenna.isActive ? i18n.ts._tempuraFutureAntenna.receiving : i18n.ts._tempuraFutureAntenna.stopped }}
							</span>
							<span :class="$style.lastUsed">
								{{ i18n.ts._tempuraFutureAntenna.lastUsedAt }}: <MkTime :time="antenna.lastUsedAt" mode="relative"/>
							</span>
						</div>
					</MkA>
					<div :class="$style.actions">
						<MkButton inline small :title="i18n.ts._tempuraFutureAntenna.duplicateAntenna" @click="duplicateAntenna(antenna)"><i class="ti ti-copy"></i> {{ i18n.ts.duplicate }}</MkButton>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onActivated, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkAntennaEditorDialog from '@/components/MkAntennaEditorDialog.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { antennasCache } from '@/cache.js';
import * as os from '@/os.js';

const antennas = computed(() => antennasCache.value.value ?? []);

function _fetch_() {
	antennasCache.fetch();
}

_fetch_();

// 条件をコピーして少し変えた別アンテナをすぐ作れるようにする
function duplicateAntenna(antenna: Misskey.entities.Antenna) {
	// 作成APIのname上限(100文字)を接尾辞込みで超えないように切り詰める
	const suffix = ` - ${i18n.ts.copy}`;
	const copy = {
		...antenna,
		id: undefined,
		createdAt: undefined,
		name: `${antenna.name.slice(0, 100 - suffix.length)}${suffix}`,
	};
	const { dispose } = os.popup(MkAntennaEditorDialog, { antenna: copy }, {
		created: () => {
			antennasCache.delete();
			_fetch_();
			dispose();
		},
		closed: () => dispose(),
	});
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-refresh',
	text: i18n.ts.reload,
	handler: () => {
		antennasCache.delete();
		_fetch_();
	},
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.manageAntennas,
	icon: 'ti ti-antenna',
}));

onActivated(() => {
	antennasCache.fetch();
});
</script>

<style lang="scss" module>
.add {
	margin: 0 auto 16px auto;
}

.antenna {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;

	&:hover {
		border: solid 1px var(--MI_THEME-accent);
	}
}

.main {
	display: block;
	flex: 1;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}
}

.status {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 4px;
	font-size: 0.8em;
}

.statusChip {
	padding: 2px 8px;
	border-radius: 6px;
	font-size: 0.9em;

	&.active {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
	}

	&.inactive {
		background: var(--MI_THEME-buttonBg);
		opacity: 0.7;
	}
}

.lastUsed {
	opacity: 0.7;
}

.actions {
	flex-shrink: 0;
}
</style>
