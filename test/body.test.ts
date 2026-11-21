import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StarlightToPdfOptions } from '../src/lib/options'
import { composeBody, injectBody } from '../src/lib/body'
import { SELECTORS } from '../src/lib/constants'
import { resolveOptions } from '../src/lib/options'
import { emulatePrintLayout, getPrintLayout } from '../src/lib/print-layout'

// The about, contact, and notice sections in this order, with their paragraphs
const BACK_PAGE_SECTIONS_REGEX =
	/s2pdf-back-page-about"><p>First paragraph.<\/p><p>Second paragraph.<\/p>.*s2pdf-back-page-contact"><p>Scalar Studio<br><a href="mailto:info@scalar.studio">info@scalar.studio<\/a><\/p>.*s2pdf-back-page-notice"><p>Confidential &amp; proprietary.<\/p>/sv
const ABOUT_SECTION_REGEX = /s2pdf-back-page-about">(?<html>.*?)<\/div>/sv

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
		expect(body).toContain(
			'<p class="s2pdf-cover-details">Scalar &lt;Studio&gt;<br>Version 1.0.9 · November 19, 2026</p>',
		)
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

	it('should render back page text without addresses as before', async () => {
		const body = await compose({
			about: 'A snapshot of the documentation,\nprinted for reference.\n\nSecond paragraph.',
			contact: 'Scalar Studio\nCleveland, Ohio',
			notice: 'Confidential <draft> & proprietary.',
		})
		expect(body).toContain(
			'<div class="s2pdf-back-page-about"><p>A snapshot of the documentation,<br>printed for reference.</p><p>Second paragraph.</p></div><div class="s2pdf-back-page-contact"><p>Scalar Studio<br>Cleveland, Ohio</p></div><div class="s2pdf-back-page-notice"><p>Confidential &lt;draft&gt; &amp; proprietary.</p></div>',
		)
	})

	/** Returns the HTML of the about section of a back page with the given text. */
	async function composeAbout(about: string): Promise<string | undefined> {
		return ABOUT_SECTION_REGEX.exec(await compose({ about }))?.groups?.html
	}

	it('should link a URL without the period that ends the sentence', async () => {
		expect(
			await composeAbout('The latest version is at https://scalar.studio/x/cma/ten-kings.'),
		).toBe(
			'<p>The latest version is at <a href="https://scalar.studio/x/cma/ten-kings">https://scalar.studio/x/cma/ten-kings</a>.</p>',
		)
	})

	it('should link bare domains over HTTPS', async () => {
		expect(await composeAbout('Visit scalar.studio or example.com/docs')).toBe(
			'<p>Visit <a href="https://scalar.studio">scalar.studio</a> or <a href="https://example.com/docs">example.com/docs</a></p>',
		)
	})

	it('should link email addresses with mailto', async () => {
		expect(await composeAbout('Write to info@scalar.studio')).toBe(
			'<p>Write to <a href="mailto:info@scalar.studio">info@scalar.studio</a></p>',
		)
	})

	it('should end links at the typographic punctuation after them', async () => {
		expect(
			await composeAbout(
				'Online at “https://example.com/docs”, https://example.com/legal…, https://example.com/a—b, and https://example.com/ja。',
			),
		).toBe(
			'<p>Online at “<a href="https://example.com/docs">https://example.com/docs</a>”, <a href="https://example.com/legal">https://example.com/legal</a>…, <a href="https://example.com/a">https://example.com/a</a>—b, and <a href="https://example.com/ja">https://example.com/ja</a>。</p>',
		)
	})

	it('should leave names without a real top-level domain as text', async () => {
		expect(await composeAbout('Built with Node.js')).toBe('<p>Built with Node.js</p>')
	})

	it('should link file names whose extension is a real top-level domain', async () => {
		// Moldova's top-level domain
		expect(await composeAbout('See README.md')).toBe(
			'<p>See <a href="https://README.md">README.md</a></p>',
		)
	})

	it('should escape the href and text of links', async () => {
		expect(await composeAbout('https://example.com/?a=1&b=2')).toBe(
			'<p><a href="https://example.com/?a=1&amp;b=2">https://example.com/?a=1&amp;b=2</a></p>',
		)
		expect(await composeAbout('https://example.com/?q="x"y')).toBe(
			'<p><a href="https://example.com/?q=&quot;x&quot;y">https://example.com/?q=&quot;x&quot;y</a></p>',
		)
	})

	it('should link addresses in the subtitle and author of the cover but not in the revision', async () => {
		const body = await compose({
			author: 'Scalar Studio, scalar.studio',
			cover: true,
			revision: 'Preview of example.com',
			subtitle: 'Docs at https://example.com/docs',
		})
		expect(body).toContain(
			'<p class="s2pdf-cover-subtitle">Docs at <a href="https://example.com/docs">https://example.com/docs</a></p>',
		)
		expect(body).toContain(
			'<p class="s2pdf-cover-details">Scalar Studio, <a href="https://scalar.studio">scalar.studio</a><br>Preview of example.com · November 19, 2026</p>',
		)
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

	/**
	 * Composes the document with a cover and injects it at the print layout of
	 * letter paper, with Starlight's type sizes and the word wrapping of its
	 * reset, in a font whose letters all take the same width.
	 */
	async function injectCover(
		page: Page,
		options: Omit<StarlightToPdfOptions, 'url'>,
		htmlContent = '',
	): Promise<void> {
		const resolved = resolveOptions({ contents: false, cover: true, ...options, url: origin })
		const body = await composeBody({
			baseOrigin: origin,
			contentsData: new Set(),
			document: { date: 'November 20, 2026', title: options.title ?? 'Docs' },
			htmlContent: `<style>:root { font-size: 16px; font-family: monospace, monospace; --sl-text-6xl: 4rem; --sl-text-2xl: 1.5rem; } h1, p { overflow-wrap: break-word; }</style>${htmlContent}`,
			options: resolved,
		})
		await emulatePrintLayout(page, getPrintLayout(resolved))
		await inject(page, { body })
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
	it('should set the cover in three quarters of the page area without splitting long words', async () => {
		const page = await openStartPage()
		// Each letter of the title takes 0.6 of 62.4 pixels, so its first word
		// takes more than three quarters of the 624 pixels of the page area
		await injectCover(page, { subtitle: 'Library documentation', title: 'Implementation Guide' })

		const layout = await page.evaluate(() => {
			const getWidth = (selector: string): number =>
				document.querySelector(selector)?.getBoundingClientRect().width ?? 0
			const word = document.createRange()
			const text = document.querySelector('.s2pdf-cover h1')?.firstChild
			if (text) {
				word.setStart(text, 0)
				word.setEnd(text, 'Implementation'.length)
			}

			return {
				cover: getWidth('.s2pdf-cover'),
				details: getWidth('.s2pdf-cover-details'),
				title: getWidth('.s2pdf-cover-title'),
				wordLines: new Set(Array.from(word.getClientRects(), (rect) => rect.top)).size,
			}
		})
		expect(layout.title).toBeCloseTo(layout.cover * 0.75)
		expect(layout.details).toBeCloseTo(layout.cover * 0.75)
		expect(layout.wordLines).toBe(1)
	})

	it('should set the title two lines down and let a long cover grow onto another page', async () => {
		const page = await openStartPage()
		await injectCover(page, {
			author: 'Scalar Studio',
			subtitle: 'Library documentation '.repeat(60).trim(),
			title: 'Implementation Guide',
		})

		const layout = await page.evaluate(() => {
			const cover = document.querySelector('.s2pdf-cover')
			const title = document.querySelector('.s2pdf-cover h1')
			if (cover === null || title === null) {
				throw new Error('No cover')
			}

			return {
				clientHeight: cover.clientHeight,
				scrollHeight: cover.scrollHeight,
				titleOffset: title.getBoundingClientRect().top - cover.getBoundingClientRect().top,
				viewportHeight: window.innerHeight,
			}
		})
		// Two lines of 16px text at the line height of 1.5 of the cover
		expect(layout.titleOffset).toBeCloseTo(48)
		// The text takes more than a page, and the cover holds all of it
		expect(layout.clientHeight).toBeGreaterThan(layout.viewportHeight)
		expect(layout.scrollHeight).toBe(layout.clientHeight)
	})

	it('should balance the lines of the cover title and subtitle whatever wrapping the site sets', async () => {
		const page = await openStartPage()
		await injectCover(
			page,
			{ subtitle: 'Library documentation', title: 'Implementation Guide' },
			'<style>h1, p { text-wrap: pretty; }</style>',
		)

		const wrapping = await page.$$eval('.s2pdf-cover h1, .s2pdf-cover-subtitle', (elements) =>
			elements.map((element) => getComputedStyle(element).getPropertyValue('text-wrap-style')),
		)
		expect(wrapping).toEqual(['balance', 'balance'])
	})

	it('should leave the layout of custom covers to them', async () => {
		const page = await openStartPage()
		await injectCover(
			page,
			{ cover: false },
			'<section id="custom" class="s2pdf-cover"><div id="banner" style="height: 10px"></div></section>',
		)

		const boxes = await page.evaluate(() => {
			const getBox = (selector: string): { top: number; width: number } => {
				const { top, width } = document.querySelector(selector)?.getBoundingClientRect() ?? {
					top: 0,
					width: 0,
				}
				return { top, width }
			}

			return { banner: getBox('#banner'), custom: getBox('#custom') }
		})
		expect(boxes.banner).toEqual(boxes.custom)
	})

	it('should underline the links of the cover and back page in the color of their text', async () => {
		const page = await openStartPage()
		const body = await composeBody({
			baseOrigin: origin,
			contentsData: new Set(),
			document: { date: '', title: 'Docs' },
			htmlContent: '',
			options: resolveOptions({
				about: 'Online at example.com',
				author: 'info@example.com',
				contents: false,
				cover: true,
				notice: 'Licensed at https://example.com/license',
				url: origin,
			}),
		})
		// The site's text colors, and a style for links that would apply outside the docs content too
		await inject(page, {
			body,
			stylesheets: [
				'<style>:root { --sl-color-gray-2: rgb(51, 51, 51); --sl-color-gray-3: rgb(85, 85, 85); } a { color: red; text-decoration: none; }</style>',
			],
		})

		const links = await page.$$eval('a', (elements) =>
			elements.map((link) => {
				const { color, textDecorationLine } = getComputedStyle(link)
				return `${link.textContent}: ${color} ${textDecorationLine}`
			}),
		)
		expect(links).toEqual([
			'info@example.com: rgb(51, 51, 51) underline',
			'example.com: rgb(51, 51, 51) underline',
			'https://example.com/license: rgb(85, 85, 85) underline',
		])
	})
})
