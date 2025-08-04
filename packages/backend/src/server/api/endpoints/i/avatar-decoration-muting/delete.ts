/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsString, IsNotEmpty } from 'class-validator';
import { AvatarDecorationMuting } from '@/models/index.js';
import { AvatarDecorationMutingService } from '@/core/AvatarDecorationMutingService.js';
import { defineAPI } from '../_define.js';

class Request {
	@IsString()
	@IsNotEmpty()
	userId: string;
}

export const anio = defineAPI('i/avatar-decoration-muting/delete', {
	payload: Request,
	authed: true,
}, async (request, user) => {
	const muting = await AvatarDecorationMuting.findOne({
		where: {
			muterId: user.id,
			muteeId: request.userId,
		},
	});

	if (muting == null) {
		throw 'muting does not exist';
	}

	const service = new AvatarDecorationMutingService();
	await service.unmute([muting]);

	return () => {
		return;
	};
});
