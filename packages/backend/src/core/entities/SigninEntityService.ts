/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { } from '@/models/Blocking.js';
import type { MiSignin } from '@/models/Signin.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { LoginRiskService } from '@/core/LoginRiskService.js';

@Injectable()
export class SigninEntityService {
	constructor(
		private idService: IdService,
		private loginRiskService: LoginRiskService,
	) {
	}

	@bindThis
	public async pack(
		src: MiSignin,
	) {
		return {
			id: src.id,
			createdAt: this.idService.parse(src.id).date.toISOString(),
			ip: src.ip,
			headers: src.headers,
			success: src.success,
			country: src.country,
			asn: src.asn,
			riskScore: src.riskScore,
			riskReasons: src.riskReasons,
			challenge: src.challenge,
		};
	}

	/**
	 * 本人に返すときはこちらを使う。
	 * 点数と判定理由は、管理者が本人にも見せると決めたときだけ含める
	 */
	@bindThis
	public async packForSelf(
		src: MiSignin,
	) {
		const packed = await this.pack(src);
		if (this.loginRiskService.isDetailVisibleToUser()) return packed;
		return { ...packed, riskScore: null, riskReasons: [] };
	}
}
