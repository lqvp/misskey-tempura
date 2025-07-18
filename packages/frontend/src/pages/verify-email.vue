<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithAnimBg>
	<div :class="$style.formContainer">
		<div :class="[$style.form, '_panel']">
			<div :class="$style.icon"><i :class="iconClass"></i></div>
			<div :class="$style.title">{{ title }}</div>
			<div :class="$style.message">
				<span v-for="(line, i) in messageLines" :key="i">
					{{ line }}<br v-if="i !== messageLines.length - 1"/>
				</span>
			</div>
			<div :class="$style.actions">
				<MkButton v-if="status === 'success'" gradate large rounded link to="/">
					{{ i18n.ts.gotIt }}
				</MkButton>
				<MkButton v-else-if="status === 'error'" large rounded link to="/settings/email">
					{{ i18n.ts.goToEmailSettings }}
				</MkButton>
			</div>
		</div>
	</div>
</PageWithAnimBg>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from '@/router.js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const status = ref<'pending' | 'success' | 'error'>('pending');
const message = ref('');
const router = useRouter();

const iconClass = computed(() =>
	status.value === 'success'
		? 'ti ti-check'
		: status.value === 'error'
			? 'ti ti-circle-x'
			: 'ti ti-loader-2',
);

const title = computed(() =>
	status.value === 'success'
		? i18n.ts.verifyEmail.successTitle
		: status.value === 'error'
			? i18n.ts.verifyEmail.failureTitle
			: '',
);

const messageLines = computed(() => message.value.split('\n'));

async function verify(code: string) {
	try {
		const res = await window.fetch(`/api/verify-email/${encodeURIComponent(code)}`);
		const data = await res.json();
		if (data.status === 'success') {
			status.value = 'success';
			message.value = i18n.ts.verifyEmail.successMessage;
		} else {
			status.value = 'error';
			message.value = i18n.ts.verifyEmail.failureMessage;
		}
	} catch {
		status.value = 'error';
		message.value = i18n.ts.verifyEmail.failureMessage;
	}
}

onMounted(() => {
	const code = router.current.props.get('code') as string | undefined;
	if (code) {
		verify(code);
	} else {
		status.value = 'error';
		message.value = i18n.ts.verifyEmail.failureMessage;
	}
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.verifyEmail.title,
}));
</script>

<style lang="scss" module>
.formContainer {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 32px;
}
.form {
	max-width: 400px;
	width: 100%;
	padding: 32px 24px;
	text-align: center;
	border-radius: var(--MI-radius);
}
.icon {
	font-size: 32px;
	margin-bottom: 16px;
	color: var(--MI_THEME-accent);
}
.title {
	font-size: 1.3rem;
	font-weight: bold;
	margin-bottom: 12px;
}
.message {
	margin-bottom: 24px;
	opacity: 0.85;
	background: var(--MI_THEME-bg);
	padding: 12px 10px;
	border-radius: 8px;
	display: inline-block;
	max-width: 100%;
	word-break: break-word;
}
.actions {
	display: flex;
	justify-content: center;
}
</style>

