/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import type { LLMResponse } from '@/utility/tempura-script/llm-response.js';

export type { LLMResponse };

const instance = ref<Misskey.entities.MetaDetailed | null>(null);

fetchInstance(true).then((res) => {
	instance.value = res;
});

/**
 * モデルの入力モダリティ情報つきモデル一覧
 */
export interface LLMModelInfo {
	id: string;
	/** 画像入力 (ビジョン) に対応していると判定できた場合 true */
	imageInput?: boolean;
}

/**
 * モデルが画像入力に対応しているかを判定する (ベストエフォート)
 *
 * OpenAI 互換 API の GET /models は多くの場合 id しか返さないため、
 * 以下の順で判定する:
 * 1. エンドポイントが返すモダリティ情報 (input_modalities / modalities / capabilities 等)
 * 2. モデル名のパターン (既知のビジョン対応モデルの命名)
 */
export function detectImageInputSupport(model: { id: string; [key: string]: unknown }): boolean {
	// 1. モダリティ情報があればそれを使う (画像を含む配列が1つでもあれば対応と判定)
	for (const key of ['input_modalities', 'inputModalities', 'modalities', 'supported_input_modalities']) {
		const value = model[key];
		if (Array.isArray(value)) {
			if (value.some(v => typeof v === 'string' && (v.includes('image') || v === 'multimodal'))) {
				return true;
			}
		}
	}
	const caps = model['capabilities'];
	if (caps != null && typeof caps === 'object') {
		const vision = (caps as Record<string, unknown>)['vision'] ?? (caps as Record<string, unknown>)['image_input'];
		if (typeof vision === 'boolean') return vision;
	}

	// 2. モデル名による推測
	const id = model.id.toLowerCase();
	return (
		id.includes('vision') || id.includes('vl') || id.includes('llava') || id.includes('pixtral') ||
		id.includes('internvl') || id.includes('gpt-4o') || id.includes('gpt-4.1') || id.includes('gpt-5') ||
		id.includes('claude') || id.includes('gemini') || id.includes('qwen-vl') || id.includes('minicpm')
	);
}

function toModelInfos(data: { id?: string }[] | undefined): LLMModelInfo[] {
	return (data ?? [])
		.filter((m): m is { id: string; [key: string]: unknown } => typeof m?.id === 'string')
		.map(m => ({ id: m.id, imageInput: detectImageInputSupport(m) }));
}

/**
 * 現在の設定で利用可能なモデル一覧を取得する
 *
 * - サーバー提供モード: notes/llm-models エンドポイント経由で取得
 * - ユーザー直指定モード: OpenAI 互換 API の GET {baseURL}/models を直接呼び出す
 *
 * @returns モデル情報のリスト (取得に失敗した場合は空配列)
 */
