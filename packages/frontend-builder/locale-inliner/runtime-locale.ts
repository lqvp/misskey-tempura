/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MagicString from 'magic-string';
import { isReferenceIdentifier, ScopeTracker, walk } from 'oxc-walker';
import { parseAst } from 'rolldown/parseAst';
import type { ESTree } from 'rolldown/utils';
import type { TextModification } from '../locale-inliner.js';
import type { ILocale } from 'i18n';

type Chunk = {
	fileName: string;
	sourceCode?: string;
	modifications?: TextModification[];
	isFacadeOfI18n?: true;
};

export function collectRuntimeLocalePaths(chunks: Chunk[], i18nFileName: string, i18nSymbol: string): string[][] {
	const paths: string[][] = [];
	const facadeNames = chunks.filter(chunk => chunk.isFacadeOfI18n).map(chunk => chunk.fileName);
	for (const chunk of chunks) {
		if (chunk.isFacadeOfI18n) continue;
		if (chunk.sourceCode == null || chunk.modifications == null) return [[]];
		const code = new MagicString(chunk.sourceCode);
		for (const modification of chunk.modifications) {
			if (modification.type === 'localized' || modification.type === 'parameterized-function') {
				code.update(modification.begin, modification.end, 'null');
			} else if (modification.type === 'delete') {
				code.remove(modification.begin, modification.end);
			}
		}
		let program: ESTree.Program;
		try {
			program = parseAst(code.toString());
		} catch {
			return [[]];
		}
		const parents = new Map<ESTree.Node, ESTree.Node>();
		const scopeTracker = new ScopeTracker({ preserveExitedScopes: true });
		walk(program, { scopeTracker, enter(node, parent) { if (parent) parents.set(node, parent); } });
		scopeTracker.freeze();
		const rootReferences = new Set<ESTree.Node>();
		walk(program, {
			scopeTracker,
			enter(node, parent) {
				if (node.type === 'Identifier' && isReferenceIdentifier(node, parent) && scopeTracker.getDeclaration(node.name)?.scope === '') rootReferences.add(node);
			},
		});
		const bindings = new Set<string>();
		const ignored = new Set<ESTree.Node>();
		let ownBinding: string | undefined;
		for (const statement of program.body) {
			if (statement.type === 'ImportDeclaration') {
				if (facadeNames.some(name => statement.source.value === `./${name}`)) return [[]];
				if (statement.source.value !== `./${i18nFileName}`) continue;
				for (const specifier of statement.specifiers) {
					if (specifier.type !== 'ImportSpecifier' || exportName(specifier.imported) !== i18nSymbol) return [[]];
					bindings.add(specifier.local.name);
					ignored.add(specifier.local);
					ignored.add(specifier.imported);
				}
			} else if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') {
				if (statement.source && [i18nFileName, ...facadeNames].some(name => statement.source?.value === `./${name}`)) return [[]];
				if (chunk.fileName !== i18nFileName || statement.type !== 'ExportNamedDeclaration') continue;
				for (const specifier of statement.specifiers) {
					if (exportName(specifier.exported) !== i18nSymbol) continue;
					ownBinding = exportName(specifier.local);
					bindings.add(ownBinding);
					ignored.add(specifier.local);
				}
			}
		}
		if (chunk.fileName === i18nFileName) {
			if (!ownBinding) return [[]];
			const localeModifications = chunk.modifications.filter(modification => modification.type === 'locale-json');
			if (localeModifications.length !== 1) return [[]];
			let rawLocaleName: string | undefined;
			walk(parseAst(chunk.sourceCode), {
				enter(node) {
					const modification = localeModifications[0];
					if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.start === modification.begin && node.init.end === modification.end) rawLocaleName = node.id.name;
				},
			});
			// Only the exported I18n instance may receive the raw locale object.
			const declarations = program.body.flatMap(statement => statement.type === 'VariableDeclaration' ? statement.declarations : []);
			const instance = declarations.find(node => node.id.type === 'Identifier' && node.id.name === ownBinding);
			const init = instance?.init;
			const constructor = init?.type === 'CallExpression' && init.arguments.length === 1 ? init.arguments[0] : init;
			if (constructor?.type !== 'NewExpression' || constructor.arguments[0]?.type !== 'Identifier') return [[]];
			const localeName = constructor.arguments[0].name;
			if (localeName !== rawLocaleName) return [[]];
			const locale = declarations.find(node => node.id.type === 'Identifier' && node.id.name === localeName);
			if (!locale || !chunk.modifications.some(modification => modification.type === 'locale-json')) return [[]];
			for (const node of parents.keys()) {
				if (node.type !== 'Identifier' || node.name !== localeName || !rootReferences.has(node)) continue;
				if (node !== locale.id && node !== constructor.arguments[0]) return [[]];
			}
		}
		walk(program, {
			enter(node, parent) {
				if (node.type === 'ImportExpression') {
					const source = stringValue(node.source);
					if (source == null || [i18nFileName, ...facadeNames].some(name => source.endsWith(`/${name}`))) paths.push([]);
				}
				if (node.type !== 'Identifier' || !bindings.has(node.name) || ignored.has(node) || !rootReferences.has(node)) return;
				if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
				const access: string[] = [];
				let expression: ESTree.Node = node;
				let next = parents.get(expression);
				while (next?.type === 'MemberExpression' && next.object === expression) {
					const property = next.computed ? stringValue(next.property) : next.property.type === 'Identifier' ? next.property.name : null;
					if (property == null) break;
					access.push(property);
					expression = next;
					next = parents.get(expression);
				}
				if (access.length === 1 && access[0] === 'locale' && next?.type === 'AssignmentExpression' && next.left === expression && next.operator === '=') return;
				if (access[0] === 'ts' || access[0] === 'tsx' || access[0] === 'locale') {
					paths.push(access.slice(1));
				} else if (access.length === 1 && access[0] === 't' && next?.type === 'CallExpression' && next.callee === expression) {
					const key = next.arguments[0] && stringValue(next.arguments[0]);
					paths.push(key ? key.split('.') : []);
				} else {
					paths.push([]);
				}
			},
		});
	}
	return paths;
}

export function pruneRuntimeLocale(locale: ILocale, paths: string[][]): ILocale {
	if (paths.some(keys => keys.length === 0)) return locale;
	return Object.fromEntries(Object.entries(locale).flatMap(([key, value]) => {
		const children = paths.filter(keys => keys[0] === key).map(keys => keys.slice(1));
		if (children.length === 0) return [];
		return [[key, typeof value === 'string' ? value : pruneRuntimeLocale(value, children)]];
	}));
}

function exportName(node: ESTree.ModuleExportName): string {
	return node.type === 'Identifier' ? node.name : node.value;
}

function stringValue(node: ESTree.Node): string | null {
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node.type === 'TemplateLiteral' && node.quasis.length === 1) return node.quasis[0].value.cooked ?? null;
	return null;
}
