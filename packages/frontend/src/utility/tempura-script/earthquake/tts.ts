/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';

/**
 * Use text-to-speech to read the alert message
 */
export function speakAlert(message: string): void {
	try {
		// Cancel any ongoing speech
		window.speechSynthesis.cancel();

		const utterance = new SpeechSynthesisUtterance(message.replace(/\n/g, '、'));

		// Set language to Japanese
		utterance.lang = 'ja-JP';

		// Get speech rate from settings
		const rate = prefer.s.earthquakeWarningTtsRate || 1.0;
		utterance.rate = rate;

		// Speak with normal pitch but slightly lower for authority
		utterance.pitch = 0.9;

		// Get selected voice from settings
		const selectedVoiceURI = prefer.s.earthquakeWarningTtsVoice;
		if (selectedVoiceURI) {
			const voices = window.speechSynthesis.getVoices();
			const selectedVoice = voices.find(voice => voice.voiceURI === selectedVoiceURI);
			if (selectedVoice) {
				utterance.voice = selectedVoice;
			}
		}

		window.speechSynthesis.speak(utterance);
	} catch (error) {
		console.error('Speech synthesis error:', error);
	}
}
