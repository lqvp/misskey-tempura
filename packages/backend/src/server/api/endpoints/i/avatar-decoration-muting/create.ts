/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsString, IsNotEmpty } from 'class-validator';
import { User } from '@/models/index.js';
import { AvatarDecorationMutingService } from '@/core/AvatarDecorationMutingService.js';
import { defineAPI } from '../_define.js';

class Request {
	@IsString()
	@IsNotEmpty()
	userId: string;
}

export const anio = defineAPI('i/avatar-decoration-muting/create', {
	payload: Request,
	authed: true,
}, async (request, user) => {
	const target = await User.findOne({
		where: {
			id: request.userId,
		},
	});

	if (target == null) {
		throw 'user not found';
	}

	const service = new AvatarDecorationMutingService();
	await service.mute(user, target);

	return () => {
		return;
	};
});
