import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StarlightToPdfOptions } from '../src/lib/options'
import { composeBody, injectBody } from '../src/lib/body'
import { SELECTORS } from '../src/lib/constants'
import { resolveOptions } from '../src/lib/options'

// The about, contact, and notice sections in this order, with their paragraphs
const BACK_PAGE_SECTIONS_REGEX =
	/s2pdf-back-page-about"><p>First paragraph.<\/p><p>Second paragraph.<\/p>.*s2pdf-back-page-contact"><p>Scalar Studio<br>info@scalar.studio<\/p>.*s2pdf-back-page-notice"><p>Confidential &amp; proprietary.<\/p>/sv

describe('composeBody', () => {
	async function compose(
		options: Omit<StarlightToPdfOptions, 'url'>,
		contentsData = new Set<{ heading: string; url: string }>(),
	): Promise<string> {
		return composeBody({
			baseOrigin: 'https://docs.example',
			contentsData,
			document: { date: 'November 19, 2026', title: 'Docs & Guides' },
			htmlContent: '',
			options: resolveOptions({ ...options, url: 'https://docs.example' }),
		})
	}

	it('should escape headings in the table of contents', async () => {
		const body = await compose(
			{ contentsName: 'Q&A' },
			new Set([{ heading: 'Use <Card> & <Tabs>', url: '#/use/' }]),
		)
		expect(body).toContain(
			'<a href="#/use/"><span class="s2pdf-contents-title">Use &lt;Card&gt; &amp; &lt;Tabs&gt;</span><span class="s2pdf-contents-page"></span></a>',
		)
		expect(body).toContain('<h1>Q&amp;A</h1>')
		expect(body).toContain('data-s2pdf-title="Q&amp;A"')
	})

	it('should leave out page numbers when the table of contents links to the website', async () => {
		const body = await compose(
			{ contentsLinks: 'external' },
			new Set([{ heading: 'Use', url: 'https://docs.example/use/' }]),
		)
		expect(body).toContain('<span class="s2pdf-contents-title">Use</span></a>')
		expect(body).not.toContain('<span class="s2pdf-contents-page">')
	})

	it('should leave out the cover and back pages by default', async () => {
		const body = await compose({})
		expect(body).not.toContain('<section class="s2pdf-cover')
		expect(body).not.toContain('<section class="s2pdf-back-page')
	})

	it('should add a cover page with the escaped document details', async () => {
		const body = await compose({
			author: 'Scalar <Studio>',
			cover: true,
			revision: 'Version 1.0.9',
			subtitle: 'Cleveland Museum of Art',
		})
		expect(body).toContain('<h1>Docs &amp; Guides</h1>')
		expect(body).toContain('<p class="s2pdf-cover-subtitle">Cleveland Museum of Art</p>')
		expect(body).toContain('<p>Scalar &lt;Studio&gt;<br>Version 1.0.9 · November 19, 2026</p>')
	})

	it('should add a back page with paragraphs and line breaks of the text fields', async () => {
		const body = await compose({
			about: 'First paragraph.\n\nSecond paragraph.',
			contact: 'Scalar Studio\ninfo@scalar.studio',
			date: '',
			notice: 'Confidential & proprietary.',
		})
		const backPage = body.slice(body.indexOf('<section class="s2pdf-back-page'))
		expect(backPage).toContain('<p><strong>Docs &amp; Guides</strong><br>November 19, 2026</p>')
		expect(backPage).toMatch(BACK_PAGE_SECTIONS_REGEX)
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
								<title>Start page</title>
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

	async function inject(
		page: Page,
		params: Partial<Parameters<typeof injectBody>[0]>,
	): Promise<string[]> {
		return page.evaluate(injectBody, {
			body: '<p>Assembled</p>',
			noPrintCss: false,
			printStylesSelector: SELECTORS.starlightPrintStyles,
			stylesheets: [],
			stylesheetSelector: SELECTORS.stylesheet,
			title: 'Docs',
			...params,
		})
	}

	async function getHeadStylesheets(page: Page): Promise<string[]> {
		return page.$$eval('head link[rel~="stylesheet"], head style', (elements) =>
			elements.map((element) => element.outerHTML),
		)
	}

	it('should replace the head stylesheets, the body, and the title', async () => {
		const page = await openStartPage()
		const stylesheets = [
			`<link rel="stylesheet" href="${origin}/docs.css">`,
			'<style>.docs {}</style>',
		]
		expect(await inject(page, { stylesheets })).toEqual([])
		expect(await getHeadStylesheets(page)).toEqual(stylesheets)
		expect(await page.$eval('body', (body) => body.getHTML())).toBe('<p>Assembled</p>')
		expect(await page.title()).toBe('Docs')
	})

	it('should report stylesheets that fail to load and skip links that never load', async () => {
		const page = await openStartPage()
		const failedUrls = await inject(page, {
			stylesheets: [
				`<link rel="stylesheet" href="${origin}/missing.css">`,
				`<link rel="stylesheet" href="${origin}/disabled.css" disabled>`,
				`<link rel="stylesheet" href="${origin}/plain.css" type="text/plain">`,
				'<link rel="stylesheet" href="">',
			],
		})
		expect(failedUrls).toEqual([`${origin}/missing.css`])
	})

	it('should drop the Starlight print stylesheet when print CSS is disabled', async () => {
		const page = await openStartPage()
		await inject(page, {
			noPrintCss: true,
			stylesheets: [
				`<link rel="stylesheet" href="${origin}/print.css" media="print">`,
				'<style>.docs {}</style>',
			],
		})
		expect(await getHeadStylesheets(page)).toEqual(['<style>.docs {}</style>'])
	})

	it('should attach declarative shadow roots of the body', async () => {
		const page = await openStartPage()
		await inject(page, {
			body: '<div id="host"><template shadowrootmode="open"><p>Shadow</p></template></div>',
		})
		expect(await page.$eval('#host', (host) => host.shadowRoot?.textContent)).toBe('Shadow')
	})

	it('should let page titles span the page', async () => {
		const page = await openStartPage()
		const body = await composeBody({
			baseOrigin: origin,
			contentsData: new Set(),
			document: { date: '', title: 'Docs' },
			// Starlight's content width, narrower than the page, and its page title container
			htmlContent: `
				<style>:root { --sl-content-width: 10rem; } .sl-container { max-width: var(--sl-content-width); }</style>
				<div class="sl-container s2pdf-heading"><h1>Title</h1></div>`,
			options: resolveOptions({ contents: false, url: origin }),
		})
		await inject(page, { body })

		const widths = await page.evaluate(() => ({
			container: document.querySelector('.s2pdf-container')?.getBoundingClientRect().width,
			title: document.querySelector('.s2pdf-heading')?.getBoundingClientRect().width,
		}))
		expect(widths.title).toBe(widths.container)
	})
})
