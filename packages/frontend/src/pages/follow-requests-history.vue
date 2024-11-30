<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="800">
		<MkHorizontalSwipe v-model:tab="tab" :tabs="headerTabs">
			<div :key="tab" class="_gaps">
				<MkPagination ref="paginationComponent" :pagination="pagination">
					<template #empty>
						<div class="_fullinfo">
							<img :src="infoImageUrl" class="_ghost"/>
							<div>{{ i18n.ts._followRequestHistory.empty }}</div>
						</div>
					</template>
					<template #default="{items}">
						<div class="mk-follow-requests _gaps">
							<div v-for="history in items" :key="history.id" class="history _panel" :class="getActionConfig(history.type).className">
								<MkAvatar class="avatar" :user="history[getActionConfig(history.type).avatarUser]" indicator link preview/>
								<div class="body">
									<div class="content">
										<div class="users">
											<MkA v-user-preview="history.fromUser.id" class="name" :to="userPage(history.fromUser)">
												<MkUserName :user="history.fromUser"/>
											</MkA>
											<i class="ti ti-arrow-right"></i>
											<MkA v-user-preview="history.toUser.id" class="name" :to="userPage(history.toUser)">
												<MkUserName :user="history.toUser"/>
											</MkA>
										</div>
										<p class="action">
											<i :class="getActionConfig(history.type).icon"></i>
											{{ getActionText(history.type, history) }}
										</p>
									</div>
									<div class="info">
										<time class="timestamp" :datetime="history.timestamp">{{ dateString(history.timestamp) }}</time>
									</div>
								</div>
							</div>
						</div>
					</template>
				</MkPagination>
			</div>
		</MkHorizontalSwipe>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { shallowRef, computed, ref } from 'vue';
import MkPagination, { type Paging } from '@/components/MkPagination.vue';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { infoImageUrl } from '@/instance.js';
import { $i } from '@/account.js';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import { dateString } from '@/filters/date.js';

const ACTION_CONFIG = {
	sent: {
		icon: 'ti ti-send',
		avatarUser: 'toUser',
		className: 'history--sent',
		themeColor: 'link',
		tabIcon: 'ti ti-send',
	},
	received: {
		icon: 'ti ti-inbox',
		avatarUser: 'fromUser',
		className: 'history--received',
		themeColor: 'hashtag',
		tabIcon: 'ti ti-inbox',
	},
	approved: {
		icon: 'ti ti-check',
		avatarUser: 'fromUser',
		className: 'history--approved',
		themeColor: 'success',
		tabIcon: 'ti ti-check',
	},
	rejected: {
		icon: 'ti ti-x',
		avatarUser: 'fromUser',
		className: 'history--rejected',
		themeColor: 'error',
		tabIcon: 'ti ti-x',
	},
	wasApproved: {
		icon: 'ti ti-user-check',
		avatarUser: 'toUser',
		className: 'history--approved',
		themeColor: 'success',
		tabIcon: 'ti ti-user-check',
	},
	wasRejected: {
		icon: 'ti ti-user-x',
		avatarUser: 'toUser',
		className: 'history--rejected',
		themeColor: 'error',
		tabIcon: 'ti ti-user-x',
	},
	wasBlocked: {
		icon: 'ti ti-ban',
		avatarUser: 'toUser',
		className: 'history--blocked',
		themeColor: 'warn',
		tabIcon: 'ti ti-ban',
	},
	wasUnBlocked: {
		icon: 'ti ti-arrow-back',
		avatarUser: 'toUser',
		className: 'history--unblocked',
		themeColor: 'renote',
		tabIcon: 'ti ti-arrow-back',
	},
} as const;

const paginationComponent = shallowRef<InstanceType<typeof MkPagination>>();
const tab = ref('all');

const pagination = computed<Paging>(() => ({
	endpoint: 'following/requests/history',
	limit: 10,
	params: {
		...(tab.value !== 'all' ? { type: tab.value } : {}),
	},
}));

function getActionConfig(type: string) {
	return ACTION_CONFIG[type as keyof typeof ACTION_CONFIG] ?? {
		icon: 'ti ti-question',
		avatarUser: 'toUser',
		className: '',
		themeColor: 'accent',
		tabIcon: 'ti ti-question',
	};
}

function getActionText(type: string, history: any) {
	const sourceUser = history.fromUser?.name || history.fromUser?.username || '(unknown)';
	const targetUser = history.toUser?.name || history.toUser?.username || '(unknown)';

	switch (type) {
		case 'sent':
			return i18n.t('_followRequestHistory.sent', { user: targetUser });
		case 'received':
			return i18n.t('_followRequestHistory.received', { user: sourceUser });
		case 'approved':
			return i18n.t('_followRequestHistory.approved', { user: sourceUser });
		case 'rejected':
			return i18n.t('_followRequestHistory.rejected', { user: sourceUser });
		case 'wasApproved':
			return i18n.t('_followRequestHistory.wasApproved', { user: targetUser });
		case 'wasRejected':
			return i18n.t('_followRequestHistory.wasRejected', { user: targetUser });
		case 'wasBlocked':
			return i18n.t('_followRequestHistory.wasBlocked', { user: targetUser });
		case 'wasUnBlocked':
			return i18n.t('_followRequestHistory.wasUnBlocked', { user: targetUser });
		default:
			return type;
	}
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [
	{
		key: 'all',
		title: i18n.ts._followRequestHistory.types.all,
		icon: 'ti ti-history',
	},
	...Object.entries(ACTION_CONFIG).map(([key, config]) => ({
		key,
		title: i18n.ts._followRequestHistory.types[key],
		icon: config.tabIcon,
	})),
]);

definePageMetadata(() => ({
	title: i18n.ts._followRequestHistory.title,
	icon: 'ti ti-history',
}));
</script>

	<style lang="scss" scoped>
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

			&.history--blocked {
				border-color: var(--MI_THEME-warn);
			}

			&.history--unblocked {
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
