/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { escapeHtml } from '@/misc/escape-html.js';

export type SsoUnlinkNotifyDeps = {
	notificationService: {
		createNotification: (userId: string, type: 'app', data: { appAccessTokenId: null; customBody: string; customHeader: string; customIcon: null }) => unknown;
	};
	emailService: {
		sendEmail: (to: string, subject: string, html: string, text: string) => Promise<unknown>;
	};
	userProfilesRepository: {
		findOneBy: (where: { userId: string }) => Promise<{ email: string | null; emailVerified: boolean } | null>;
	};
	onError?: (userId: string, err: unknown) => void;
};

/**
 * 管理者が clientId を変えたために SSO 連携が解除されたユーザーへ知らせる。
 * アプリ内通知と、確認済みのメールアドレスがあればメールを送る。1人の失敗で他の人への通知を止めない。
 * providerLabel は管理者が付けたプロバイダーの表示名 (または key) で、clientId などの設定値は含めない
 */
export async function notifySsoLinksRemoved(deps: SsoUnlinkNotifyDeps, userIds: string[], providerLabel: string): Promise<void> {
	const header = 'SSO連携が解除されました / SSO link removed';
	const body = `「${providerLabel}」のSSO連携が、サーバーの設定変更により解除されました。SSOでログインするには、設定のセキュリティから連携し直してください。パスワードなどの他のログイン方法は、そのまま使えます。心当たりがない場合は、サーバーの管理者に確認してください。\n` +
		`The SSO link for "${providerLabel}" was removed because the server settings changed. To sign in with SSO again, link it from Settings > Security. Your other sign-in methods are not affected. If you did not expect this, contact the server administrator.`;

	for (const userId of userIds) {
		try {
			await deps.notificationService.createNotification(userId, 'app', {
				appAccessTokenId: null,
				customBody: body,
				customHeader: header,
				customIcon: null,
			});

			const profile = await deps.userProfilesRepository.findOneBy({ userId });
			if (profile?.email != null && profile.emailVerified) {
				await deps.emailService.sendEmail(profile.email, header, escapeHtml(body).replace(/\n/g, '<br>'), body);
			}
		} catch (err) {
			deps.onError?.(userId, err);
		}
	}
}
