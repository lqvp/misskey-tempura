<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-panel :class="$style.root">
	<header :class="$style.header">
		<i v-if="signin.success" class="ti ti-check" :class="[$style.icon, $style.succ]"></i>
		<i v-else class="ti ti-circle-x" :class="[$style.icon, $style.fail]"></i>
		<code class="_monospace" :class="$style.ip">{{ signin.ip }}</code>
		<span v-if="signin.country" :class="$style.tag" :title="i18n.ts._loginRisk.country">{{ signin.country }}</span>
		<span v-if="signin.asn != null" :class="$style.tag" :title="i18n.ts._loginRisk.asn">AS{{ signin.asn }}</span>
		<span v-if="signin.riskScore != null" :class="[$style.tag, $style.score]" :title="i18n.ts._loginRisk.riskScore">{{ i18n.ts._loginRisk.riskScore }} {{ signin.riskScore }}</span>
		<span v-if="signin.challenge != null" :class="[$style.tag, $style[`challenge_${signin.challenge}`]]" :title="i18n.ts._loginRisk.challengeStatus">{{ challengeLabel }}</span>
		<MkTime :time="signin.createdAt" :class="$style.time"/>
	</header>
	<div v-if="(signin.riskReasons ?? []).length > 0" :class="$style.reasons" role="list" :aria-label="i18n.ts._loginRisk.reasons">
		<span v-for="reason in signin.riskReasons" :key="reason" :class="$style.reason" role="listitem">{{ reasonLabel(reason) }}</span>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	signin: Misskey.entities.Signin;
}>();

const challengeLabel = computed(() => {
	switch (props.signin.challenge) {
		case 'emailCode': return i18n.ts._loginRisk.challengeStatusEmailCode;
		case 'passed': return i18n.ts._loginRisk.challengeStatusPassed;
		case 'failed': return i18n.ts._loginRisk.challengeStatusFailed;
		default: return '';
	}
});

function reasonLabel(reason: string): string {
	const labels: Record<string, string> = i18n.ts._loginRisk._reasons;
	return labels[reason] ?? reason;
}
</script>

<style lang="scss" module>
.root {
	padding: 12px 16px;
	border-radius: 8px;
	margin-bottom: 8px;
}

.header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.icon {
	&.succ {
		color: var(--MI_THEME-success);
	}

	&.fail {
		color: var(--MI_THEME-error);
	}
}

.ip {
	flex-shrink: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.tag {
	font-size: 0.85em;
	padding: 1px 6px;
	border-radius: 4px;
	background: var(--MI_THEME-buttonBg);
}

.score {
	font-weight: bold;
}

.challenge_emailCode {
	background: var(--MI_THEME-infoBg);
	color: var(--MI_THEME-infoFg);
}

.challenge_passed {
	color: var(--MI_THEME-success);
}

.challenge_failed {
	background: var(--MI_THEME-infoWarnBg);
	color: var(--MI_THEME-infoWarnFg);
}

.time {
	margin-left: auto;
	opacity: 0.7;
}

.reasons {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}

.reason {
	font-size: 0.85em;
	padding: 1px 8px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
}
</style>
