import { spawn } from "child_process";

// export const ConveyorStop = Symbol("stop");
// export const ConveyorPause = Symbol('pause');

// <I NextInput, N NextResult, F FinishResult>>
interface Config<I, N, F> {
	command: string;
	args?: string[];
	cwd?: string;
	parseJson?: boolean;
	debug?: boolean;
	onNext(input: I): Promise<N>;
	onFinish?(results: N[] /*, errors: any[]*/): F | Promise<F>;

	// Todo: implement these
	// timeoutSeconds?: number;
	// maxBufferSize?: number; -> and another one to configure whether to drop old or new output
	// onError?(error: string): unknown | Promise<unknown>;
	// onFail?(): unknown | Promise<unknown>;
}

interface ConfigWithFinish<I, N, F> extends Config<I, N, F> {
	onFinish(results: N[] /*, errors: any[]*/): F | Promise<F>;
}

export async function Conveyor<I = string, N = void, F = void>(config: ConfigWithFinish<I, N, F>): Promise<F>;
export async function Conveyor<I = string, N = void, F = void>(config: Config<I, N, F>): Promise<void | F> {
	const command = spawn(config.command, config.args || [], {
		cwd: config.cwd,
		stdio: "pipe",
	});

	const buffer: string[] = [];
	const results: N[] = [];

	let tempBuffer: string = "";

	command.stdout.on("data", (data: Buffer) => {
		const string = data.toString();
		if (config.debug) console.log("Stdout:", string);

		tempBuffer += string;

		while (tempBuffer.includes("\n")) {
			const index = tempBuffer.indexOf("\n");
			const part = tempBuffer.slice(0, index).trim();
			if (part) buffer.push(part);
			tempBuffer = tempBuffer.slice(index + 1);
		}
	});

	command.stderr.on("data", (data: Buffer) => {
		if (config.debug) console.log("Stderr:", data.toString());
	});

	let running = false;

	const next = async () => {
		if (!buffer.length || running) return;
		running = true;

		const nextValue = buffer.shift()!;

		if (config.parseJson) {
			// if (config.debug) console.log("Parsing", nextValue);
			// Todo: wrap in trycatch and log the value that couldn't be parsed
			const data = JSON.parse(nextValue) as I;
			const result = await config.onNext(data);
			results.push(result);
		} else {
			const result = await config.onNext(nextValue as unknown as I);
			results.push(result);
		}

		running = false;
	};

	while (command.exitCode === null || running || buffer.length) {
		if (buffer.length && !running) await next();
		else await new Promise((r) => setTimeout(r, 100));
	}

	if (config.onFinish) return config.onFinish(results);
	else return;
}
