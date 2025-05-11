// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const enum State {
	Stopped,
	Running,
	Paused
}

const interval = 50;
let get_now = Date.now;

class Timer {
	private _state: State = State.Stopped;
	private _elapsed: number = 0;
	private _t0: number = 0;
	private _tobj: NodeJS.Timeout | undefined;
	private _cb: (time:number)=>void;

	constructor(cb: (time:number)=>void) {
		this._cb = cb;
	}

	get state(): State {
		return this._state;
	}

	elapsed(): number {
		if (this._state === State.Running) {
			return this._elapsed + get_now() - this._t0;
		} else {
			return this._elapsed;
		}
	}

	private update() {
		this._cb(this.elapsed());
	}

	start() {
		if (this._tobj) {
			// case restart
			clearInterval(this._tobj);
		}
		this._elapsed = 0;
		this._t0 = get_now();
		this._state = State.Running;
		this._tobj = setInterval(()=>this.update(), interval);
	}
	pause() {
		clearInterval(this._tobj);
		this._elapsed += get_now() - this._t0;
		this._t0 = 0;
		this._state = State.Paused;
		this._tobj = undefined;
		this._cb(this._elapsed);
	}
	continue() {
		this._t0 = get_now();
		this._state = State.Running;
		this._tobj = setInterval(()=>this.update(), interval);
	}
	stop() {
		if (this._tobj) {
			clearInterval(this._tobj);
			this._elapsed += get_now() - this._t0;
			this._t0 = 0;
			this._tobj = undefined;
		}
		this._state = State.Stopped;
		this._cb(this._elapsed);
	}
	reset() {
		this._elapsed = 0;
		this._t0 = 0;
		this._state = State.Stopped;
		this._cb(0);
	}
}

function formatDateTime(time: number): string {
	let secs = Math.floor(time / 1000);

    let _h = Math.floor(secs / 3600);
    let _m = Math.floor((secs % 3600) / 60);
    let _s = Math.floor(secs % 60);
	let _ms = time % 1000;

    const hh = _h.toString().padStart(2, '0');
    const mm = _m.toString().padStart(2, '0');
    const ss = _s.toString().padStart(2, '0');
	const ms = _ms.toString().padStart(3, '0');
    return `${hh}:${mm}:${ss}:${ms}`;
}

class TimerCtrl {
	private _txtItem: vscode.StatusBarItem;
	private _stopItem: vscode.StatusBarItem;
	private _d: Timer;
	private _records: number[] = [];
	private _recordEnable: boolean = false;
	private _recordAbsTime: boolean = true;
	private _visibility: boolean = true;
	private _cfgListener: vscode.Disposable;

