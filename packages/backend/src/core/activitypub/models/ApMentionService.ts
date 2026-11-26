/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import promiseLimit from 'promise-limit';
import type { MiUser } from '@/models/_.js';
import { toArray, unique } from '@/misc/prelude/array.js';
import { bindThis } from '@/decorators.js';
import { isMention } from '../type.js';
import { Resolver } from '../ApResolverService.js';
import { ApPersonService } from './ApPersonService.js';
import type { IObject, IApMention } from '../type.js';

@Injectable()
export class ApMentionService {
	constructor(
		private apPersonService: ApPersonService,
	) {
	}

	@bindThis
	public async extractApMentions(tags: IObject | IObject[] | null | undefined, resolver: Resolver): Promise<MiUser[]> {
		// リモートが大量のメンションを送ってきた場合の連鎖フェッチを防ぐため、解決対象の人数を制限する
		const MAX_MENTION_USERS = 100;
		const hrefs = unique(this.extractApMentionObjects(tags).map(x => x.href)).slice(0, MAX_MENTION_USERS);

		const limit = promiseLimit<MiUser | null>(2);
		const mentionedUsers = (await Promise.all(
			hrefs.map(x => limit(() => this.apPersonService.resolvePerson(x, resolver).catch(() => null))),
		)).filter(x => x != null);

		return mentionedUsers;
	}

	@bindThis
	public extractApMentionObjects(tags: IObject | IObject[] | null | undefined): IApMention[] {
		if (tags == null) return [];
		return toArray(tags).filter(isMention);
	}
}
