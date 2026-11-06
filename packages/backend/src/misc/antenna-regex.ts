/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import RE2 from 're2';

/**
 * アンテナのキーワード解釈モード。
 * literal: 従来どおり文字列の部分一致 (後方互換の既定)
 * regex: 登録項目ひとつ全体を1つの正規表現として評価する (RE2構文)
 */
export const antennaKeywordModes = ['literal', 'regex'] as const;
export type AntennaKeywordMode = typeof antennaKeywordModes[number];

// 受信経路ではノートごとに全アクティブアンテナへ適用されるため、式の数と長さを抑える。
// 試し打ちAPI (antennas/test) の既存の配列上限 (32グループ/32項目) に揃える。
export const REGEX_GROUP_LIMIT = 32;
export const REGEX_KEYWORDS_PER_GROUP_LIMIT = 32;
export const REGEX_PATTERN_MAX_LENGTH = 512;

export type AntennaRegexValidationError = {
	reason: 'tooManyGroups' | 'tooManyKeywords' | 'patternTooLong' | 'invalidPattern';
	pattern?: string;
	message?: string;
};

/**
 * regex mode で使われるキーワード群 (include / exclude / mustExclude の全グループ) を検証する。
 * 作成・更新・試し打ち・インポートで共通して使い、不正な式を受信経路に入れない。
 */
export function validateAntennaRegexKeywords(keywordGroups: string[][][]): AntennaRegexValidationError | null {
	for (const groups of keywordGroups) {
		if (groups.length > REGEX_GROUP_LIMIT) {
			return { reason: 'tooManyGroups' };
		}
		for (const group of groups) {
			if (group.length > REGEX_KEYWORDS_PER_GROUP_LIMIT) {
				return { reason: 'tooManyKeywords' };
			}
			for (const pattern of group) {
				if (pattern === '') continue;
				if (pattern.length > REGEX_PATTERN_MAX_LENGTH) {
					return { reason: 'patternTooLong', pattern };
				}
				try {
					// 実際の評価と同じフラグでコンパイルして構文を確認する
					void new RE2(pattern, 'u');
				} catch (err) {
					return { reason: 'invalidPattern', pattern, message: err instanceof Error ? err.message : String(err) };
				}
			}
		}
	}
	return null;
}

// ノートごと・アンテナごとに同じ式をコンパイルし直さないよう使い回す (AntennaServiceのliteralキャッシュと同じLRU)。
// RE2もRegExp同様、exec/matchAllでは内部状態が進むため、共有するのはフラグ違いで別エントリにする。
const regexCache = new Map<string, RE2>();
const REGEX_CACHE_MAX = 10000;

function getAntennaRegex(pattern: string, flags: string): RE2 {
	const cacheKey = `${flags}:${pattern}`;
	let regex = regexCache.get(cacheKey);
	if (regex != null) {
		regexCache.delete(cacheKey);
	} else {
		regex = new RE2(pattern, flags);
		if (regexCache.size >= REGEX_CACHE_MAX) {
			const oldest = regexCache.keys().next().value;
			if (oldest != null) regexCache.delete(oldest);
		}
	}
	regexCache.set(cacheKey, regex);
	return regex;
}

/**
 * regex mode の1項目 (式全体) がテキストにマッチするか。
 * APIで検証済みのはずだが、キャッシュ済みエンティティなど不正な式が残っていた場合は不一致扱いにして受信全体を止めない。
 */
export function testAntennaRegex(pattern: string, text: string, caseSensitive: boolean): boolean {
	try {
		const regex = getAntennaRegex(pattern, caseSensitive ? 'u' : 'iu');
		return regex.test(text);
	} catch {
		return false;
	}
}

export type AntennaRegexMatch = {
	keyword: string;
	start: number;
	end: number;
};

/**
 * regex mode の1項目について、テキスト中の全マッチ位置を返す (SCOREモードのマッチ理由用)。
 * 長さ0のマッチは start === end の要素として記録しつつ、無限ループを避けるため1文字進める。
 */
export function findAntennaRegexMatches(pattern: string, text: string, caseSensitive: boolean): AntennaRegexMatch[] {
	const matches: AntennaRegexMatch[] = [];
	let regex: RE2;
	try {
		regex = getAntennaRegex(pattern, caseSensitive ? 'gu' : 'giu');
	} catch {
		return [];
	}
	// 共有インスタンスのlastIndexを毎回リセットしてから走査する
	regex.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		matches.push({
			keyword: pattern,
			start: match.index,
			end: match.index + match[0].length,
		});
		if (match[0].length === 0) {
			regex.lastIndex++;
		}
	}
	return matches;
}
