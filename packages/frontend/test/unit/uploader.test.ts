/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent } from 'vue';
import type { App } from 'vue';
import { useUploader } from '@/composables/use-uploader.js';

const mocks = vi.hoisted(() => ({
	resize: vi.fn(),
	animated: vi.fn(),
	close: vi.fn(),
	settings: {
		keepOriginalFilename: true,
		defaultImageCompressionLevel: 1,
		defaultVideoCompressionLevel: 0,
		watermarkPresets: [],
	},
}));

vi.mock('@misskey-dev/browser-image-resizer', () => ({ readAndCompressImage: mocks.resize }));
vi.mock('is-file-animated', () => ({ default: mocks.animated }));
vi.mock('@/preferences.js', () => ({ prefer: { s: mocks.settings } }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ policies: { watermarkAvailable: false } }) }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/utility/drive.js', () => ({ uploadFile: vi.fn(), UploadAbortedError: class extends Error {} }));
vi.mock('@/utility/isWebpSupported.js', () => ({ isWebpSupported: () => true }));

let app: App;
let uploader: ReturnType<typeof useUploader>;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.settings.defaultImageCompressionLevel = 1;
	mocks.animated.mockResolvedValue(false);
	mocks.resize.mockResolvedValue(new Blob(['small'], { type: 'image/webp' }));
	vi.spyOn(window, 'createImageBitmap').mockResolvedValue({ width: 10, height: 10, close: mocks.close } as unknown as ImageBitmap);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	app = createApp(defineComponent({
		setup() {
			uploader = useUploader();
			return () => null;
		},
	}));
	app.mount(document.createElement('div'));
});

afterEach(() => {
	app.unmount();
	vi.restoreAllMocks();
});

async function addImage() {
	const file = new File(['x'.repeat(100)], 'photo.png', { type: 'image/png' });
	uploader.addFiles([file]);
	await vi.waitFor(() => expect(uploader.items.value[0].preprocessing).toBe(false));
	return { file, item: uploader.items.value[0] };
}

describe('uploader image preprocessing', () => {
	test('does not process an empty file selection', () => {
		uploader.addFiles([]);
		expect(uploader.items.value).toEqual([]);
		expect(mocks.animated).not.toHaveBeenCalled();
		expect(mocks.resize).not.toHaveBeenCalled();
	});

	test('loads compression on demand and keeps the compressed result', async () => {
		expect(mocks.resize).not.toHaveBeenCalled();
		const { file, item } = await addImage();
		expect(mocks.animated).toHaveBeenCalledWith(file);
		expect(mocks.resize).toHaveBeenCalledWith(file, expect.objectContaining({ maxWidth: 2000, mimeType: 'image/webp' }));
		expect(item.compressedSize).toBe(5);
		expect(item.suffix).toBe('.webp');
		expect(mocks.close).toHaveBeenCalled();
	});

	test('skips animation detection and resizing when compression is disabled', async () => {
		mocks.settings.defaultImageCompressionLevel = 0;
		const { file, item } = await addImage();
		expect(mocks.animated).not.toHaveBeenCalled();
		expect(mocks.resize).not.toHaveBeenCalled();
		expect(item.preprocessedFile).toBe(file);
	});

	test('does not resize animated images', async () => {
		mocks.animated.mockResolvedValue(true);
		await addImage();
		expect(mocks.resize).not.toHaveBeenCalled();
	});

	test('retains the original file when resizing fails', async () => {
		const error = new Error('resize failed');
		mocks.resize.mockRejectedValueOnce(error);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { file, item } = await addImage();
		expect(log).toHaveBeenCalledWith('Failed to resize image', error);
		expect(item.preprocessedFile).toBe(file);
		expect(mocks.close).toHaveBeenCalled();
	});
});
