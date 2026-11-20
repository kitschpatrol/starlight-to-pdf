import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/lib/options'
import { namePrintUnits } from '../src/lib/print-units'

let browser: Browser

beforeAll(async () => {
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

describe('namePrintUnits', () => {
	it('should name the pages of each unit and find its kind and title', async () => {
		const page = await browser.newPage()
		await page.setContent(`
			<section id="cover" class="s2pdf-cover s2pdf-pagebreak">Cover</section>
			<p id="preceding">Preceding</p>
			<div id="contents" class="s2pdf-contents s2pdf-pagebreak" data-s2pdf-title="Contents">Contents</div>
			<div class="s2pdf-container">
				<div id="design-heading" data-s2pdf-title="Design"><h1>Design</h1></div>
				<div id="design" class="s2pdf-pagebreak">Design content</div>
				<div id="technical-heading" data-s2pdf-title="Technical"><h1>Technical</h1></div>
				<div id="technical" class="s2pdf-pagebreak">Technical content</div>
			</div>
			<p id="following">Following</p>
			<section id="back-page" class="s2pdf-back-page">Back page</section>`)

		const units = await namePrintUnits(page, resolveOptions({ url: 'https://example.com' }))
		expect(units.map(({ kind, title }) => ({ kind, title }))).toEqual([
			{ kind: 'cover', title: undefined },
			{ kind: 'content', title: 'Contents' },
			{ kind: 'content', title: 'Design' },
			{ kind: 'content', title: 'Technical' },
			{ kind: 'content', title: undefined },
			{ kind: 'back-page', title: undefined },
		])

		const pageNames = await page.$$eval('[id]', (elements) =>
			Object.fromEntries(elements.map((element) => [element.id, getComputedStyle(element).page])),
		)
		expect(pageNames).toEqual({
			'back-page': 's2pdf-page-5',
			contents: 's2pdf-page-1',
			cover: 's2pdf-page-0',
			design: 's2pdf-page-2',
			'design-heading': 's2pdf-page-2',
			following: 's2pdf-page-4',
			preceding: 's2pdf-page-1',
			technical: 's2pdf-page-3',
			'technical-heading': 's2pdf-page-3',
		})
	})
})
