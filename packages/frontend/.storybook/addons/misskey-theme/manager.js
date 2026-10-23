/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Local Storybook 10 port of misskey-dev/storybook-addon-misskey-theme
// (upstream addon targets Storybook 7 APIs and imports `Icons`, which was
// removed from storybook/internal/components in Storybook 9).

import { addons, types, useGlobals } from 'storybook/manager-api';
import React, { memo, useState } from 'react';
import { WithTooltip, TooltipLinkList, IconButton } from 'storybook/internal/components';
import { MirrorIcon } from '@storybook/icons';

const ADDON_ID = 'misskey-dev/storybook-addon-misskey-theme';
const TOOL_ID = `${ADDON_ID}/tool`;
const PARAM_KEY = 'misskeyTheme';

const THEMES = [
	'(clear)',
	'l-light',
	'l-coffee',
	'l-apricot',
	'l-rainy',
	'l-botanical',
	'l-vivid',
	'l-cherry',
	'l-sushi',
	'l-u0',
	'd-dark',
	'd-persimmon',
	'd-astro',
	'd-future',
	'd-botanical',
	'd-green-lime',
	'd-green-orange',
	'd-cherry',
	'd-ice',
	'd-u0',
];

const ThemeTool = memo(function ThemeTool() {
	const [visible, setVisible] = useState(false);
	const [globals, updateGlobals] = useGlobals();
	const active = !!globals[PARAM_KEY];

	return React.createElement(
		WithTooltip,
		{
			placement: 'top',
			closeOnOutsideClick: true,
			tooltip: ({ onHide }) => React.createElement(TooltipLinkList, {
				links: THEMES.map((theme, index) => ({
					id: theme,
					title: theme,
					onClick() {
						updateGlobals({ [PARAM_KEY]: index ? theme : false });
						onHide();
					},
					value: theme,
					active: theme === globals[PARAM_KEY],
				})),
			}),
			onVisibleChange: setVisible,
		},
		React.createElement(
			IconButton,
			{ key: TOOL_ID, active: active || visible, title: 'Switch theme' },
			React.createElement(MirrorIcon, null),
		),
	);
});

addons.register(ADDON_ID, () => {
	addons.add(TOOL_ID, {
		type: types.TOOL,
		title: 'Misskey theme',
		match: ({ viewMode }) => !!viewMode && /^(story|docs)$/.test(viewMode),
		render: ThemeTool,
	});
});
