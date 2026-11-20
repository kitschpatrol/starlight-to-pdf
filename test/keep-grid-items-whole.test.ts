import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import keepGridItemsWhole from '../src/lib/keep-grid-items-whole'
import { setLogger } from '../src/lib/log'

let browser: Browser

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

describe('keepGridItemsWhole', () => {
	it('should avoid breaks inside grid items spanning several rows only', async () => {
		const page = await browser.newPage()
		await page.setContent(`
			<div style="display: grid; grid-template-columns: repeat(4, 1fr)">
				<section id="subgrid" style="display: grid; grid-row: 1 / 4; grid-template-rows: subgrid">
					<p id="subgrid-row">One</p><p>Two</p><p>Three</p>
				</section>
				<section id="span-start" style="grid-row: span 2">Spanning</section>
				<section id="span-end" style="grid-row: 1 / span 2">Spanning</section>
				<section id="single-row">Single row</section>
			</div>
			<section id="outside-grid" style="grid-row: span 2">Not a grid item</section>`)
		await keepGridItemsWhole(page)

		const breakInside = await page.$$eval('[id]', (elements) =>
			Object.fromEntries(
				elements.map((element) => [element.id, getComputedStyle(element).breakInside]),
			),
		)
		expect(breakInside).toEqual({
			'outside-grid': 'auto',
			'single-row': 'auto',
			'span-end': 'avoid',
			'span-start': 'avoid',
			subgrid: 'avoid',
			'subgrid-row': 'auto',
		})
	})
})
