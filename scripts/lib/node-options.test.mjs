/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { hasUserSemiSpaceSetting, withDefaultSemiSpaceSize } from './node-options.mjs';

test('adds the upper bound when the user did not set semi-space', () => {
	assert.equal(withDefaultSemiSpaceSize('', []), '--max-semi-space-size=4');
	assert.equal(withDefaultSemiSpaceSize('--enable-source-maps', []), '--enable-source-maps --max-semi-space-size=4');
});

test('keeps the value the user set through NODE_OPTIONS', () => {
	assert.equal(withDefaultSemiSpaceSize('--max-semi-space-size=32', []), '--max-semi-space-size=32');
	assert.equal(hasUserSemiSpaceSetting('--max-semi-space-size 32', []), true);
});

test('keeps the value the user set through the command line', () => {
	assert.equal(hasUserSemiSpaceSetting('', ['--max-semi-space-size=32']), true);
	assert.equal(hasUserSemiSpaceSetting('', ['--max-semi-space-size', '32']), true);
});

test('treats the underscore spelling as the same option', () => {
	assert.equal(hasUserSemiSpaceSetting('--max_semi_space_size=32', []), true);
	assert.equal(hasUserSemiSpaceSetting('', ['--max_semi_space_size=32']), true);
});

test('treats the minimum semi-space as a user setting', () => {
	assert.equal(hasUserSemiSpaceSetting('', ['--min-semi-space-size=8']), true);
	assert.equal(hasUserSemiSpaceSetting('', ['--min_semi_space_size=8']), true);
});

test('does not mistake a longer option name for a semi-space setting', () => {
	assert.equal(hasUserSemiSpaceSetting('--max-old-space-size=4096', []), false);
	assert.equal(hasUserSemiSpaceSetting('--semi-space-size=32', []), false);
});