export async function fetchAvailableModels(): Promise<LLMModelInfo[]> {
	const { useGeminiLLMAPI, openaiToken, openaiBaseUrl } = prefer.s;

	if (useGeminiLLMAPI) {
		try {
			const res = await misskeyApi('notes/llm-models', {});
			return (res.models ?? [])
				.map((id: string) => ({ id, imageInput: detectImageInputSupport({ id }) }));
		} catch {
			return [];
		}
	}

	if (!openaiToken) return [];

	try {
		const baseURL = (openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
		const response = await window.fetch(`${baseURL}/models`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${openaiToken}`,
			},
		});
		if (!response.ok) return [];
		const data = await response.json() as { data?: { id?: string }[] };
		return toModelInfos(data.data);
	} catch {
		return [];
	}
}

export interface GenerateLLMOptions {
	note?: Misskey.entities.Note;
	userContent?: string;
	systemInstruction?: string;
}

/**
 * ノートの画像を image_url コンテンツとして組み立てる
 */
function buildImageParts(note: Misskey.entities.Note): { type: 'image_url'; image_url: { url: string } }[] {
	return (note.files ?? [])
		.filter(file => file.type.startsWith('image/') && !file.type.includes('gif'))
		.slice(0, 4)
		.map(file => ({ type: 'image_url' as const, image_url: { url: file.url } }));
}

/**
 * サーバー提供の LLM API (notes/llm-gen) を呼び出す
 */
async function generateViaServer({ note, userContent, systemInstruction }: GenerateLLMOptions): Promise<LLMResponse> {
	const text = note?.text || userContent || '';
	const { useGeminiWithMedia = true } = prefer.s;

	const fileUris: { mimeType: string; fileUri: string }[] = [];
	if (note && useGeminiWithMedia) {
		for (const file of (note.files ?? [])) {
			if (file.type.startsWith('image/') && !file.type.includes('gif')) {
				fileUris.push({ mimeType: file.type, fileUri: file.url });
			}
		}
	}

	return await misskeyApi('notes/llm-gen', {
		text: text,
		prompt: systemInstruction ?? '',
		fileUris: fileUris.length > 0 ? fileUris.slice(0, 4) : undefined,
	}) as LLMResponse;
}

/**
 * OpenAI 互換 API (Chat Completions) をユーザーのキーで直接呼び出す
 */
async function generateOpenAIDirect({ note, userContent, systemInstruction }: GenerateLLMOptions): Promise<LLMResponse> {
	const { openaiToken, openaiBaseUrl, openaiModel, useGeminiWithMedia = true } = prefer.s;

	if (!openaiToken) {
		throw new Error(i18n.ts._llm._error.tokenMissing);
	}

	const text = note?.text || userContent || '';
	const baseURL = (openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
	// モデルを空にしている場合は既定のモデルを使う
	const model = openaiModel?.trim() || 'gpt-4o-mini';

	// ユーザーコンテンツ (テキスト + 画像URL)
	const content: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] = [
		{ type: 'text', text },
	];
	if (note && useGeminiWithMedia) {
		content.push(...buildImageParts(note));
	}

	const requestBody = {
		model,
		messages: [
			{ role: 'system', content: systemInstruction ?? '' },
			{ role: 'user', content },
		],
	};

	const response = await window.fetch(`${baseURL}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${openaiToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		throw new Error(i18n.ts._llm._error.api + `${response.status} ${response.statusText}`);
	}

	return response.json() as Promise<LLMResponse>;
}

/**
 * LLM による生成を実行する
 *
 * サーバー提供モード (useGeminiLLMAPI) が有効ならサーバー経由、
 * それ以外はユーザーが設定したキーで直接 OpenAI 互換 API を呼び出す。
 *
 * @returns LLM API のレスポンス (extractLLMText でテキストを取り出す)
 */
export async function generateLLMResponse(options: GenerateLLMOptions): Promise<LLMResponse> {
	const { useGeminiLLMAPI } = prefer.s;

	if (useGeminiLLMAPI) {
		// サーバーで OpenAI 互換 API が有効になっているかチェック
		if (instance.value?.serverOpenAIEnabled === true) {
			try {
				return await generateViaServer(options);
			} catch (error: unknown) {
				const err = error as { code?: string; message?: string };
				if (err?.code === 'ROLE_PERMISSION_DENIED') {
					throw new Error(i18n.ts._llm._error.serverPermission);
				}
				throw new Error(i18n.ts._llm._error.serverLLMApi + (err?.message || String(error)));
			}
		}

		// サーバー側が無効な場合、ユーザー直指定にフォールバックするか確認
		if (prefer.s.openaiToken) {
			const { canceled, result } = await os.actions({
				type: 'question',
				title: 'LLM API利用方法の選択',
				text: 'サーバー提供のLLM APIが有効になっていません。ユーザー指定のAPI tokenを使って生成を継続しますか？ または、LLM API の利用を無効にしますか？',
				actions: [
					{ value: 'fallback', text: 'ユーザーのAPI tokenを使用する' },
					{ value: 'disable', text: 'LLM APIの利用を無効にする', danger: true },
				],
			});
			if (canceled) {
				throw new Error(i18n.ts._llm._error.cancel);
			}
			if (result === 'disable') {
				prefer.s.useGeminiLLMAPI = false;
				throw new Error(i18n.ts._llm._error.disable);
			}
			// 'fallback' の場合はユーザー直指定で生成処理へフォールバック
		} else {
			throw new Error(i18n.ts._llm._error.serverDisabled);
		}
	}

	return await generateOpenAIDirect(options);
}
