/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type RjNumberLinkKind =
	| 'work'
	| 'circle'
	| 'nico'
	| 'cve'
	| 'jvn'
	| 'jvnvu'
	| 'jvnta'
	| 'jvndb'
	| 'githubCommit';

export type RjNumberToken =
	| { readonly type: 'text'; readonly value: string }
	| { readonly type: RjNumberLinkKind; readonly value: string; readonly url: string };

type RjNumberMatcher = {
	readonly type: RjNumberLinkKind;
	readonly regexp: RegExp;
	readonly getUrl: (value: string) => string;
};

const RJ_NUMBER_MATCHERS: readonly RjNumberMatcher[] = [
	{
		type: 'work',
		regexp: /[RVB][JE]\d{6,}/g,
		getUrl: (rj) => `https://www.dlsite.com/home/work/=/product_id/${rj}.html`,
	},
	{
		type: 'circle',
		regexp: /[RVB][G]\d{5,}/g,
		getUrl: (rg) => `https://www.dlsite.com/home/circle/profile/=/maker_id/${rg}.html`,
	},
	{
		// nicovideo
		type: 'nico',
		regexp: /sm\d+/g,
		getUrl: (sm) => `https://www.nicovideo.jp/watch/${sm}`,
	},
	{
		// CVE
		type: 'cve',
		regexp: /CVE-\d{4}-\d{4,}/gi,
		getUrl: (cve) => `https://www.cve.org/CVERecord?id=${cve}`,
	},
	{
		// JVN
		type: 'jvn',
		regexp: /JVN[#\d]{8,}/gi,
		getUrl: (jvn) => `https://jvn.jp/jp/${jvn.replace('#', '')}/index.html`,
	},
	{
		// JVNVU
		type: 'jvnvu',
		regexp: /JVNVU[#\d]{8,}/gi,
		getUrl: (jvnvu) => `https://jvn.jp/vu/${jvnvu.replace('#', '')}/index.html`,
	},
	{
		// JVNTA
		type: 'jvnta',
		regexp: /JVNTA[#\d]{8,}/gi,
		getUrl: (jvnta) => `https://jvn.jp/ta/${jvnta.replace('#', '')}/index.html`,
	},
	{
		// JVNDB
		type: 'jvndb',
		regexp: /JVNDB-\d{4}-\d{6}/gi,
		getUrl: (jvndb) => {
			const year = jvndb.match(/\d{4}/)![0];
			return `https://jvndb.jvn.jp/en/contents/${year}/${jvndb}.html`;
		},
	},
	{
		// GitHub commit hash
		type: 'githubCommit',
		regexp: /[0-9a-f]{40}/gi,
		getUrl: (hash) => `https://github.com/search?q=${hash}&type=commits`,
	},
];

function applyMatcher(tokens: RjNumberToken[], matcher: RjNumberMatcher): RjNumberToken[] {
	return tokens.flatMap((token): RjNumberToken | RjNumberToken[] => {
		if (token.type !== 'text') return token;

		const matches = token.value.match(matcher.regexp);
		if (matches == null) return token;

		const result: RjNumberToken[] = [];
		let currentIndex = 0;

		matches.forEach((match) => {
			const index = token.value.indexOf(match, currentIndex);
			if (index > currentIndex) {
				result.push({
					type: 'text',
					value: token.value.substring(currentIndex, index),
				});
			}
			result.push({
				type: matcher.type,
				value: match,
				url: matcher.getUrl(match),
			});
			currentIndex = index + match.length;
		});

		if (currentIndex < token.value.length) {
			result.push({
				type: 'text',
				value: token.value.substring(currentIndex),
			});
		}

		return result;
	});
}

/** Pure tokenizer for RJ/nicovideo/CVE/JVN/GitHub-commit auto-links (Vue-independent). */
export function parseRjNumberTokens(text: string): RjNumberToken[] {
	let tokens: RjNumberToken[] = [{ type: 'text', value: text }];
	for (const matcher of RJ_NUMBER_MATCHERS) {
		tokens = applyMatcher(tokens, matcher);
	}
	return tokens;
}
