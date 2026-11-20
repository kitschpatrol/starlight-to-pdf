import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setLogger } from '../src/lib/log'
import rasterizeCanvases from '../src/lib/rasterize-canvases'

let browser: Browser

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

describe('rasterizeCanvases', () => {
	it('should replace readable canvases with images and keep the others', async () => {
		const page = await browser.newPage()
		await page.setRequestInterception(true)
		page.on('request', (request) => {
			void request.respond(
				request.resourceType() === 'document'
					? {
							body: `<!doctype html>
								<div class="sl-markdown-content">
									<canvas id="chart" class="chart" width="400" height="100" style="width: 200px"></canvas>
									<canvas id="bitmap"></canvas>
									<canvas id="tainted"></canvas>
								</div>
								<canvas id="outside"></canvas>
								<script>
									document.querySelector('#chart').getContext('2d').fillRect(0, 0, 400, 100)
									document.querySelector('#bitmap').getContext('bitmaprenderer')
									const image = new Image()
									image.src = 'https://other.example/image.svg'
									window.tainted = new Promise((resolve) => {
										image.addEventListener('load', () => {
											document.querySelector('#tainted').getContext('2d').drawImage(image, 0, 0)
											resolve()
										})
									})
								</script>`,
							contentType: 'text/html',
						}
					: {
							body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
							contentType: 'image/svg+xml',
						},
			)
		})
		await page.goto('https://docs.example/page/')
		await page.evaluate(async () => {
			// @ts-expect-error -- Set by the fixture script
			await globalThis.tainted
		})

		expect(await rasterizeCanvases(page)).toBe(2)

		const tags = await page.$$eval('[id]', (elements) =>
			elements.map((element) => `${element.id}: ${element.tagName.toLowerCase()}`),
		)
		expect(tags).toEqual(['chart: img', 'bitmap: canvas', 'tainted: canvas', 'outside: canvas'])

		const chart = await page.$eval('#chart', (image) => ({
			className: image.className,
			hasSizeAttributes: image.hasAttribute('width') || image.hasAttribute('height'),
			source: image.getAttribute('src')?.slice(0, 22),
			style: image.getAttribute('style') ?? undefined,
		}))
		expect(chart).toEqual({
			className: 'chart',
			hasSizeAttributes: false,
			source: 'data:image/png;base64,',
			style: 'width: 200px; max-width: 100%; height: auto;',
		})
	})

	it('should not count unreadable canvases that print styles hide', async () => {
		const page = await browser.newPage()
		await page.setContent(`
			<style>@media print { .demo { display: none; } }</style>
			<div class="sl-markdown-content">
				<div class="demo"><canvas id="demo"></canvas></div>
			</div>
			<script>document.querySelector('#demo').getContext('bitmaprenderer')</script>`)

		expect(await rasterizeCanvases(page)).toBe(0)
		// The page returns to its screen styles
		expect(await page.evaluate(() => matchMedia('print').matches)).toBe(false)
	})

	it('should replace canvases in open shadow roots of the content', async () => {
		const page = await browser.newPage()
		await page.setContent(`
			<div class="sl-markdown-content"><div id="host"></div></div>
			<script>
				const canvas = document.createElement('canvas')
				canvas.getContext('2d').fillRect(0, 0, 10, 10)
				document.querySelector('#host').attachShadow({ mode: 'open' }).append(canvas)
			</script>`)

		await rasterizeCanvases(page)

		expect(await page.$eval('#host', (host) => host.shadowRoot?.firstElementChild?.tagName)).toBe(
			'IMG',
		)
	})
})
