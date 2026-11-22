/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type Entry = {
	count: number;
	visible?: boolean;
	pending?: Promise<boolean>;
};

export class ReactionVisibilityCache {
	private entries = new Map<string, Entry>();

	constructor(private check: (type: string) => Promise<boolean>) {}

	clear(): void {
		this.entries.clear();
	}

	async getVisible(reactions: Record<string, number>): Promise<Set<string>> {
		for (const type of this.entries.keys()) {
			if (!(reactions[type] > 0)) this.entries.delete(type);
		}
		const types = Object.keys(reactions).filter(type => reactions[type] > 0);
		const results = await Promise.all(types.map(type => this.resolve(type, reactions[type])));
		return new Set(types.filter((_, i) => results[i]));
	}

	private resolve(type: string, count: number): Promise<boolean> {
		let entry = this.entries.get(type);
		if (!entry || count < entry.count) {
			entry = { count };
			this.entries.set(type, entry);
		}
		const previousCount = entry.count;
		entry.count = count;
		if (entry.visible === true) return Promise.resolve(true);
		if (entry.pending) return entry.pending;
		if (entry.visible === false && previousCount === count) return Promise.resolve(false);
		const current = entry;
		current.pending = (async () => {
			try {
				let checkedCount: number;
				do {
					checkedCount = current.count;
					current.visible = await this.check(type);
				} while (!current.visible && checkedCount !== current.count && this.entries.get(type) === current);
				return current.visible;
			} catch (error) {
				if (this.entries.get(type) === current) this.entries.delete(type);
				throw error;
			} finally {
				current.pending = undefined;
			}
		})();
		return current.pending;
	}
}
