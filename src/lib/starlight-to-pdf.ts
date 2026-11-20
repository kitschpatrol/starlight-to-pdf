import type { Browser, LaunchOptions } from 'puppeteer'
import puppeteer from 'puppeteer'
import { scrollPageToBottom } from 'puppeteer-autoscroll-down'
import type { StarlightToPdfOptions } from './options'
import type { DocumentInfo } from './types'
import { composeBody, injectBody } from './body'
import { SELECTORS } from './constants'
import applyDynamicPageHeight from './dynamic-page-height'
import { ParsingError } from './errors'
import fitGraphicsToPage from './fit-graphics'
import fitTablesToPage from './fit-tables'
import getAllContent from './get-all-content'
import getStartingUrl from './get-starting-url'
import gotoWithRetry from './goto-with-retry'
import applyHeaderFooter from './header-footer'
import hideFixedElements from './hide-fixed-elements'
import keepBoxesWhole from './keep-boxes-whole'
import keepGridItemsWhole from './keep-grid-items-whole'
import { log } from './log'
import { resolveOptions } from './options'
import { namePrintUnits } from './print-units'
import recordPdf from './record-pdf'
import { getTopicsPageUrls, getTopicUrls } from './sidebar-topics'

/** Details about a generated PDF file. */
export type StarlightToPdfResult = {
	/** Number of documentation pages included in the PDF. */
	pages: number
	/** Absolute path of the written PDF file. */
	path: string
	/** Total processing time in seconds. */
	timeSeconds: number
}

/**
 * Crawls the Starlight documentation site at the given URL and renders all of
 * its pages into a single PDF file.
 */
export async function starlightToPdf(
	options: StarlightToPdfOptions,
): Promise<StarlightToPdfResult> {
	const resolved = resolveOptions(options)
	let browser: Browser | undefined

	try {
		const startTime = performance.now()

		const baseUrl = resolved.url

		const browserOptions: LaunchOptions = {
			headless: true,
			protocolTimeout: resolved.timeout,
		}
		if (resolved.browserExecutable !== undefined) {
			browserOptions.executablePath = resolved.browserExecutable
			log.info(`Using custom browser executable: ${browserOptions.executablePath}`)
		}

		if (resolved.browserNoSandbox) {
			browserOptions.args = ['--no-sandbox', '--disable-setuid-sandbox']
			log.info('Launching browser with sandboxing disabled.')
		}

		browser = await puppeteer.launch(browserOptions)
		const page = await browser.newPage()
		// Charts and other canvases draw at twice the pixel density, so the images
		// captured from them stay sharp in print
		await page.setViewport({ deviceScaleFactor: 2, height: 1150, width: 799 })
		page.setDefaultTimeout(resolved.timeout)

		const startUrl = await getStartingUrl({ page, url: baseUrl })
		if (!startUrl) {
			throw new ParsingError('The beginning of docs content was not found. Check the provided URL.')
		}

		let contentStartUrl = startUrl
		let urlQueue: undefined | URL[]

		// `getStartingUrl` leaves the page at `startUrl`
		const topicUrls = await getTopicUrls(page)
		if (topicUrls.length > 0) {
			log.info(`Sidebar topics plugin detected. Topics found: ${topicUrls.length}.`)

			const pageUrls = await getTopicsPageUrls({
				page,
				topicUrls,
				waitUntil: resolved.pageWaitUntil,
			})
			const [firstUrl, ...restUrls] = pageUrls

			if (firstUrl) {
				contentStartUrl = firstUrl
				urlQueue = restUrls
				await gotoWithRetry(page, firstUrl.href, { waitUntil: resolved.pageWaitUntil })
			}
		}

		log.info(`Docs content was found. Starting page: ${contentStartUrl.href}`)

		const { contentsData, htmlContent, stylesheets } = await getAllContent({
			contentsData: new Set(),
			htmlContent: '',
			options: resolved,
			page,
			urlQueue,
		})

		// The site gives the title and the language of the date their defaults
		const site = await page.evaluate(
			(siteNameSelector) => ({
				language: document.documentElement.lang,
				title: document.querySelector(siteNameSelector)?.getAttribute('content') ?? document.title,
			}),
			SELECTORS.siteName,
		)
		const documentInfo: DocumentInfo = {
			date:
				resolved.date ??
				new Date().toLocaleDateString(site.language === '' ? undefined : site.language, {
					dateStyle: 'long',
				}),
			title: resolved.title ?? site.title,
		}

		const body = await composeBody({
			baseOrigin: baseUrl.origin,
			contentsData,
			document: documentInfo,
			htmlContent,
			options: resolved,
		})

		log.info('Adjusting content. It may take a while...')
		// Images load at the pixel density that sites serve by default, which keeps
		// the PDF small. The cache would offer the denser images of the crawl.
		await page.setViewport({ width: 799, height: 1150 })
		await page.setCacheEnabled(false)
		await page.goto(contentStartUrl.href, {
			waitUntil: 'networkidle2',
		})
		const failedStylesheetUrls = await page.evaluate(injectBody, {
			body,
			noPrintCss: !resolved.starlightPrintCss,
			printStylesSelector: SELECTORS.starlightPrintStyles,
			stylesheets,
			stylesheetSelector: SELECTORS.stylesheet,
			title: documentInfo.title,
		})
		for (const url of failedStylesheetUrls) {
			log.warn(`Stylesheet failed to load, the PDF may lack some styles: ${url}`)
		}

		await scrollPageToBottom(page, {
			delay: resolved.scrollDelay,
			size: 1100,
		})

		await hideFixedElements(page)
		await keepGridItemsWhole(page)

		// Content can't be fitted to a page size set in CSS, which is unknown
		if (!resolved.cssPageSize) {
			await fitTablesToPage(page, resolved)
			// Dynamic pages grow with their content instead
			if (!resolved.dynamicPageHeight) {
				await fitGraphicsToPage(page, resolved)
				await keepBoxesWhole(page, resolved)
			}
		}

		// Named pages carry the page sizes, header, and footer
		const hasHeaderOrFooter = resolved.header || resolved.footer
		if (hasHeaderOrFooter || resolved.dynamicPageHeight) {
			const units = await namePrintUnits(page, resolved)
			if (resolved.dynamicPageHeight) {
				await applyDynamicPageHeight(page, units, resolved)
			}

			if (hasHeaderOrFooter) {
				await applyHeaderFooter(page, units, {
					document: documentInfo,
					footer: resolved.footer,
					header: resolved.header,
					revision: resolved.revision,
				})
			}
		}

		const pdfPath = await recordPdf({ hostname: baseUrl.hostname, options: resolved, page })

		const finishTime = performance.now()
		const timeSeconds = Number(((finishTime - startTime) / 1000).toFixed(2))

		log.info(`Total processing time: ${timeSeconds}s.`)

		return {
			pages: contentsData.size,
			path: pdfPath,
			timeSeconds,
		}
	} finally {
		if (browser?.connected) {
			await browser.close()
		}
	}
}
