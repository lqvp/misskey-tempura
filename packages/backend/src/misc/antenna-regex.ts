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
	/** 不正だった項目の位置 (どのキーワード群の何番目のグループの何番目か)。クライアント側で該当項目を指せるようにする */
	location?: { keywordType: 'keywords' | 'excludeKeywords' | 'mustExcludeKeywords'; groupIndex: number; keywordIndex: number };
};

const keywordTypeNames = ['keywords', 'excludeKeywords', 'mustExcludeKeywords'] as const;

export type AntennaKeywordType = typeof keywordTypeNames[number];

/**
 * キーワード群が上限 (グループ数 / グループあたりの項目数 / 1項目の長さ) を超えているかだけを見る。
 * 構文の妥当性は見ないので、literal モードの保存可否判定にも使える。
 * 上限を超えたアンテナは受信経路の走査コストが増えるため、新規作成では拒否する。
 */
export function findAntennaKeywordLimitViolation(keywordGroups: string[][][]): AntennaRegexValidationError | null {
	for (const [keywordTypeIndex, groups] of keywordGroups.entries()) {
		const keywordType = keywordTypeNames[keywordTypeIndex] ?? 'keywords';
		if (groups.length > REGEX_GROUP_LIMIT) {
			return { reason: 'tooManyGroups', location: { keywordType, groupIndex: 0, keywordIndex: 0 } };
		}
		for (const [groupIndex, group] of groups.entries()) {
			if (group.length > REGEX_KEYWORDS_PER_GROUP_LIMIT) {
				return { reason: 'tooManyKeywords', location: { keywordType, groupIndex, keywordIndex: 0 } };
			}
			for (const [keywordIndex, pattern] of group.entries()) {
				if (pattern.length > REGEX_PATTERN_MAX_LENGTH) {
					return { reason: 'patternTooLong', pattern, location: { keywordType, groupIndex, keywordIndex } };
				}
			}
		}
	}
	return null;
}

/**
 * 上限超過の度合いを数値化する (大きいほど超過している)。上限内なら 0。
 * 既存の超過アンテナを保存してよいか (超過が増えていないか) の比較に使う。
 */
export function measureAntennaKeywordLimitExcess(keywordGroups: string[][][]): number {
	let excess = 0;
	for (const groups of keywordGroups) {
		excess += Math.max(0, groups.length - REGEX_GROUP_LIMIT);
		for (const group of groups) {
			excess += Math.max(0, group.length - REGEX_KEYWORDS_PER_GROUP_LIMIT);
			for (const pattern of group) {
				excess += Math.max(0, pattern.length - REGEX_PATTERN_MAX_LENGTH);
			}
		}
	}
	return excess;
}

/**
 * regex mode で使われるキーワード群 (include / exclude / mustExclude の全グループ) を検証する。
 * 作成・更新・試し打ち・インポートで共通して使い、不正な式を受信経路に入れない。
 */
export function validateAntennaRegexKeywords(keywordGroups: string[][][]): AntennaRegexValidationError | null {
	const limitViolation = findAntennaKeywordLimitViolation(keywordGroups);
	if (limitViolation != null) return limitViolation;

	for (const [keywordTypeIndex, groups] of keywordGroups.entries()) {
		const keywordType = keywordTypeNames[keywordTypeIndex] ?? 'keywords';
		for (const [groupIndex, group] of groups.entries()) {
			for (const [keywordIndex, pattern] of group.entries()) {
				if (pattern === '') continue;
				const location = { keywordType, groupIndex, keywordIndex };
				try {
					// 構文の妥当性は u/i/g フラグに依存しないので、ここでは u のみでコンパイルして確認する
					void new RE2(pattern, 'u');
				} catch (err) {
					return { reason: 'invalidPattern', pattern, message: err instanceof Error ? err.message : String(err), location };
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
 * limit を指定するとその件数で打ち切る (グループ判定のように有無だけ必要な経路で全件収集を避けるため)。
 */
export function findAntennaRegexMatches(pattern: string, text: string, caseSensitive: boolean, limit?: number): AntennaRegexMatch[] {
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
		if (limit !== undefined && matches.length >= limit) break;
		if (match[0].length === 0) {
			// ゼロ幅マッチの後に進める位置は「マッチ開始位置から1コードポイント」。
			// lastIndexの現在値に依存させると、実装がゼロ幅マッチでlastIndexを自動前進させた場合に
			// 1文字飛ばしてしまうため、開始位置から明示的に計算する。
			// サロゲートペアの途中に止まらないよう、コードポイント単位で進める。
			const cp = text.codePointAt(match.index);
			regex.lastIndex = match.index + (cp !== undefined && cp > 0xFFFF ? 2 : 1);
		}
	}
	return matches;
}
