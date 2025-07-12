<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkHistoryViewer
	endpoint="following/history"
	:actionConfig="ACTION_CONFIG"
	i18nScope="_followHistory"
	:pageTitle="i18n.ts._followHistory.title"
	pageIcon="ti ti-history"
	spacerWidth="900px"
/>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
import MkHistoryViewer from '@/components/MkHistoryViewer.vue';

const ACTION_CONFIG = {
	follow: { icon: 'ti ti-user-plus', avatarUser: 'toUser', className: 'history--follow', tabIcon: 'ti ti-user-plus' },
	unFollow: { icon: 'ti ti-user-minus', avatarUser: 'toUser', className: 'history--unfollow', tabIcon: 'ti ti-user-minus' },
	wasFollow: { icon: 'ti ti-user-check', avatarUser: 'fromUser', className: 'history--wasfollow', tabIcon: 'ti ti-user-check' },
	wasUnFollow: { icon: 'ti ti-user-x', avatarUser: 'fromUser', className: 'history--wasunfollow', tabIcon: 'ti ti-user-x' },
	blocked: { icon: 'ti ti-ban', avatarUser: 'toUser', className: 'history--blocked', tabIcon: 'ti ti-ban' },
	unBlocked: { icon: 'ti ti-arrow-back', avatarUser: 'toUser', className: 'history--unblocked', tabIcon: 'ti ti-arrow-back' },
	wasBlocked: { icon: 'ti ti-lock', avatarUser: 'fromUser', className: 'history--wasblocked', tabIcon: 'ti ti-lock' },
	wasUnBlocked: { icon: 'ti ti-lock-open', avatarUser: 'fromUser', className: 'history--wasunblocked', tabIcon: 'ti ti-lock-open' },
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

		&.history--follow {
			border-color: var(--MI_THEME-link);
		}

		&.history--unfollow {
			border-color: var(--MI_THEME-error);
		}

		&.history--wasfollow {
			border-color: var(--MI_THEME-success);
		}

		&.history--wasunfollow {
			border-color: var(--MI_THEME-error);
		}

		&.history--blocked {
			border-color: var(--MI_THEME-warn);
		}

		&.history--unblocked {
			border-color: var(--MI_THEME-renote);
		}

		&.history--wasblocked {
			border-color: var(--MI_THEME-warn);
		}

		&.history--wasunblocked {
			border-color: var(--MI_THEME-renote);
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
