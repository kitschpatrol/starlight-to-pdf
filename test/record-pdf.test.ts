import type { Browser, Page } from 'puppeteer'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import compressPdf from '../src/lib/compress-pdf'
import { setLogger } from '../src/lib/log'
import { resolveOptions } from '../src/lib/options'
import recordPdf from '../src/lib/record-pdf'
import { resolveLinkDestinations } from '../src/lib/resolve-link-destinations'
import { readPdf } from './pdf'

const REFERENCE_REGEX = /^\d+ 0 R$/v

let browser: Browser
let chromePdf: Uint8Array
let directory: string

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
	const page = await browser.newPage()
	await page.setContent(`
		<title>Record test</title>
		<h1>Record test</h1>
		<p><a href="#target">Jump to the target</a></p>
		<h2 id="target" style="break-before: page">Target</h2>`)
	chromePdf = await page.pdf({ format: 'letter', outline: true, tagged: true })
	await page.close()
	directory = await mkdtemp(path.join(tmpdir(), 'starlight-to-pdf-'))
}, 60_000)

afterAll(async () => {
	await browser.close()
	await rm(directory, { force: true, recursive: true })
})

/** Records a page that Chrome prints as the PDF and returns the saved file. */
async function record(pdf: Uint8Array, filename: string): Promise<Uint8Array> {
	const page: Page = await browser.newPage()
	vi.spyOn(page, 'pdf').mockResolvedValue(pdf)
	const options = resolveOptions({ filename, path: directory, url: 'https://docs.example' })
	return readFile(await recordPdf({ hostname: 'docs.example', options, page }))
}

/** Reads the destinations of the links of the PDF. */
async function getLinkDestinations(pdf: Uint8Array): Promise<unknown[]> {
	const { dictionaries } = await readPdf(pdf)
	return dictionaries
		.values()
		.filter((dictionary) => dictionary['/Subtype'] === '/Link')
		.map((link) => link['/Dest'])
		.toArray()
}

describe('recordPdf', () => {
	it('should save the compressed PDF, with links pointing straight at their page', async () => {
		const saved = await record(chromePdf, 'compressed')
		expect(saved.length).toBeLessThan(chromePdf.length)
		expect(new Uint8Array(saved)).toEqual(await compressPdf(resolveLinkDestinations(chromePdf).pdf))
		expect(await getLinkDestinations(chromePdf)).toEqual(['/target'])
		// A reference to the page and a position on it
		expect(await getLinkDestinations(saved)).toEqual([
			[expect.stringMatching(REFERENCE_REGEX), '/XYZ', expect.any(Number), expect.any(Number), 0],
		])
	})

	it('should save the PDF as it is when compression does not make it smaller', async () => {
		const compressed = await compressPdf(chromePdf)
		const recompressed = await compressPdf(compressed)
		expect(recompressed.length).toBeGreaterThanOrEqual(compressed.length)

		const saved = await record(compressed, 'kept')
		expect(new Uint8Array(saved)).toEqual(compressed)
	})

	it('should save the PDF as Chrome printed it, with a warning, when it cannot be compressed', async () => {
		const warnings: string[] = []
		const ignore = (): undefined => undefined
		setLogger({
			debug: ignore,
			error: ignore,
			info: ignore,
			warn(...data: unknown[]) {
				warnings.push(data.join(' '))
			},
		})
		try {
			const unreadable = new TextEncoder().encode('Not a PDF')
			const saved = await record(unreadable, 'unreadable')
			expect(new Uint8Array(saved)).toEqual(unreadable)
			// Without the colors and line breaks of the console output
			const warning = warnings
				.join(' ')
				.replaceAll('\u{1B}', '')
				.replaceAll(/\[\d+m/gv, '')
				.replaceAll(/\s+/gv, ' ')
			expect(warning).toContain("Couldn't compress the PDF file")
			expect(warning).toContain("so it's saved as Chrome printed it")
		} finally {
			setLogger()
		}
	})
})
