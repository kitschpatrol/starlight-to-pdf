import { afterEach, describe, expect, it, vi } from 'vitest'
import { runQpdf } from '../src/lib/qpdf'
import { writePdf } from './pdf'

const EXIT_CODE_ERROR_REGEX = /^qpdf exited with code 2: /v
const NOT_A_PDF = new TextEncoder().encode('Not a PDF')

/** Writes a PDF of one empty page. */
function writePagePdf(xrefOffsetError = 0): Uint8Array {
	return writePdf(
		[
			'<< /Type /Catalog /Pages 2 0 R >>',
			'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
			'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
		],
		xrefOffsetError,
	)
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('runQpdf', () => {
	it('should return the file that qpdf writes with the options', async () => {
		const pdf = await runQpdf(writePagePdf(), ['--object-streams=generate'])
		expect(new TextDecoder('latin1').decode(pdf.subarray(0, 8))).toBe('%PDF-1.5')

		const json = new TextDecoder().decode(await runQpdf(pdf, ['--json=2', '--json-key=pages']))
		expect(JSON.parse(json)).toHaveProperty('pages[0].object')
	})

	it('should fail with the messages of qpdf on one line', async () => {
		await expect(runQpdf(NOT_A_PDF, [])).rejects.toThrow(
			"qpdf exited with code 2: WARNING: /input.pdf: can't find PDF header; /input.pdf: can't find startxref",
		)
	})

	it('should fail on a PDF whose cross-reference table is off', async () => {
		await expect(runQpdf(writePagePdf(7), [])).rejects.toThrow(EXIT_CODE_ERROR_REGEX)
	})

	it('should leave the exit code of the process and the console alone', async () => {
		const consoleError = vi.spyOn(console, 'error')
		const consoleLog = vi.spyOn(console, 'log')
		const { exitCode } = process

		await expect(runQpdf(NOT_A_PDF, [])).rejects.toThrow()
		await runQpdf(writePagePdf(), ['--verbose'])

		expect(process.exitCode).toBe(exitCode)
		expect(consoleError).not.toHaveBeenCalled()
		expect(consoleLog).not.toHaveBeenCalled()
	})
})
