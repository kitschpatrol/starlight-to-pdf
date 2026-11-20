import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import keepBoxesWhole from '../src/lib/keep-boxes-whole'
import { setLogger } from '../src/lib/log'
import { resolveOptions } from '../src/lib/options'
import { getPrintLayout } from '../src/lib/print-layout'

const options = resolveOptions({ url: 'https://example.com' })
const { contentHeightPixels } = getPrintLayout(options)

let browser: Browser

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

describe('keepBoxesWhole', () => {
	it('should avoid breaks inside bordered and shadowed boxes that fit on a page', async () => {
		const page = await browser.newPage()
		await page.setContent(`
			<section id="card" style="border: 1px solid gray"><h2>Card</h2><p>Chart</p></section>
			<blockquote id="quote" style="border-left: 2px solid gray">Quote</blockquote>
			<div id="shadow" style="box-shadow: 0 2px 4px gray">Shadow</div>
			<div id="tall" style="border: 1px solid gray; height: ${contentHeightPixels + 10}px">Tall</div>
			<div id="transparent" style="border: 1px solid transparent">Transparent border</div>
			<div id="no-style" style="border-width: 1px">No border style</div>
			<span id="inline" style="display: inline-block; border: 1px solid gray">Inline</span>
			<div id="plain">Plain</div>
			<div id="host"></div>
			<script>
				document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML =
					'<div id="shadow-root-card" style="border: 1px solid gray">Card</div>'
			</script>`)
		await keepBoxesWhole(page, options)

		const breakInside = await page.evaluate(() =>
			Object.fromEntries(
				[
					...document.querySelectorAll('[id]'),
					...(document.querySelector('#host')?.shadowRoot?.querySelectorAll('[id]') ?? []),
				].map((element) => [element.id, getComputedStyle(element).breakInside]),
			),
		)
		expect(breakInside).toEqual({
			card: 'avoid',
			host: 'auto',
			inline: 'auto',
			'no-style': 'auto',
			plain: 'auto',
			quote: 'avoid',
			shadow: 'avoid',
			'shadow-root-card': 'avoid',
			tall: 'auto',
			transparent: 'auto',
		})
	})
})
