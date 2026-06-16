<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.container">
		<MkLoading v-if="processing" />
		<div v-else-if="error" :class="$style.error">
			<i class="ti ti-alert-triangle" style="font-size: 2em; color: var(--MI_THEME-error);"></i>
			<p>{{ i18n.ts.oidcCallbackError }}</p>
			<MkButton @click="goToLogin">{{ i18n.ts.goBack }}</MkButton>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { i18n } from '@/i18n.js';
import { login } from '@/accounts.js';
import MkButton from '@/components/MkButton.vue';

const processing = ref(true);
const error = ref(false);

function goToLogin(): void {
	window.location.href = '/';
}

onMounted(async () => {
	const url = new URL(window.location.href);
	const code = url.searchParams.get('code');
	const oidcError = url.searchParams.get('oidc_error');

	if (oidcError) {
		processing.value = false;
		error.value = true;
		return;
	}

	if (code) {
		try {
			const res = await fetch('/api/oidc/exchange-code', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ code }),
			});

			if (!res.ok) {
				processing.value = false;
				error.value = true;
				return;
			}

			const data = await res.json();
			login(data.token);
			return;
		} catch {
			processing.value = false;
			error.value = true;
			return;
		}
	}

	processing.value = false;
	error.value = true;
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh;
}

.container {
	text-align: center;
	padding: 2em;
}

.error {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1em;
}
</style>
