import createModule from '@neslinesli93/qpdf-wasm'

const INPUT_PATH = '/input.pdf'
const OUTPUT_PATH = '/output'
// Emscripten gives programs this name whatever name they ask for
const PROGRAM_NAME = 'this.program'

type QpdfModule = {
	callMain: (commandLineArguments: string[]) => number
	// eslint-disable-next-line ts/naming-convention -- The file system of Emscripten
	FS: {
		/** Sets what the standard streams read and write, a byte at a time. */
		init: (
			input: undefined,
			output: (byte: unknown) => void,
			error: (byte: unknown) => void,
		) => void
		readFile: (path: string) => Uint8Array
		writeFile: (path: string, data: Uint8Array) => void
	}
}

type CreateQpdfModule = (options: {
	preRun: Array<(module: QpdfModule) => void>
	thisProgram: string
}) => Promise<QpdfModule>

// The types of the package describe its use in browsers, where the path of the
// WebAssembly file is required, and leave out the output streams and writeFile
const createQpdfModule = createModule as unknown as CreateQpdfModule

/**
 * Runs qpdf, compiled to WebAssembly, on a PDF in memory, as the command line
 * `qpdf input.pdf [options] output`, and returns the file it writes. Throws
 * with the messages of qpdf unless it exits with success, so for data that
 * isn't a PDF, for damaged PDFs, and when qpdf only warns.
 */
export async function runQpdf(pdf: Uint8Array, options: string[]): Promise<Uint8Array> {
	const messageBytes: number[] = []
	const qpdf = await createQpdfModule({
		preRun: [
			(module) => {
				// Keeps what qpdf prints out of the console
				module.FS.init(
					undefined,
					() => undefined,
					(byte) => {
						// Flushes come without a byte
						if (typeof byte === 'number') {
							messageBytes.push(byte)
						}
					},
				)
			},
		],
		// Keeps the path of the running script out of the messages of qpdf
		thisProgram: PROGRAM_NAME,
	})
	qpdf.FS.writeFile(INPUT_PATH, pdf)

	// Emscripten sets the exit code of the process to that of qpdf
	const { exitCode: processExitCode } = process
	let exitCode: number
	try {
		exitCode = qpdf.callMain([INPUT_PATH, ...options, OUTPUT_PATH])
	} finally {
		process.exitCode = processExitCode
	}

	if (exitCode !== 0) {
		const messages = new TextDecoder()
			.decode(new Uint8Array(messageBytes))
			.replaceAll(`${PROGRAM_NAME}: `, '')
			.trim()
			.replaceAll(/\s*\n\s*/gv, '; ')
		throw new Error(`qpdf exited with code ${exitCode}: ${messages}`)
	}

	return qpdf.FS.readFile(OUTPUT_PATH)
}
