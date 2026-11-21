/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'vitest';
import { hasUserSemiSpaceSetting, withDefaultSemiSpaceSize } from '../../../lib/startup/node-options.js';

test('adds the upper bound when the user did not set semi-space', () => {
	expect(withDefaultSemiSpaceSize('', [])).toBe('--max-semi-space-size=4');
	expect(withDefaultSemiSpaceSize('--enable-source-maps', [])).toBe('--enable-source-maps --max-semi-space-size=4');
});

test('keeps the value the user set through NODE_OPTIONS', () => {
	expect(withDefaultSemiSpaceSize('--max-semi-space-size=32', [])).toBe('--max-semi-space-size=32');
	expect(hasUserSemiSpaceSetting('--max-semi-space-size 32', [])).toBe(true);
});

test('keeps the value the user set through the command line', () => {
	expect(hasUserSemiSpaceSetting('', ['--max-semi-space-size=32'])).toBe(true);
	expect(hasUserSemiSpaceSetting('', ['--max-semi-space-size', '32'])).toBe(true);
});

test('treats the underscore spelling as the same option', () => {
	expect(hasUserSemiSpaceSetting('--max_semi_space_size=32', [])).toBe(true);
	expect(hasUserSemiSpaceSetting('', ['--max_semi_space_size=32'])).toBe(true);
});

test('treats the minimum semi-space as a user setting', () => {
	expect(hasUserSemiSpaceSetting('', ['--min-semi-space-size=8'])).toBe(true);
	expect(hasUserSemiSpaceSetting('', ['--min_semi_space_size=8'])).toBe(true);
});

test('does not mistake a longer option name for a semi-space setting', () => {
	expect(hasUserSemiSpaceSetting('--max-old-space-size=4096', [])).toBe(false);
	expect(hasUserSemiSpaceSetting('--semi-space-size=32', [])).toBe(false);
});
