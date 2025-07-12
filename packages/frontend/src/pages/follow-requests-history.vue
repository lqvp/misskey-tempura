<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<MkHistoryViewer
		endpoint="following/requests/history"
		:actionConfig="ACTION_CONFIG"
		i18nScope="_followRequestHistory"
		:pageTitle="i18n.ts._followRequestHistory.title"
		pageIcon="ti ti-history-toggle"
		spacerWidth="800px"
	/>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
import MkHistoryViewer from '@/components/MkHistoryViewer.vue';

const ACTION_CONFIG = {
	sent: { icon: 'ti ti-send', avatarUser: 'toUser', className: 'history--sent', tabIcon: 'ti ti-send' },
	received: { icon: 'ti ti-inbox', avatarUser: 'fromUser', className: 'history--received', tabIcon: 'ti ti-inbox' },
	approved: { icon: 'ti ti-check', avatarUser: 'fromUser', className: 'history--approved', tabIcon: 'ti ti-check' },
	rejected: { icon: 'ti ti-x', avatarUser: 'fromUser', className: 'history--rejected', tabIcon: 'ti ti-x' },
	wasApproved: { icon: 'ti ti-user-check', avatarUser: 'toUser', className: 'history--approved', tabIcon: 'ti ti-user-check' },
	wasRejected: { icon: 'ti ti-user-x', avatarUser: 'toUser', className: 'history--rejected', tabIcon: 'ti ti-user-x' },
} as const;
</script>

<style lang="scss" scoped>
.unknown-user {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 42px;
	height: 42px;
	border-radius: 8px;
	background: var(--panel);
	color: var(--fg);
	font-size: 1.2em;
	opacity: 0.5;
}

.mk-follow-requests {
	> .history {
		display: flex;
		padding: 16px;
		border: 2px solid transparent;
		transition: border-color 0.2s ease;

		&.history--sent {
		border-color: var(--MI_THEME-link);
		}

		&.history--received {
			border-color: var(--MI_THEME-hashtag);
		}

		&.history--approved {
			border-color: var(--MI_THEME-success);
		}

		&.history--rejected {
			border-color: var(--MI_THEME-error);
		}

		> .avatar {
			display: block;
			flex-shrink: 0;
			margin: 0 12px 0 0;
			width: 42px;
			height: 42px;
			border-radius: 8px;
		}

		> .body {
			display: flex;
			flex-direction: column;
			flex: 1;
			gap: 4px;

			> .content {
				> .users {
					display: flex;
					align-items: center;
					gap: 8px;
					font-size: 15px;

					> .ti {
						opacity: 0.7;
					}
				}

				> .action {
					margin: 4px 0 0 0;
					opacity: 0.7;
					font-size: 14px;

					> .ti {
						margin-right: 4px;
					}
				}
			}

			> .info {
				font-size: 0.9em;
				opacity: 0.7;

				> .timestamp {
					margin-right: 8px;
				}
			}
		}
	}
}
</style>
