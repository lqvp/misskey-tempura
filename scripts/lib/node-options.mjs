/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 起動スクリプト (scripts/start.mjs) が本体プロセスに渡す Node.js オプションを組み立てる処理
 */

/**
 * 若い世代 (new space) の半区画サイズの上限。V8 はこの値をヒープ上限から決めるため、環境によって変わります。
 * 計測した環境 (8 GiB のコンテナ、Node.js v24.21.0) では既定値が 16 MiB になり、起動直後にその分を確保したまま
 * リクエストを受けると、負荷時の Pss がこれだけで 200 MiB 以上増えました。ここで上限を付けても
 * ピーク時のレイテンシは悪化しなかったため、上限だけを絞ります。
 */
export const defaultSemiSpaceSizeMiB = 4;

// V8 のフラグはハイフン区切りとアンダースコア区切りのどちらでも書けるため、表記を揃えてから探します。
// --min-semi-space-size は NODE_OPTIONS では受け付けられず、起動引数でしか渡せません。
const semiSpaceOptions = ['--max-semi-space-size', '--min-semi-space-size'];

function normalizeFlagSpelling(flag) {
	return flag.replaceAll('_', '-');
}

function containsSemiSpaceOption(flags) {
	return flags
		.map(normalizeFlagSpelling)
		.some((flag) => semiSpaceOptions.some((name) => flag === name || flag.startsWith(`${name}=`)));
}

/**
 * NODE_OPTIONS か起動引数で semi-space が指定されているかを調べます
 * @param {string} nodeOptions
 * @param {string[]} argv
 */
export function hasUserSemiSpaceSetting(nodeOptions, argv) {
	return containsSemiSpaceOption(nodeOptions.split(/\s+/)) || containsSemiSpaceOption(argv);
}

/**
 * 利用者が明示していないときだけ、上限を足した NODE_OPTIONS を返します
 * @param {string} nodeOptions 元の NODE_OPTIONS
 * @param {string[]} argv 起動引数
 * @param {number} semiSpaceSizeMiB
 */
export function withDefaultSemiSpaceSize(nodeOptions, argv, semiSpaceSizeMiB = defaultSemiSpaceSizeMiB) {
	if (hasUserSemiSpaceSetting(nodeOptions, argv)) return nodeOptions;

	const semiSpaceOption = `--max-semi-space-size=${semiSpaceSizeMiB}`;
	return nodeOptions ? `${nodeOptions} ${semiSpaceOption}` : semiSpaceOption;
}
