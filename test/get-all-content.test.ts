import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import getAllContent, { mergeStylesheets } from '../src/lib/get-all-content'
import { setLogger } from '../src/lib/log'
import { resolveOptions } from '../src/lib/options'

describe('mergeStylesheets', () => {
	it('should take the first page stylesheets in order', () => {
		expect(mergeStylesheets([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
	})

	it('should skip stylesheets shared with previous pages', () => {
		expect(mergeStylesheets(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
	})

	it('should insert new stylesheets after the stylesheet preceding them on their page', () => {
		expect(
			mergeStylesheets(
				['common', 'theme', 'picture'],
				['common', 'theme', 'diagram', 'grid', 'picture'],
			),
		).toEqual(['common', 'theme', 'diagram', 'grid', 'picture'])
	})

	it('should insert a new leading stylesheet before the known ones', () => {
		expect(mergeStylesheets(['a', 'b'], ['x', 'b'])).toEqual(['x', 'a', 'b'])
	})

	it('should append new stylesheets after the last known one when page orders conflict', () => {
		expect(mergeStylesheets(['a', 'b'], ['b', 'a', 'x'])).toEqual(['a', 'b', 'x'])
	})

	it('should not mutate the accumulated stylesheets', () => {
		const accumulated = ['a']
		mergeStylesheets(accumulated, ['b'])
		expect(accumulated).toEqual(['a'])
	})
})

describe('getAllContent', () => {
	const origin = 'https://docs.example'
	let browser: Browser

	beforeAll(async () => {
		setLogger()
		// The fixtures are local markup, and Linux CI runners restrict the sandbox
		browser = await puppeteer.launch({ args: ['--no-sandbox'] })
	}, 60_000)

	afterAll(async () => {
		await browser.close()
	})

	async function parseFixturePage(content: string) {
		const page: Page = await browser.newPage()
		await page.setRequestInterception(true)
		page.on('request', (request) => {
			void request.respond(
				request.resourceType() === 'document'
					? {
							body: `<!doctype html>
								<html>
									<head>
										<link rel="stylesheet" href="../../assets/site.css">
										<style>.site {}</style>
									</head>
									<body>
										<div><h1 id="_top">Page</h1></div>
										<div class="sl-markdown-content">${content}</div>
									</body>
								</html>`,
							contentType: 'text/html',
						}
					: { body: '', contentType: 'text/css' },
			)
		})
		await page.goto(`${origin}/guide/page/`)

		const result = await getAllContent({
			contentsData: new Set(),
			htmlContent: '',
			options: resolveOptions({ url: origin }),
			page,
		})
		return { page, ...result }
	}

	it('should collect stylesheets outside the content with absolute link URLs', async () => {
		const { htmlContent, stylesheets } = await parseFixturePage('<style>.inline {}</style>')
		expect(stylesheets).toEqual([
			`<link rel="stylesheet" href="${origin}/assets/site.css">`,
			'<style>.site {}</style>',
		])
		expect(htmlContent).toContain('<style>.inline {}</style>')
	})

	it('should open collapsed details, including exclusive accordions', async () => {
		const { htmlContent, page } = await parseFixturePage(`
			<details name="faq"><summary>One</summary><p>First</p></details>
			<details name="faq"><summary>Two</summary><p>Second</p></details>`)
		await page.setContent(htmlContent)
		expect(await page.$$eval('details', (elements) => elements.map(({ open }) => open))).toEqual([
			true,
			true,
		])
	})
})
