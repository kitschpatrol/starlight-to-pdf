import type { Browser } from 'puppeteer'
import { createHash } from 'node:crypto'
import { deflateSync, inflateSync } from 'node:zlib'
import puppeteer from 'puppeteer'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PdfDocument, PdfOutlineItem, PdfValue } from './pdf'
import compressPdf from '../src/lib/compress-pdf'
import { resolveLinkDestinations } from '../src/lib/resolve-link-destinations'
import { getDictionary, readPdf, writePdf } from './pdf'

const HEADER_REGEX = /^%PDF-(?<version>\d\.\d)/v
const NOT_A_PDF_ERROR_REGEX = /^qpdf exited with code 2: /v

// Object and cross-reference streams hold the structure of the file, not its content
const FILE_STRUCTURE_TYPES = new Set(['/ObjStm', '/XRef'])

let browser: Browser

beforeAll(async () => {
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

afterEach(() => {
	vi.useRealTimers()
})

/** Prints a document as Chrome does for the tool, with tags and an outline. */
async function printPdf(html: string): Promise<Uint8Array> {
	const page = await browser.newPage()
	await page.setContent(html)
	const pdf = await page.pdf({ format: 'letter', outline: true, tagged: true })
	await page.close()
	return pdf
}

function decode(pdf: Uint8Array): string {
	return new TextDecoder('latin1').decode(pdf)
}

function getContentStreams(pdf: PdfDocument): PdfDocument['streams'] {
	return pdf.streams.filter(({ dictionary }) => {
		const type = dictionary['/Type']
		return typeof type !== 'string' || !FILE_STRUCTURE_TYPES.has(type)
	})
}

/**
 * Hashes the decoded data of each stream of the content, such as the drawing
 * instructions of the pages, the fonts, and the pixels of the images, in an
 * order that doesn't depend on the numbers of the objects.
 */
function hashStreams(pdf: PdfDocument): string[] {
	return getContentStreams(pdf)
		.map(({ data }) => createHash('sha256').update(data).digest('hex'))
		.toSorted()
}

/** Lists the titles of the outline with their page, indenting nested items. */
function getOutlineTitles(items: PdfOutlineItem[], depth = 0): string[] {
	return items.flatMap((item) => [
		`${'  '.repeat(depth)}${item.title} on page ${item.destpageposfrom1}`,
		...getOutlineTitles(item.kids, depth + 1),
	])
}

/** Lists the link annotations with their page and the page or URI they point to. */
function getLinks(pdf: PdfDocument): Array<{ page: number; target: PdfValue | undefined }> {
	const pageReferences = pdf.pages.map((page) => page.object)
	return pageReferences.flatMap((reference, index) => {
		const annotations = getDictionary(pdf, reference)['/Annots']
		return (Array.isArray(annotations) ? annotations : []).map((annotation) => {
			const link = getDictionary(pdf, annotation)
			const destination = link['/Dest']
			return {
				page: index + 1,
				target: Array.isArray(destination)
					? pageReferences.findIndex((page) => page === destination[0]) + 1
					: getDictionary(pdf, link['/A'])['/URI'],
			}
		})
	})
}

function countStructureElements(pdf: PdfDocument): number {
	return pdf.dictionaries
		.values()
		.filter((dictionary) => dictionary['/Type'] === '/StructElem')
		.toArray().length
}

describe('compressPdf', () => {
	it('should shrink a PDF from Chrome and keep its content, tags, outline, links, and metadata', async () => {
		const chromePdf = await printPdf(`<!doctype html>
			<html lang="en">
				<head><title>Compression test</title></head>
				<body>
					<h1>Contents</h1>
					<p><a href="#target">Jump to the target</a></p>
					<p><a href="https://example.com/">An external link</a></p>
					<h2 id="target" style="break-before: page">Target</h2>
					<p>The end.</p>
				</body>
			</html>`)
		// As the tool does, so internal links point at pages rather than names
		const { linkCount, pdf: original } = resolveLinkDestinations(chromePdf)
		expect(linkCount).toBe(1)

		const compressed = await compressPdf(original)
		expect(compressed.length).toBeLessThan(original.length)
		// Object streams need PDF 1.5
		const header = decode(compressed.subarray(0, 16))
		expect(Number(HEADER_REGEX.exec(header)?.groups?.version)).toBeGreaterThanOrEqual(1.5)

		// Object streams pack the dictionaries of the structure tree and the links
		// and compress them, so they no longer show as text in the file
		for (const name of ['/StructElem', '/Link']) {
			expect(decode(original)).toContain(name)
			expect(decode(compressed)).not.toContain(name)
		}

		const before = await readPdf(original)
		const after = await readPdf(compressed)

		expect(hashStreams(after)).toEqual(hashStreams(before))
		expect(hashStreams(after).length).toBeGreaterThan(0)

		expect(after.pages).toHaveLength(2)
		const information = getDictionary(after, after.trailer['/Info'])
		expect(information['/Title']).toBe('u:Compression test')
		expect(information).toEqual(getDictionary(before, before.trailer['/Info']))

		const catalog = getDictionary(after, after.trailer['/Root'])
		expect(catalog['/Lang']).toBe('u:en')
		expect(catalog['/MarkInfo']).toEqual({ '/Marked': true, '/Type': '/MarkInfo' })
		expect(getDictionary(after, catalog['/StructTreeRoot'])['/Type']).toBe('/StructTreeRoot')
		expect(countStructureElements(after)).toBeGreaterThan(0)
		expect(countStructureElements(after)).toBe(countStructureElements(before))

		expect(getOutlineTitles(after.outline)).toEqual(['Contents on page 1', '  Target on page 2'])
		expect(getLinks(after)).toEqual([
			{ page: 1, target: 2 },
			{ page: 1, target: 'u:https://example.com/' },
		])
	})

	it('should deflate Flate streams again at the highest level', async () => {
		// Lines between scattered points, in which the highest level finds matches
		// that the default level misses
		const data = Buffer.from(
			Array.from(
				{ length: 4000 },
				(_, index) => `${(index * 7919) % 613} ${(index * 104_729) % 811} m ${index % 97} 0 l S`,
			).join('\n'),
		)
		const fastest = deflateSync(data, { level: 1 })
		const standard = deflateSync(data)
		expect(deflateSync(data, { level: 9 }).length).toBeLessThan(standard.length)
		const original = writePdf([
			'<< /Type /Catalog /Pages 2 0 R >>',
			'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
			'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
			`<< /Length ${fastest.length} /Filter /FlateDecode >>\nstream\n${fastest.toString('latin1')}\nendstream`,
		])

		const streams = getContentStreams(await readPdf(await compressPdf(original), false))
		expect(streams).toHaveLength(1)
		const stored = Buffer.from(streams[0]?.data ?? '', 'base64')
		expect(stored.length).toBeLessThan(standard.length)
		expect(inflateSync(stored)).toEqual(data)
	})

	it('should give the same bytes for the same PDF at another time', async () => {
		const pdf = await printPdf('<h1>Twice</h1>')
		// Qpdf would otherwise make the identifier of the file from the time
		vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z'), toFake: ['Date'] })
		const first = await compressPdf(pdf)
		vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
		expect(await compressPdf(pdf)).toEqual(first)
	})

	it('should fail on data that is not a PDF', async () => {
		await expect(compressPdf(new TextEncoder().encode('Not a PDF'))).rejects.toThrow(
			NOT_A_PDF_ERROR_REGEX,
		)
	})
})
