import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveLinkDestinations } from '../src/lib/resolve-link-destinations'

const STARTXREF_REGEX = /startxref\s+(?<offset>\d+)\s+%%EOF\s*$/v
const TARGET_DESTINATION_REGEX = /\/target\s*(?<destination>\[[^\[\]]*\])/v
const XREF_SECTION_REGEX = /^xref\n(?<number>\d+) 1\n(?<offset>\d{10}) 00000 n \n/v
const EXPLICIT_DESTINATION_REGEX = /^\[\d+ 0 R \/XYZ /v

let browser: Browser

beforeAll(async () => {
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

async function printPdf(html: string): Promise<Uint8Array> {
	const page = await browser.newPage()
	await page.setContent(html)
	const pdf = await page.pdf({ format: 'letter' })
	await page.close()
	return pdf
}

function decode(pdf: Uint8Array): string {
	return new TextDecoder('latin1').decode(pdf)
}

function getXrefOffset(text: string): number {
	return Number(STARTXREF_REGEX.exec(text)?.groups?.offset)
}

describe('resolveLinkDestinations', () => {
	it('should point internal links at the explicit destination of their name', async () => {
		const original = await printPdf(`
			<a href="#target">Jump</a>
			<a href="https://example.com/">External</a>
			<h2 id="target" style="break-before: page">Target</h2>`)
		const { linkCount, pdf } = resolveLinkDestinations(original)
		expect(linkCount).toBe(1)

		// An incremental update keeps the original bytes
		expect(pdf.subarray(0, original.length)).toEqual(original)

		const originalText = decode(original)
		const text = decode(pdf)
		const update = text.slice(original.length)
		const destination = TARGET_DESTINATION_REGEX.exec(originalText)?.groups?.destination
		expect(destination).toMatch(EXPLICIT_DESTINATION_REGEX)
		expect(update).toContain(`/Dest ${destination}`)
		expect(update).not.toContain('/Dest /target')
		expect(update).not.toContain('https://example.com/')

		// The new cross-reference section points at the new object and back at
		// the original section
		const xrefSection = text.slice(getXrefOffset(text))
		const { number, offset } = XREF_SECTION_REGEX.exec(xrefSection)?.groups ?? {}
		expect(text.slice(Number(offset)).startsWith(`${number} 0 obj\n`)).toBe(true)
		expect(xrefSection).toContain(`/Prev ${getXrefOffset(originalText)}>>`)
	})

	it('should leave a PDF without internal links unchanged', async () => {
		const original = await printPdf('<a href="https://example.com/">External</a>')
		expect(resolveLinkDestinations(original)).toEqual({ linkCount: 0, pdf: original })
	})

	it('should leave data that is not structured like a PDF from Chrome unchanged', () => {
		const data = new TextEncoder().encode('%PDF-1.7\nNot what Chrome writes\n%%EOF\n')
		expect(resolveLinkDestinations(data)).toEqual({ linkCount: 0, pdf: data })
	})
})
