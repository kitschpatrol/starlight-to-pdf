import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fitGraphicsToPage from '../src/lib/fit-graphics'
import { setLogger } from '../src/lib/log'
import { resolveOptions } from '../src/lib/options'
import { getPrintLayout } from '../src/lib/print-layout'

const options = resolveOptions({ url: 'https://example.com' })
const { contentHeightPixels } = getPrintLayout(options)

// A 1:4 portrait image, far taller than a page at the content width
const TALL_IMAGE = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="400"/>',
)}`

let browser: Browser

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

async function fitContent(html: string): Promise<Page> {
	const page = await browser.newPage()
	await page.setContent(`<body style="margin: 0">${html}</body>`)
	await fitGraphicsToPage(page, options)
	return page
}

async function getHeight(page: Page, selector: string): Promise<number> {
	return page.$eval(selector, (element) => element.getBoundingClientRect().height)
}

describe('fitGraphicsToPage', () => {
	it('should scale a tall SVG so its figure fits on one page with the caption', async () => {
		const page = await fitContent(`
			<figure style="margin: 0">
				<svg viewBox="0 0 100 400" style="display: block; width: 100%"></svg>
				<figcaption style="height: 100px">Caption</figcaption>
			</figure>`)
		const figureHeight = await getHeight(page, 'figure')
		expect(figureHeight).toBeLessThanOrEqual(contentHeightPixels)
		expect(figureHeight).toBeGreaterThan(contentHeightPixels - 5)
	})

	it('should scale a tall image to the page height without distorting it', async () => {
		const page = await fitContent(`<img src="${TALL_IMAGE}" style="display: block; width: 100%">`)
		expect(await getHeight(page, 'img')).toBeLessThanOrEqual(contentHeightPixels)
		expect(await page.$eval('img', (image) => getComputedStyle(image).objectFit)).toBe('contain')
	})

	it('should leave graphics that fit on a page unchanged', async () => {
		const page = await fitContent(`
			<figure style="margin: 0">
				<svg viewBox="0 0 100 100" style="display: block; width: 100px"></svg>
				<figcaption>Caption</figcaption>
			</figure>`)
		expect(await page.$eval('svg', (svg) => svg.style.maxHeight)).toBe('')
		expect(await getHeight(page, 'svg')).toBe(100)
	})

	it('should fit only the graphic when the rest of its figure takes over half a page', async () => {
		const page = await fitContent(`
			<figure style="margin: 0">
				<svg viewBox="0 0 100 400" style="display: block; width: 100%"></svg>
				<figcaption style="height: ${contentHeightPixels * 0.6}px">Long caption</figcaption>
			</figure>`)
		const svgHeight = await getHeight(page, 'svg')
		expect(svgHeight).toBeLessThanOrEqual(contentHeightPixels)
		expect(svgHeight).toBeGreaterThan(contentHeightPixels - 5)
	})

	it('should fit each graphic of a figure with several graphics on its own', async () => {
		const page = await fitContent(`
			<figure style="margin: 0">
				<svg class="first" viewBox="0 0 100 400" style="display: block; width: 100%"></svg>
				<svg class="second" viewBox="0 0 100 400" style="display: block; width: 100%"></svg>
			</figure>`)
		for (const selector of ['.first', '.second']) {
			const height = await getHeight(page, selector)
			expect(height).toBeLessThanOrEqual(contentHeightPixels)
			expect(height).toBeGreaterThan(contentHeightPixels - 5)
		}
	})

	it('should skip SVGs without a viewBox, nested SVGs, and hidden graphics', async () => {
		const page = await fitContent(`
			<svg class="fixed" width="100" height="2000"></svg>
			<svg class="outer" viewBox="0 0 100 2000" style="display: block; width: 100%">
				<svg class="nested" viewBox="0 0 10 10" width="100" height="1500"></svg>
			</svg>
			<img class="hidden" src="${TALL_IMAGE}" style="display: none">`)
		const cappedClasses = await page.$$eval('svg, img', (elements) =>
			elements
				.filter((element) => element instanceof HTMLElement || element instanceof SVGElement)
				.filter((element) => element.style.maxHeight !== '')
				.map((element) => element.getAttribute('class')),
		)
		expect(cappedClasses).toEqual(['outer'])
	})
})
