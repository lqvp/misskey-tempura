import * as Misskey from 'misskey-js';
import { ShallowRef } from 'vue';
import { getAppearNote } from './get-appear-note.js';
import * as os from '@/os.js';

export function directQuote(props: {
	note: Misskey.entities.Note;
	mock?: boolean;
}) {
	const appearNote = getAppearNote(props.note);
	return os.post({
		renote: appearNote,
	});
}
