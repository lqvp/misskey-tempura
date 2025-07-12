<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer v-if="$i?.policies.canReadFollowHistory">
	<template #header>
		<MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/>
	</template>
	<div class="_spacer" :style="`--MI_SPACER-w: ${spacerWidth}`">
		<MkSwiper v-model:tab="tab" :tabs="headerTabs">
			<div :key="tab" class="_gaps">
				<MkPagination :paginator="paginator">
					<template #empty>
						<div class="_fullinfo">
							<MkResult type="empty" :text="i18n.t(`${i18nScope}.empty` as any)"/>
						</div>
					</template>
					<template #default="{ items }: { items: HistoryItem[] }">
						<!-- 以下、共通のリスト表示テンプレート... -->
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
												v-user-preview="history.fromUser!.id"
												class="name"
												:to="userPage(history.fromUser!)"
											>
												<MkUserName v-if="hasUserProps(history.fromUser)" :user="history.fromUser!"/>
												<span v-else>unknown user</span>
											</MkA>
											<span v-else>unknown user</span>
											<i class="ti ti-arrow-right"></i>
											<MkA
												v-if="hasUserProps(history.toUser)"
												v-user-preview="history.toUser!.id"
												class="name"
												:to="userPage(history.toUser!)"
											>
												<MkUserName v-if="hasUserProps(history.toUser)" :user="history.toUser!"/>
												<span v-else>unknown user</span>
											</MkA>
											<span v-else>unknown user</span>
										</div>
										<p class="action">
											<i :class="getActionConfig(history.type).icon"></i>
											<Mfm
												:text="getActionText(history.type, history)"
												:author="(getActionConfig(history.type).avatarUser === 'fromUser' ? history.fromUser : history.toUser)!"
												:plain="true"
												:emojiUrls="(getActionConfig(history.type).avatarUser === 'fromUser' ? history.fromUser!.emojis : history.toUser!.emojis)!"
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
		</MkSwiper>
	</div>
</MkStickyContainer>
<div v-else>
	<XNotFound/>
</div>
</template>

<script lang="ts" setup>
import type { Endpoints } from 'misskey-js';
import { userPage } from '@/filters/user.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import MkSwiper from '@/components/MkSwiper.vue';
import { dateString } from '@/filters/date.js';
import XNotFound from '@/pages/not-found.vue';
import MkPagination from '@/components/MkPagination.vue';
import { useHistoryPage } from '@/composables/useHistoryPage.js';

type HistoryEndpoint = 'following/history' | 'following/requests/history';
type HistoryItem = Endpoints[HistoryEndpoint]['res'][number];

const props = withDefaults(defineProps<{
	endpoint: HistoryEndpoint;
	actionConfig: Record<string, any>;
	i18nScope: string;
	pageTitle: string;
	pageIcon: string;
	spacerWidth?: string;
}>(), {
	spacerWidth: '900px',
});

const {
	tab,
	paginator,
	getActionConfig,
	getActionText,
	headerActions,
	headerTabs,
} = useHistoryPage(props.endpoint, props.actionConfig, props.i18nScope);

function hasUserProps(user: any): boolean {
	return !!(user && (user.id || user.username || user.avatarUrl));
}

definePage(() => ({
	title: props.pageTitle,
	icon: props.pageIcon,
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