	constructor(context: vscode.ExtensionContext) {
		this._txtItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		this._txtItem.text = '00:00:00:000';
		this._stopItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		this._d = new Timer((t:number)=>{
			this._txtItem.text = formatDateTime(t);
		});

		let cfg = vscode.workspace.getConfiguration('light-stopwatch');
		this._recordEnable = cfg.get('enableRecords')!;
		this._recordAbsTime = cfg.get('defaultAbsRecrod')!;
		this._visibility = cfg.get('defaultShow')!;

		this.onChange();
		if (this._visibility) {
			this._txtItem.show();
			this._stopItem.show();
		}

		context.subscriptions.push(
			this._txtItem,
			this._stopItem,
		);

		this._cfgListener = vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent)=>{
			if (!e.affectsConfiguration('light-stopwatch.enableRecords')) {
				return;
			}
			let cfg = vscode.workspace.getConfiguration('light-stopwatch');
			this._recordEnable = cfg.get('enableRecords')!;
			this.onChange();
		}, this);
	}

	get currentTime(): string {
		return this._txtItem.text;
	}

	private onChange() {
		let stateDesc = '';
		let cmdDesc = '';

		switch (this._d.state) {
			case State.Stopped:
				this._txtItem.command = 'light-stopwatch.start';
				stateDesc = 'Stopped';
				cmdDesc = 'click to start';
				this._stopItem.text = '$(discard)';
				this._stopItem.command = 'light-stopwatch.reset';
				this._stopItem.tooltip = 'Reset';
				break;
			case State.Running:
				this._txtItem.command = 'light-stopwatch.pause';
				stateDesc = 'Running';
				cmdDesc = 'click to pause';
				this._stopItem.text = '$(debug-stop)';
				this._stopItem.command = 'light-stopwatch.stop';
				this._stopItem.tooltip = 'Stop';
				break;
			case State.Paused:
				this._txtItem.command = 'light-stopwatch.continue';
				stateDesc = 'Paused';
				cmdDesc = 'click to continue';
				this._stopItem.text = '$(discard)';
				this._stopItem.command = 'light-stopwatch.reset';
				this._stopItem.tooltip = 'Reset';
				break;
		}

		let tooltip = new vscode.MarkdownString('', true);
		tooltip.isTrusted = true;
		if (this._recordEnable) {
			tooltip.appendMarkdown('Records &nbsp;\
				[$(diff-added)](command:light-stopwatch.record "Add a New Record") \
				[$(copy)](command:light-stopwatch.copyRecords "Copy Records") \
				[$(list-selection)](command:light-stopwatch.toggleRecordMode "Toggle Record Mode")'
			);
			if (this._records.length > 0) {
				tooltip.appendMarkdown(
					`\n|Item|${this._recordAbsTime?"Time":"Diff Time"}|\n|---|---|\n`
					+ this.recordTxt('|', '|', '|')
				);
			}
			tooltip.appendMarkdown('\n\n----\n');
		}
		tooltip.appendMarkdown(`${stateDesc} | *${cmdDesc}* &nbsp;&nbsp;\
			[$(copy)](command:light-stopwatch.copyTime "Copy Time") | \
			[$(circle-slash)Hide](command:light-stopwatch.toggleVisualizability "Hide")`);

		// only change markdownstring.value will sometimes dont update display
		this._txtItem.tooltip = tooltip;
	}

	start() {
		this._records = [];
		this._d.start();
		this.onChange();
	}
	pause() {
		if (this._d.state !== State.Running) {
			return;
		}
		this._d.pause();
		this.onChange();
	}
	continue() {
		if (this._d.state !== State.Paused) {
			return;
		}
		this._d.continue();
		this.onChange();
	}
	stop() {
		this._d.stop();
		this.onChange();
	}
	reset() {
		this._records = [];
		this._d.reset();
		this.onChange();
	}
	close() {
		this.reset();
		this._cfgListener.dispose();
	}
	record() {
		this._records.push(this._d.elapsed());
		this.onChange();
	}
	recordTxt(be:string, en:string, delim:string): string {
		let txt = '';
		if (this._records.length === 0) {
			return txt;
		}
		if (this._recordAbsTime) {
			for (let i=0;i<this._records.length;i++) {
				txt += `${be}${i+1}${delim}${formatDateTime(this._records[i])}${en}\n`;
			}
		} else {
			txt += `${be}1${delim}${formatDateTime(this._records[0])}${en}\n`;
			for (let i=1;i<this._records.length;i++) {
				txt += `${be}${i+1}${delim}${formatDateTime(this._records[i]-this._records[i-1])}${en}\n`;
			}
		}
		return txt;
	}
	toggleVisualizability() {
		this._visibility = !this._visibility;
		if (this._visibility) {
			this._txtItem.show();
			this._stopItem.show();
		} else {
			this.reset();
			this._txtItem.hide();
			this._stopItem.hide();
		}
	}
	toggleRecordMode() {
		this._recordAbsTime = !this._recordAbsTime;
		this.onChange();
	}
}

let timer: TimerCtrl;

export function activate(context: vscode.ExtensionContext) {

	console.log('light stopwatch active.');

	timer = new TimerCtrl(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('light-stopwatch.start', () => {
			timer.start();
		}),
		vscode.commands.registerCommand('light-stopwatch.pause', () => {
			timer.pause();
		}),
		vscode.commands.registerCommand('light-stopwatch.continue', () => {
			timer.continue();
		}),
		vscode.commands.registerCommand('light-stopwatch.stop', () => {
			timer.stop();
		}),
		vscode.commands.registerCommand('light-stopwatch.reset', () => {
			timer.reset();
		}),
		vscode.commands.registerCommand('light-stopwatch.copyTime', async () => {
			try {
				await vscode.env.clipboard.writeText(timer.currentTime);
			} catch (ex) {
				console.warn('stopwatch write clipboard:', ex);
				vscode.window.showWarningMessage(`stopwatch copy to clipboard fail: ${ex}`);
			}
		}),
		vscode.commands.registerCommand('light-stopwatch.toggleVisualizability', () => {
			timer.toggleVisualizability();
		}),
		vscode.commands.registerCommand('light-stopwatch.record', () => {
			timer.record();
		}),
		vscode.commands.registerCommand('light-stopwatch.copyRecords', async () => {
			try {
				await vscode.env.clipboard.writeText(timer.recordTxt('', '', ', '));
			} catch (ex) {
				console.warn('stopwatch write clipboard:', ex);
				vscode.window.showWarningMessage(`stopwatch copy to clipboard fail: ${ex}`);
			}
		}),
		vscode.commands.registerCommand('light-stopwatch.toggleRecordMode', () => {
			timer.toggleRecordMode();
		}),
	);
}

export function deactivate() {
	timer.close();
}
