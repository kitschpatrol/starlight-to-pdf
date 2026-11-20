import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLASSNAMES } from '../src/lib/constants'
import hideFixedElements from '../src/lib/hide-fixed-elements'
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

describe('hideFixedElements', () => {
	it('should hide fixed elements of the docs content in print only', async () => {
		const page = await browser.newPage()
		await page.setContent(`
			<style>
				@media print {
					#static-in-print { position: static !important; }
				}
			</style>
			<div id="cover" style="position: fixed">Cover HTML provided by the user</div>
			<div class="${CLASSNAMES.mainContainer}">
				<div id="panel" style="position: fixed">Floating panel</div>
				<div id="static-in-print" style="position: fixed">Placed in the flow for print</div>
				<div id="popover" style="position: fixed; display: none">Closed popover</div>
				<p id="text">Text</p>
			</div>`)
		await hideFixedElements(page)

		const display = await page.$$eval('[id]', (elements) =>
			Object.fromEntries(
				elements.map((element) => [element.id, getComputedStyle(element).display]),
			),
		)
		expect(display).toEqual({
			cover: 'block',
			panel: 'none',
			popover: 'none',
			'static-in-print': 'block',
			text: 'block',
		})
		expect(await page.$eval('#popover', (popover) => popover.getAttribute('style'))).toBe(
			'position: fixed; display: none',
		)
	})
})
