import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fillContentsPageNumbers, readTargetPages } from '../src/lib/contents-page-numbers'

let browser: Browser

beforeAll(async () => {
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

// A table of contents on page 1, followed by targets on pages 2 and 4
const FIXTURE = `
	<div class="s2pdf-contents">
		<ul>
			<li>
				<a href="#/docs/guide"><span class="s2pdf-contents-title">Guide</span><span class="s2pdf-contents-page"></span></a>
				<ul>
					<li><a href="#/docs/guide-café"><span class="s2pdf-contents-title">Café</span><span class="s2pdf-contents-page"></span></a></li>
				</ul>
			</li>
			<li><a href="#missing"><span class="s2pdf-contents-title">Missing</span><span class="s2pdf-contents-page"></span></a></li>
		</ul>
	</div>
	<h1 id="/docs/guide" style="break-before: page">Guide</h1>
	<p style="break-after: page">Text</p>
	<p style="break-after: page">More text</p>
	<h2 id="/docs/guide-café">Café</h2>`

async function openFixture(): Promise<Page> {
	const page = await browser.newPage()
	await page.setContent(FIXTURE)
	return page
}

describe('readTargetPages', () => {
	it('should read the page each link target of a PDF from Chrome starts on', async () => {
		const page = await openFixture()
		const pdf = await page.pdf({ format: 'letter' })

		expect(Object.fromEntries(readTargetPages(pdf))).toEqual({
			'/docs/guide': 2,
			'/docs/guide-café': 4,
		})
	})

	it('should read nothing from data that is not a PDF from Chrome', () => {
		expect(readTargetPages(new TextEncoder().encode('%PDF-1.7\n%%EOF\n')).size).toBe(0)
	})
})

describe('fillContentsPageNumbers', () => {
	it('should fill in the page numbers of the entries with a target', async () => {
		const page = await openFixture()
		const pdf = await page.pdf({ format: 'letter' })

		expect(await fillContentsPageNumbers(page, pdf)).toBe(2)
		const numbers = await page.$$eval('.s2pdf-contents-page', (elements) =>
			elements.map((element) => element.textContent),
		)
		expect(numbers).toEqual(['2', '4', ''])
	})
})
