/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/vue3-vite';
import { type Plugin, type PluginOption, mergeConfig } from 'vite';
import turbosnap from 'vite-plugin-turbosnap';

const require = createRequire(import.meta.url);
const _dirname = fileURLToPath(new URL('.', import.meta.url));

const config = {
	stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
	staticDirs: [{ from: '../assets', to: '/client-assets' }],
	addons: [
		getAbsolutePath('@storybook/addon-links'),
		getAbsolutePath('@storybook/addon-docs'),
		resolve(_dirname, 'addons/misskey-theme/preset.js'),
	],
	framework: {
		name: getAbsolutePath('@storybook/vue3-vite') as '@storybook/vue3-vite',
		options: {},
	},
	core: {
		disableTelemetry: true,
	},
	async viteFinal(config) {
		const replacePluginForIsChromatic = config.plugins?.findIndex((plugin: PluginOption) => pluginName(plugin) === 'replace') ?? -1;
		if (~replacePluginForIsChromatic) {
			config.plugins?.splice(replacePluginForIsChromatic, 1);
		}

		// Storybookでは不要な本番ビルド向けpluginを削除、複数あるかもしれないので全て削除
		// (UnwindCssModuleClassName は renderChunk での再parseがTLAを含むchunkで失敗するため)
		const unnecessaryPlugins = new Set(['createSearchIndex', 'UnwindCssModuleClassName']);
		config.plugins = config.plugins?.filter((plugin: PluginOption) => !unnecessaryPlugins.has(pluginName(plugin) ?? '')) ?? [];

		return mergeConfig(config, {
			plugins: [
				{
					// XXX: https://github.com/IanVS/vite-plugin-turbosnap/issues/8
					...(turbosnap as any as typeof turbosnap['default'])({
						rootDir: config.root ?? process.cwd(),
					}),
					name: 'fake-turbosnap',
				},
				{
					// src/custom-emojis.ts や src/utility/idb-proxy.ts の top-level await が
					// rolldown の chunk 生成を壊す (async でない wrapper 内に await が出力され
					// 実行時 SyntaxError になる) ため、Storybook ビルドでは TLA を取り除いた
					// shims/ 側の実装に差し替える
					name: 'storybook-strip-tla-shims',
					enforce: 'pre',
					resolveId(source: string, importer: string | undefined) {
						if (process.env['SB_DISABLE_TLA_SHIMS']) return null;
						const m = /(?:^|\/)(custom-emojis|idb-proxy|locale|use-note-capture)(?:\.js|\.ts)?$/.exec(source);
						if (!m) return null;
						// shims/locale.ts が import する生成済み ../locale.ts だけは shim に戻さない
						if (m[1] === 'locale' && importer && importer.includes('/.storybook/shims/')) return null;
						return resolve(_dirname, `shims/${m[1]}.ts`);
					},
				},
			],
		});
	},
} satisfies StorybookConfig;
export default config;

function pluginName(plugin: PluginOption): string | undefined {
	return (plugin != null && typeof plugin === 'object' && !Array.isArray(plugin) && 'name' in plugin)
		? (plugin as Plugin).name
		: undefined;
}

function getAbsolutePath(value: string): string {
	return dirname(require.resolve(join(value, 'package.json')));
}
