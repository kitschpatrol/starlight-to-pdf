import type { Browser } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLASSNAMES } from '../src/lib/constants'
import applyDynamicPageHeight, { buildPageRules } from '../src/lib/dynamic-page-height'
import { setLogger } from '../src/lib/log'
import { resolveOptions } from '../src/lib/options'

describe('buildPageRules', () => {
	it('should emit one named @page rule per unit, sized to content plus insets', () => {
		const rules = buildPageRules([500, 1000.4], { pageWidthPixels: 794, verticalInsetPixels: 76 })
		expect(rules).toBe(
			'@page s2pdf-page-0 { size: 794px 578px; }\n@page s2pdf-page-1 { size: 794px 1079px; }',
		)
	})

	it('should clamp tiny units to a minimum page height', () => {
		const rules = buildPageRules([1], { pageWidthPixels: 794, verticalInsetPixels: 0 })
		expect(rules).toBe('@page s2pdf-page-0 { size: 794px 96px; }')
	})

	it('should return an empty string for no units', () => {
		expect(buildPageRules([], { pageWidthPixels: 794, verticalInsetPixels: 0 })).toBe('')
	})
})

describe('applyDynamicPageHeight', () => {
	let browser: Browser

	beforeAll(async () => {
		setLogger()
		// The fixtures are local markup, and Linux CI runners restrict the sandbox
		browser = await puppeteer.launch({ args: ['--no-sandbox'] })
	}, 60_000)

	afterAll(async () => {
		await browser.close()
	})

	it('should size pages to fit content that overflows the unit', async () => {
		const page = await browser.newPage()
		await page.setContent(`
			<body style="margin: 0">
				<div class="${CLASSNAMES.mainContainer}">
					<div class="${CLASSNAMES.pageBreak}" style="display: flow-root">
						<div style="height: 300px; margin-bottom: -40px"></div>
					</div>
					<div class="${CLASSNAMES.pageBreak}" style="display: flow-root">
						<div style="height: 200px"></div>
					</div>
				</div>
			</body>`)
		await applyDynamicPageHeight(
			page,
			resolveOptions({ margins: '0 0 0 0', url: 'https://example.com' }),
		)

		expect(await page.$eval('head style', (style) => style.textContent)).toBe(
			'@page s2pdf-page-0 { size: 816px 302px; }\n@page s2pdf-page-1 { size: 816px 202px; }',
		)
	})
})
