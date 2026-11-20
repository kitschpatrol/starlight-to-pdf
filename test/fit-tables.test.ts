import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLASSNAMES } from '../src/lib/constants'
import fitTablesToPage from '../src/lib/fit-tables'
import { setLogger } from '../src/lib/log'
import { resolveOptions } from '../src/lib/options'

// Mimics Starlight's print styles, which lay tables out as scrolling blocks
// and let table cells wrap anywhere
const STARLIGHT_TABLE_STYLES = `
	<style>
		table { display: block; overflow: auto; border-spacing: 0; }
		th, td, th *, td * { overflow-wrap: anywhere; }
		td { padding: 0; vertical-align: top; font: 16px monospace; }
	</style>`

let browser: Browser

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

async function fitTable(cells: string): Promise<Page> {
	const page = await browser.newPage()
	await page.setContent(
		`<body style="margin: 0">${STARLIGHT_TABLE_STYLES}<table><tr>${cells}</tr></table></body>`,
	)
	await fitTablesToPage(page, resolveOptions({ url: 'https://example.com' }))
	return page
}

async function hasWordWrapClass(page: Page): Promise<boolean> {
	return page.$eval(
		'table',
		(table, className) => table.classList.contains(className),
		CLASSNAMES.wordWrapTable,
	)
}

describe('fitTablesToPage', () => {
	it('should keep words whole in a narrow column of a table that fits', async () => {
		const page = await fitTable(
			`<td><span class="label">Brightness</span></td><td>${'A long description that takes up the rest of the row. '.repeat(20)}</td>`,
		)
		expect(await hasWordWrapClass(page)).toBe(true)
		expect(await page.$eval('.label', (label) => label.getClientRects().length)).toBe(1)
	})

	it('should let cells wrap anywhere in a table too wide for whole words', async () => {
		const page = await fitTable(`<td>${'x'.repeat(300)}</td>`)
		expect(await hasWordWrapClass(page)).toBe(false)
		expect(await page.$eval('table', (table) => table.scrollWidth <= table.clientWidth)).toBe(true)
	})
})
