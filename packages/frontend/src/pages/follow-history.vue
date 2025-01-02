<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer v-if="$i.policies.canReadFollowHistory">
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="800">
		<MkHorizontalSwipe v-model:tab="tab" :tabs="headerTabs">
			<div :key="tab" class="_gaps">
				<MkPagination ref="paginationComponent" :pagination="pagination">
					<template #empty>
						<div class="_fullinfo">
							<img :src="infoImageUrl" class="_ghost"/>
							<div>{{ i18n.ts._followHistory.empty }}</div>
						</div>
					</template>
					<template #default="{items}">
						<div class="mk-follow-requests _gaps">
							<div v-for="history in items" :key="history.id" class="history _panel" :class="getActionConfig(history.type).className">
								<MkAvatar
									v-if="hasUserProps(history[getActionConfig(history.type).avatarUser])"
									class="avatar"
									:user="history[getActionConfig(history.type).avatarUser]"
									indicator
									link
									preview
								/>
								<div v-else class="unknown-user">
									<span>?</span>
								</div>
								<div class="body">
									<div class="content">
										<div class="users">
											<MkA
												v-if="hasUserProps(history.fromUser)"
												v-user-preview="history.fromUser.id"
												class="name"
												:to="userPage(history.fromUser)"
											>
												<MkUserName v-if="hasUserProps(history.fromUser)" :user="history.fromUser"/>
												<span v-else>unknown user</span>
											</MkA>
											<span v-else>unknown user</span>
											<i class="ti ti-arrow-right"></i>
											<MkA
												v-if="hasUserProps(history.toUser)"
												v-user-preview="history.toUser.id"
												class="name"
												:to="userPage(history.toUser)"
											>
												<MkUserName v-if="hasUserProps(history.toUser)" :user="history.toUser"/>
												<span v-else>unknown user</span>
											</MkA>
											<span v-else>unknown user</span>
										</div>
										<p class="action">
											<i :class="getActionConfig(history.type).icon"></i>
											<Mfm
												:text="getActionText(history.type, history)"
												:author="getActionConfig(history.type).avatarUser === 'fromUser' ? history.fromUser : history.toUser"
												:plain="true"
												:emojiUrls="getActionConfig(history.type).avatarUser === 'fromUser' ? history.fromUser.emojis : history.toUser.emojis"
											/>
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
<div v-else>
	<XNotFound/>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { shallowRef, computed, ref } from 'vue';
import MkPagination, { type Paging } from '@/components/MkPagination.vue';
import MkButton from '@/components/MkButton.vue';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { infoImageUrl } from '@/instance.js';
import { $i } from '@/account.js';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import { dateString } from '@/filters/date.js';
import XNotFound from '@/pages/not-found.vue';

function hasUserProps(user: any): boolean {
	return !!(user && (user.id || user.username || user.avatarUrl));
}

const ACTION_CONFIG = {
	follow: {
		icon: 'ti ti-user-plus',
		avatarUser: 'toUser',
		className: 'history--follow',
		themeColor: 'link',
		tabIcon: 'ti ti-user-plus',
	},
	unFollow: {
		icon: 'ti ti-user-minus',
		avatarUser: 'toUser',
		className: 'history--unfollow',
		themeColor: 'error',
		tabIcon: 'ti ti-user-minus',
	},
	wasFollow: {
		icon: 'ti ti-user-check',
		avatarUser: 'fromUser',
		className: 'history--wasfollow',
		themeColor: 'success',
		tabIcon: 'ti ti-user-check',
	},
	wasUnFollow: {
		icon: 'ti ti-user-x',
		avatarUser: 'fromUser',
		className: 'history--wasunfollow',
		themeColor: 'error',
		tabIcon: 'ti ti-user-x',
	},
	blocked: {
		icon: 'ti ti-ban',
		avatarUser: 'toUser',
		className: 'history--blocked',
		themeColor: 'warn',
		tabIcon: 'ti ti-ban',
	},
	unBlocked: {
		icon: 'ti ti-arrow-back',
		avatarUser: 'toUser',
		className: 'history--unblocked',
		themeColor: 'renote',
		tabIcon: 'ti ti-arrow-back',
	},
	wasBlocked: {
		icon: 'ti ti-lock',
		avatarUser: 'fromUser',
		className: 'history--wasblocked',
		themeColor: 'warn',
		tabIcon: 'ti ti-lock',
	},
	wasUnBlocked: {
		icon: 'ti ti-lock-open',
		avatarUser: 'fromUser',
		className: 'history--wasunblocked',
		themeColor: 'renote',
		tabIcon: 'ti ti-lock-open',
	},
} as const;

const paginationComponent = shallowRef<InstanceType<typeof MkPagination>>();
const tab = ref('all');

const pagination = computed<Paging>(() => ({
	endpoint: 'following/history',
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
		case 'follow':
			return i18n.t('_followHistory.follow', { user: targetUser });
		case 'unFollow':
			return i18n.t('_followHistory.unFollow', { user: targetUser });
		case 'wasFollow':
			return i18n.t('_followHistory.wasFollow', { user: sourceUser });
		case 'wasUnFollow':
			return i18n.t('_followHistory.wasUnFollow', { user: sourceUser });
		case 'blocked':
			return i18n.t('_followHistory.blocked', { user: targetUser });
		case 'unBlocked':
			return i18n.t('_followHistory.unBlocked', { user: targetUser });
		case 'wasBlocked':
			return i18n.t('_followHistory.wasBlocked', { user: sourceUser });
		case 'wasUnBlocked':
			return i18n.t('_followHistory.wasUnBlocked', { user: sourceUser });
		default:
			return type;
	}
}

const deleteHistory = () => {
	os.confirm({
		type: 'warning',
		text: i18n.ts._followHistory.deleteConfirm,
	}).then(({ canceled }) => {
		if (canceled) return;

		os.apiWithDialog('following/history', {
			delete: true,
		}).then(() => {
			paginationComponent.value?.reload();
		});
	});
};

const headerActions = computed(() => [{
	icon: 'ti ti-trash',
	text: i18n.ts._followHistory.deleteAll,
	handler: deleteHistory,
}]);

const headerTabs = computed(() => [
	{
		key: 'all',
		title: i18n.ts._followHistory.types.all,
		icon: 'ti ti-history',
	},
	...Object.entries(ACTION_CONFIG).map(([key, config]) => ({
		key,
		title: i18n.ts._followHistory.types[key],
		icon: config.tabIcon,
	})),
]);

definePageMetadata(() => ({
	title: i18n.ts._followHistory.title,
	icon: 'ti ti-history',
}));
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
