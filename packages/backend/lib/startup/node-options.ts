/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 起動スクリプトが本体プロセスに渡す Node.js オプションを組み立てる処理
 */

/**
 * 若い世代 (new space) の半区画サイズの上限。V8 はこの値をヒープ上限から決めるため、環境によって変わります。
 * 計測した環境 (8 GiB のコンテナ、Node.js v24.21.0) では既定値が 16 MiB になり、起動直後にその分を確保したまま
 * リクエストを受けると、負荷時の Pss がこれだけで 200 MiB 以上増えました。ここで上限を付けても
 * ピーク時のレイテンシは悪化しなかったため、上限だけを絞ります。
 */
export const defaultSemiSpaceSizeMiB = 1;

// V8 のフラグはハイフン区切りとアンダースコア区切りのどちらでも書けるため、表記を揃えてから探します。
// --min-semi-space-size は NODE_OPTIONS では受け付けられず、起動引数でしか渡せません。
const semiSpaceOptions = ['--max-semi-space-size', '--min-semi-space-size'];

function normalizeFlagSpelling(flag: string): string {
	return flag.replaceAll('_', '-');
}

function containsSemiSpaceOption(flags: string[]): boolean {
	return flags
		.map(normalizeFlagSpelling)
		.some((flag) => semiSpaceOptions.some((name) => flag === name || flag.startsWith(`${name}=`)));
}

/**
 * NODE_OPTIONS か起動引数で semi-space が指定されているかを調べます
 * @param nodeOptions 元の NODE_OPTIONS
 * @param argv 起動引数
 */
export function hasUserSemiSpaceSetting(nodeOptions: string, argv: string[]): boolean {
	return containsSemiSpaceOption(nodeOptions.split(/\s+/)) || containsSemiSpaceOption(argv);
}

/**
 * 利用者が明示していないときだけ、上限を足した NODE_OPTIONS を返します
 * @param nodeOptions 元の NODE_OPTIONS
 * @param argv 起動引数
 * @param semiSpaceSizeMiB 上限とする半区画サイズ
 */
export function withDefaultSemiSpaceSize(nodeOptions: string, argv: string[], semiSpaceSizeMiB = defaultSemiSpaceSizeMiB): string {
	if (hasUserSemiSpaceSetting(nodeOptions, argv)) return nodeOptions;

	const semiSpaceOption = `--max-semi-space-size=${semiSpaceSizeMiB}`;
	return nodeOptions ? `${nodeOptions} ${semiSpaceOption}` : semiSpaceOption;
}
