import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { composeBody, injectBody } from '../src/lib/body'
import { SELECTORS } from '../src/lib/constants'
import { resolveOptions } from '../src/lib/options'

describe('composeBody', () => {
	it('should escape headings in the table of contents', async () => {
		const body = await composeBody({
			baseOrigin: 'https://docs.example',
			contentsData: new Set([{ heading: 'Use <Card> & <Tabs>', url: '#/use/' }]),
			htmlContent: '',
			options: resolveOptions({ contentsName: 'Q&A', url: 'https://docs.example' }),
		})
		expect(body).toContain('<a href="#/use/">Use &lt;Card&gt; &amp; &lt;Tabs&gt;</a>')
		expect(body).toContain('<h2>Q&amp;A</h2>')
	})
})

describe('injectBody', () => {
	const origin = 'https://docs.example'
	let browser: Browser

	beforeAll(async () => {
		// The fixtures are local markup, and Linux CI runners restrict the sandbox
		browser = await puppeteer.launch({ args: ['--no-sandbox'] })
	}, 60_000)

	afterAll(async () => {
		await browser.close()
	})

	async function openStartPage(): Promise<Page> {
		const page = await browser.newPage()
		await page.setRequestInterception(true)
		page.on('request', (request) => {
			if (request.resourceType() === 'document') {
				void request.respond({
					body: `<!doctype html>
						<html>
							<head>
								<link rel="stylesheet" href="/start.css">
								<style>.start {}</style>
							</head>
							<body>Start page</body>
						</html>`,
					contentType: 'text/html',
				})
				return
			}

			void request.respond(
				request.url().endsWith('/missing.css')
					? { body: 'Not found', status: 404 }
					: { body: '', contentType: 'text/css' },
			)
		})
		await page.goto(`${origin}/`)
		return page
	}

	async function getHeadStylesheets(page: Page): Promise<string[]> {
		return page.$$eval('head link[rel~="stylesheet"], head style', (elements) =>
			elements.map((element) => element.outerHTML),
		)
	}

	it('should replace the head stylesheets and the body', async () => {
		const page = await openStartPage()
		const stylesheets = [
			`<link rel="stylesheet" href="${origin}/docs.css">`,
			'<style>.docs {}</style>',
		]
		const failedUrls = await page.evaluate(injectBody, {
			body: '<p>Assembled</p>',
			noPrintCss: false,
			printStylesSelector: SELECTORS.starlightPrintStyles,
			stylesheets,
			stylesheetSelector: SELECTORS.stylesheet,
		})
		expect(failedUrls).toEqual([])
		expect(await getHeadStylesheets(page)).toEqual(stylesheets)
		expect(await page.$eval('body', (body) => body.getHTML())).toBe('<p>Assembled</p>')
	})

	it('should report stylesheets that fail to load and skip links that never load', async () => {
		const page = await openStartPage()
		const failedUrls = await page.evaluate(injectBody, {
			body: '<p>Assembled</p>',
			noPrintCss: false,
			printStylesSelector: SELECTORS.starlightPrintStyles,
			stylesheets: [
				`<link rel="stylesheet" href="${origin}/missing.css">`,
				`<link rel="stylesheet" href="${origin}/disabled.css" disabled>`,
				`<link rel="stylesheet" href="${origin}/plain.css" type="text/plain">`,
				'<link rel="stylesheet" href="">',
			],
			stylesheetSelector: SELECTORS.stylesheet,
		})
		expect(failedUrls).toEqual([`${origin}/missing.css`])
	})

	it('should drop the Starlight print stylesheet when print CSS is disabled', async () => {
		const page = await openStartPage()
		await page.evaluate(injectBody, {
			body: '<p>Assembled</p>',
			noPrintCss: true,
			printStylesSelector: SELECTORS.starlightPrintStyles,
			stylesheets: [
				`<link rel="stylesheet" href="${origin}/print.css" media="print">`,
				'<style>.docs {}</style>',
			],
			stylesheetSelector: SELECTORS.stylesheet,
		})
		expect(await getHeadStylesheets(page)).toEqual(['<style>.docs {}</style>'])
	})

	it('should attach declarative shadow roots of the body', async () => {
		const page = await openStartPage()
		await page.evaluate(injectBody, {
			body: '<div id="host"><template shadowrootmode="open"><p>Shadow</p></template></div>',
			noPrintCss: false,
			printStylesSelector: SELECTORS.starlightPrintStyles,
			stylesheets: [],
			stylesheetSelector: SELECTORS.stylesheet,
		})
		expect(await page.$eval('#host', (host) => host.shadowRoot?.textContent)).toBe('Shadow')
	})
})
