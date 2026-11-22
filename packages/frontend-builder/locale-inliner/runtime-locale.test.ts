/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import MagicString from 'magic-string';
import { LocaleInliner } from '../locale-inliner.js';
import { blankLogger } from '../logger.js';
import { applyWithLocale } from './apply-with-locale.js';
import { collectRuntimeLocalePaths, pruneRuntimeLocale } from './runtime-locale.js';
import type { Locale } from 'i18n';

const locale = Object.freeze({
	static: 'Static',
	group: Object.freeze({ message: 'Hello {name}', other: 'Other' }),
	unused: 'Unused',
});

const ownSource = 'const data = await window.fetch(`/assets/locales/${lang}.${version}.json`).then(r => r.json()); const instance = markRaw(new I18n(data, false)); function update(value) { instance.locale = value; } export { instance as i18n, update };';

function fixture(body: string, ownExtra = '', facade = false) {
	const inliner = new LocaleInliner({
		outputDir: '.', scriptsDir: 'scripts', i18nFile: 'src/i18n.ts', logger: blankLogger,
		manifest: {
			'src/i18n.ts': { file: `scripts/${facade ? 'facade' : 'i18n'}.js` },
			entry: { file: 'scripts/entry.js' },
			...(facade ? { actual: { file: 'scripts/i18n.js' } } : {}),
		},
	});
	for (const chunk of inliner.chunks) {
		chunk.sourceCode = chunk.fileName === 'i18n.js' ? ownSource + ownExtra
			: chunk.fileName === 'facade.js' ? 'export { i18n, update } from "./i18n.js";'
				: `import { i18n as translated } from './i18n.js'; console.log(translated.ts.static); ${body}`;
	}
	inliner.collectsModifications();
	return inliner;
}

describe('runtime locale pruning', () => {
	it('omits runtime data when all accesses are inlined, including computed subtrees and tsx', () => {
		const inliner = fixture('consume(translated.ts.group, translated.tsx.group[key]);', '', true);
		assert.deepEqual(pruneRuntimeLocale(locale, inliner.runtimeLocalePaths), {});
		const entry = inliner.chunks.find(chunk => chunk.fileName === 'entry.js')!;
		const code = new MagicString(entry.sourceCode!);
		applyWithLocale(code, entry.modifications!, 'ja-JP', locale as unknown as Locale, blankLogger, {});
		assert.match(code.toString(), /Hello \{name\}/);
		assert.doesNotMatch(code.toString(), /translated/);
		const dictionary = inliner.chunks.find(chunk => chunk.fileName === 'i18n.js')!;
		const dictionaryCode = new MagicString(dictionary.sourceCode!);
		applyWithLocale(dictionaryCode, dictionary.modifications!, 'ja-JP', locale as unknown as Locale, blankLogger, {});
		assert.match(dictionaryCode.toString(), /JSON.parse\("\{\}"\)/);
	});

	it('keeps keys referenced by string-based t calls', () => {
		const inliner = fixture('translated.t("group.message", { name: "User" });');
		assert.deepEqual(pruneRuntimeLocale(locale, inliner.runtimeLocalePaths), { group: { message: 'Hello {name}' } });
	});

	it('keeps whole dynamically accessed locale subtrees', () => {
		const inliner = fixture('consume(translated.locale.group[key]);');
		assert.deepEqual(pruneRuntimeLocale(locale, inliner.runtimeLocalePaths), { group: locale.group });
	});

	for (const body of [
		'consume(translated.ts[key]);',
		'consume(translated.tsx[key]);',
		'consume(translated.ts);',
		'consume(translated);',
		'const alias = translated; consume(alias);',
		'translated.t(key);',
		'consume(translated.t);',
		'consume(translated.locale);',
		'export { translated };',
		'const namespace = import("./i18n.js");',
		'const namespace = import(target);',
		'export * from "./i18n.js";',
		'import * as namespace from "./i18n.js"; consume(namespace);',
	]) {
		it(`preserves the full dictionary for an unresolved access: ${body}`, () => {
			assert.equal(pruneRuntimeLocale(locale, fixture(body).runtimeLocalePaths), locale);
		});
	}

	it('accounts for accesses in the defining chunk', () => {
		const inliner = fixture('', 'consume(instance.ts.group[key]);');
		assert.deepEqual(pruneRuntimeLocale(locale, inliner.runtimeLocalePaths), { group: locale.group });
	});

	it('keeps the dictionary if the raw locale escapes its constructor', () => {
		assert.equal(pruneRuntimeLocale(locale, fixture('', 'consume(data);').runtimeLocalePaths), locale);
	});

	it('resolves shadowed minified identifiers without treating them as locale consumers', () => {
		const inliner = fixture('function local(translated) { return translated.ts; }', 'class Local { method(data, instance) { return data + instance; } }');
		const own = inliner.chunks.find(chunk => chunk.fileName === 'i18n.js')!;
		own.sourceCode = 'class Other { method() { let instance = 0, data = 0; return instance + data; } }' + own.sourceCode;
		inliner.collectsModifications();
		assert.deepEqual(pruneRuntimeLocale(locale, inliner.runtimeLocalePaths), {});
	});

	it('keeps the dictionary when the defining module shape cannot be analyzed', () => {
		const inliner = fixture('');
		inliner.chunks.find(chunk => chunk.fileName === 'i18n.js')!.sourceCode = 'export const i18n = factory();';
		assert.deepEqual(collectRuntimeLocalePaths(inliner.chunks, 'i18n.js', 'i18n'), [[]]);
	});

	it('fails closed on parse errors and missing source', () => {
		assert.deepEqual(collectRuntimeLocalePaths([{ fileName: 'broken.js', sourceCode: 'invalid(', modifications: [] }], 'i18n.js', 'i18n'), [[]]);
		assert.deepEqual(collectRuntimeLocalePaths([{ fileName: 'missing.js' }], 'i18n.js', 'i18n'), [[]]);
	});

	it('does not mutate dictionaries or lose overlapping requested subtrees', () => {
		assert.deepEqual(pruneRuntimeLocale(locale, [['group'], ['group', 'message']]), { group: locale.group });
		assert.deepEqual(pruneRuntimeLocale(locale, [['group', 'message'], ['group']]), { group: locale.group });
		assert.deepEqual(pruneRuntimeLocale(locale, [['missing']]), {});
		assert.deepEqual(pruneRuntimeLocale(locale, []), {});
	});

	it('copies prototype-like keys as ordinary own properties', () => {
		const input = JSON.parse('{"__proto__":{"message":"Safe"},"unused":"Unused"}');
		const output = pruneRuntimeLocale(input, [['__proto__', 'message']]);
		assert.equal(Object.getPrototypeOf(output), Object.prototype);
		assert.equal(JSON.stringify(output), '{"__proto__":{"message":"Safe"}}');
	});
});
