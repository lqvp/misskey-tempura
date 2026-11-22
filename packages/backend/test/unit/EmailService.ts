/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { EmailService } from '@/core/EmailService.js';
import type { Config } from '@/config.js';
import type { MiMeta, UserProfilesRepository } from '@/models/_.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { UtilityService } from '@/core/UtilityService.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';

const transport = vi.hoisted(() => ({
	juiceLoaded: false,
	nodemailerLoaded: false,
	sendMail: vi.fn(),
	createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => {
	transport.nodemailerLoaded = true;
	transport.createTransport.mockReturnValue({ sendMail: transport.sendMail });
	return { createTransport: transport.createTransport };
});

vi.mock('juice', async importOriginal => {
	transport.juiceLoaded = true;
	return importOriginal();
});

describe('EmailService lazy send dependencies', () => {
	const meta = mockDeep<MiMeta>({
		enableEmail: false,
		smtpUser: null,
		smtpHost: null,
		smtpPort: null,
		smtpPass: null,
		smtpSecure: false,
		name: 'Example',
		email: 'sender@example.com',
		logoImageUrl: null,
		iconUrl: null,
	});
	const loggerService = mockDeep<LoggerService>();
	loggerService.getLogger.mockReturnValue(mockDeep<Logger>());
	const service = new EmailService(
		mockDeep<Config>({ url: 'https://example.com', host: 'example.com' }),
		meta,
		mockDeep<UserProfilesRepository>(),
		loggerService,
		mockDeep<UtilityService>(),
		mockDeep<HttpRequestService>(),
	);

	beforeEach(() => {
		meta.enableEmail = true;
		transport.sendMail.mockReset().mockResolvedValue({ messageId: 'message' });
		transport.createTransport.mockClear();
	});

	test('disabled email does not import CSS processing', async () => {
		meta.enableEmail = false;
		await service.sendEmail('recipient@example.com', '', '', '');
		expect(transport.juiceLoaded).toBe(false);
		expect(transport.nodemailerLoaded).toBe(false);
		expect(transport.createTransport).not.toHaveBeenCalled();
	});

	test('sends sanitized HTML with inlined CSS after enabling email', async () => {
		meta.enableEmail = true;
		await service.sendEmail('recipient@example.com', 'Subject', '<p>Hello</p><script>bad()</script>', 'Hello');
		expect(transport.juiceLoaded).toBe(true);
		expect(transport.nodemailerLoaded).toBe(true);
		const mail = transport.sendMail.mock.calls[0][0];
		expect(mail).toMatchObject({ to: 'recipient@example.com', subject: 'Subject', text: 'Hello' });
		expect(mail.html).toContain('<p>Hello</p>');
		expect(mail.html).toContain('style=');
		expect(mail.html).not.toContain('<script>');
	});

	test('supports empty content on subsequent sends', async () => {
		await service.sendEmail('recipient@example.com', '', '', '');
		expect(transport.sendMail).toHaveBeenCalledOnce();
		expect(transport.sendMail.mock.calls[0][0]).toMatchObject({ subject: '', text: '' });
	});

	test('preserves transport rejection', async () => {
		const error = new Error('SMTP unavailable');
		transport.sendMail.mockRejectedValueOnce(error);
		await expect(service.sendEmail('recipient@example.com', 'Subject', '', '')).rejects.toBe(error);
	});
});
