/*
 * SPDX-FileCopyrightText: yume/yumechi-no-kun
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class Systemd {
	private tty_dom: HTMLDivElement;
	constructor() {
		this.tty_dom = document.querySelector('#tty') as HTMLDivElement;

		console.log('Systemd started');
	}

	async start<T>(id: string, promise: Promise<T>): Promise<T> {
		let state: {
            state: 'running'
        } | {
            state: 'done'
        } | {
            state: 'failed'
            message: string
        } = { state: 'running' };

		let persistentDom : HTMLDivElement | null = null;

		const started = Date.now();

		const formatRunning = () => {
			const shiftArray = <T>(arr: T[], n: number): T[] => {
				return arr.slice(n).concat(arr.slice(0, n));
			};

			const elapsed_secs = Math.floor((Date.now() - started) / 1000);
			const stars = shiftArray(['*', '*', '*', ' ', ' ', ' '], elapsed_secs % 6);

			const spanStatus = document.createElement('span');

			spanStatus.innerText = stars.join('');
			spanStatus.className = 'tty-status-running';

			const spanMessage = document.createElement('span');
			spanMessage.innerText = `A start job is running for ${id} (${elapsed_secs}s / no limit)`;

			const div = document.createElement('div');
			div.className = 'tty-line';
			div.innerHTML = '[';
			div.appendChild(spanStatus);
			div.innerHTML += '] ';
			div.appendChild(spanMessage);

			return div;
		};

		const formatDone = () => {
			const elapsed_secs = Math.floor((Date.now() - started) / 1000);

			const spanStatus = document.createElement('span');
			spanStatus.innerText = '  OK  ';
			spanStatus.className = 'tty-status-ok';

			const spanMessage = document.createElement('span');
			spanMessage.innerText = `Finished ${id} in ${elapsed_secs}s`;

			const div = document.createElement('div');
			div.className = 'tty-line';
			div.innerHTML = '[';
			div.appendChild(spanStatus);
			div.innerHTML += '] ';
			div.appendChild(spanMessage);

			return div;
		};

		const formatFailed = (message: string) => {
			const elapsed_secs = Math.floor((Date.now() - started) / 1000);

			const spanStatus = document.createElement('span');
			spanStatus.innerText = 'FAILED';
			spanStatus.className = 'tty-status-failed';

			const spanMessage = document.createElement('span');
			spanMessage.innerText = `Failed ${id} in ${elapsed_secs}s: ${message}`;

			const div = document.createElement('div');
			div.className = 'tty-line';
			div.innerHTML = '[';
			div.appendChild(spanStatus);
			div.innerHTML += '] ';
			div.appendChild(spanMessage);

			return div;
		};

		const render = () => {
			switch (state.state) {
				case 'running':
					if (persistentDom === null) {
						persistentDom = formatRunning();
						this.tty_dom.appendChild(persistentDom);
					} else {
						persistentDom.innerHTML = formatRunning().innerHTML;
					}
					break;
				case 'done':
					if (persistentDom === null) {
						persistentDom = formatDone();
						this.tty_dom.appendChild(persistentDom);
					} else {
						persistentDom.innerHTML = formatDone().innerHTML;
					}
					break;
				case 'failed':
					if (persistentDom === null) {
						persistentDom = formatFailed(state.message);
						this.tty_dom.appendChild(persistentDom);
					} else {
						persistentDom.innerHTML = formatFailed(state.message).innerHTML;
					}
					break;
			}
		};

		render();
		const interval = setInterval(render, 500);

		try {
			const res = await promise;
			state = { state: 'done' };
			return res;
		} catch (e) {
			if (e instanceof Error) {
				state = { state: 'failed', message: e.message };
			} else {
				state = { state: 'failed', message: 'Unknown error' };
			}
			throw e;
		} finally {
			clearInterval(interval);
			render();
		}
	}

	async startSync<T>(id: string, func: () => T): Promise<T> {
		return this.start(id, (async () => {
			return func();
		})());
	}

	public emergency_mode() {
		const div = document.createElement('div');
		div.className = 'tty-line';
		div.innerText = 'You are in emergency mode. Type Ctrl-Shift-I to view logs.';
		this.tty_dom.appendChild(div);
	}
}
