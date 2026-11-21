/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import type { Config } from '@/config.js';
import type { MiMeta, MiUserSecurityKey, UserSecurityKeysRepository } from '@/models/_.js';

const library = vi.hoisted(() => ({
	loaded: false,
	generateRegistrationOptions: vi.fn(),
	generateAuthenticationOptions: vi.fn(),
	verifyRegistrationResponse: vi.fn(),
	verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('@simplewebauthn/server', () => {
	library.loaded = true;
	return library;
});

describe('WebAuthnService lazy dependencies', () => {
	const redis = mockDeep<Redis>();
	const repository = mockDeep<UserSecurityKeysRepository>();
	const service = new WebAuthnService(
		mockDeep<Config>({ url: 'https://example.com', hostname: 'example.com', host: 'example.com' }),
		mockDeep<MiMeta>({ name: 'Example' }),
		redis,
		repository,
	);
	const response = mockDeep<AuthenticationResponseJSON>({ id: 'key' });
	const key = mockDeep<MiUserSecurityKey>({ id: 'key', userId: 'user', publicKey: 'AQID', counter: 1, transports: ['internal'] });

	beforeEach(() => {
		vi.clearAllMocks();
		repository.findBy.mockResolvedValue([key]);
		repository.findOneBy.mockResolvedValue(key);
		redis.get.mockResolvedValue('challenge');
		redis.getdel.mockResolvedValue('challenge');
		library.generateRegistrationOptions.mockResolvedValue({ challenge: 'registration' });
		library.generateAuthenticationOptions.mockResolvedValue({ challenge: 'authentication' });
		library.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: { newCounter: 2, credentialDeviceType: 'singleDevice', credentialBackedUp: false },
		});
	});

	test('synchronous relying-party lookup does not import WebAuthn', () => {
		expect(service.getRelyingParty()).toMatchObject({ rpId: 'example.com', rpName: 'Example' });
		expect(library.loaded).toBe(false);
	});

	test('generates registration options and stores the challenge', async () => {
		await expect(service.initiateRegistration('user', 'username')).resolves.toEqual({ challenge: 'registration' });
		expect(library.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({ userID: new TextEncoder().encode('user') }));
		expect(redis.setex).toHaveBeenCalledWith('webauthn:registrationChallenge:user', 90, 'registration');
	});

	test('verifies registration and returns the credential', async () => {
		library.verifyRegistrationResponse.mockResolvedValueOnce({
			verified: true,
			registrationInfo: {
				credential: { id: 'key', publicKey: new Uint8Array([1]), counter: 0 },
				fmt: 'none',
			},
		});
		const registration: RegistrationResponseJSON = {
			id: 'key',
			rawId: 'key',
			response: { clientDataJSON: '', attestationObject: '', transports: ['internal'] },
			clientExtensionResults: {},
			type: 'public-key',
		};
		await expect(service.verifyRegistration('user', registration)).resolves.toMatchObject({ credentialID: 'key', fmt: 'none', transports: ['internal'] });
		expect(redis.del).toHaveBeenCalledWith('webauthn:registrationChallenge:user');
	});

	test('rejects registration without a challenge', async () => {
		redis.get.mockResolvedValueOnce(null);
		await expect(service.verifyRegistration('user', mockDeep<RegistrationResponseJSON>())).rejects.toThrow('challenge not found');
		expect(library.verifyRegistrationResponse).not.toHaveBeenCalled();
	});

	test('generates authentication options for an existing key', async () => {
		await expect(service.initiateAuthentication('user')).resolves.toEqual({ challenge: 'authentication' });
		expect(redis.setex).toHaveBeenCalledWith('webauthn:authenticationChallenge:user', 90, 'authentication');
	});

	test('rejects authentication options for an empty key list', async () => {
		repository.findBy.mockResolvedValueOnce([]);
		await expect(service.initiateAuthentication('user')).rejects.toThrow('no keys found');
		expect(library.generateAuthenticationOptions).not.toHaveBeenCalled();
	});

	test('generates passkey options and stores the challenge', async () => {
		await expect(service.initiateSignInWithPasskeyAuthentication('context')).resolves.toEqual({ challenge: 'authentication' });
		expect(redis.setex).toHaveBeenCalledWith('webauthn:passkeyChallenge:context', 90, 'authentication');
	});

	test('verifies passkey sign-in and updates the counter', async () => {
		await expect(service.verifySignInWithPasskeyAuthentication('context', response)).resolves.toBe('user');
		expect(repository.update).toHaveBeenCalledWith({ id: 'key' }, expect.objectContaining({ counter: 2 }));
	});

	test('returns null for an unverified passkey', async () => {
		library.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false });
		await expect(service.verifySignInWithPasskeyAuthentication('context', response)).resolves.toBeNull();
		expect(repository.update).not.toHaveBeenCalled();
	});

	test('verifies authentication for an existing key', async () => {
		await expect(service.verifyAuthentication('user', response)).resolves.toBe(true);
		expect(repository.update).toHaveBeenCalledWith({ id: 'key', userId: 'user' }, expect.objectContaining({ counter: 2 }));
	});

	test('migrates a legacy EC key with lazily loaded CBOR helpers', async () => {
		const legacyKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
		repository.findOneBy.mockResolvedValueOnce({ ...key, publicKey: legacyKey, counter: 0 });
		await expect(service.verifyAuthentication('user', response)).resolves.toBe(true);
		expect(repository.update).toHaveBeenCalledWith({ id: 'key', userId: 'user' }, { publicKey: expect.not.stringMatching(legacyKey) });
	});

	test('returns false for unverified authentication', async () => {
		library.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false });
		await expect(service.verifyAuthentication('user', response)).resolves.toBe(false);
	});

	test('preserves verification failure handling', async () => {
		library.verifyAuthenticationResponse.mockRejectedValueOnce(new Error('invalid signature'));
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(service.verifyAuthentication('user', response)).rejects.toThrow('verification failed');
		errorLog.mockRestore();
	});
});
