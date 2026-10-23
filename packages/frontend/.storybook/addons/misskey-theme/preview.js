/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useGlobals, useEffect } from 'storybook/preview-api';

const PARAM_KEY = 'misskeyTheme';

function applyTheme(theme) {
	if (theme) {
		document.documentElement.dataset.misskeyTheme = theme;
	} else {
		delete document.documentElement.dataset.misskeyTheme;
	}
}

const withMisskeyTheme = (StoryFn, context) => {
	const [globals] = useGlobals();
	const theme = globals[PARAM_KEY];
	const { theme: legacyTheme } = context.globals;

	useEffect(() => {
		applyTheme(theme);
	}, [theme, legacyTheme]);

	return StoryFn();
};

export default {
	decorators: [withMisskeyTheme],
	initialGlobals: { [PARAM_KEY]: false },
};
