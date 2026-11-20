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

		await rasterizeCanvases(page)

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
})
