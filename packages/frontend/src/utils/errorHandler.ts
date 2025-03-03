import * as os from '@/os.js';

let isErrorAlertDisplayed = false;

export function displayLlmError(error: Error, context = ''): never {
	if (isErrorAlertDisplayed) {
		throw error;
	}
	isErrorAlertDisplayed = true;
	const message = context ? `${context}\n${error.message}` : error.message;
	os.alert({
		type: 'error',
		title: 'LLM エラー',
		text: message,
	})
		.finally(() => {
			isErrorAlertDisplayed = false;
		});
	throw error;
}
