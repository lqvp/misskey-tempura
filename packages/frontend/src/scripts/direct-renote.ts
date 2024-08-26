import * as Misskey from 'misskey-js';
import { ShallowRef } from 'vue';
import { getAppearNote } from './get-appear-note.js';
import { misskeyApi } from './misskey-api.js';
import { smallerVisibility } from './get-note-menu.js';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';

export function directRenote(props: {
	note: Misskey.entities.Note;
	renoteButton: ShallowRef<HTMLElement | undefined>;
	mock?: boolean;
}) {
	const appearNote = getAppearNote(props.note);

	const configuredVisibility = defaultStore.state.rememberNoteVisibility ? defaultStore.state.visibility : defaultStore.state.defaultNoteVisibility;
	const localOnly = defaultStore.state.rememberNoteVisibility ? defaultStore.state.localOnly : defaultStore.state.defaultNoteLocalOnly;

	let visibility = appearNote.visibility;
	visibility = smallerVisibility(visibility, configuredVisibility);

	const el = props.renoteButton.value;
	if (el) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		const { dispose } = os.popup(MkRippleEffect, { x, y }, {
			end: () => dispose(),
		});
	}

	if (!props.mock) {
		misskeyApi('notes/create', {
			localOnly,
			visibility,
			renoteId: appearNote.id,
		}).then(() => {
			os.toast(i18n.ts.renoted);
		});
	}
}
