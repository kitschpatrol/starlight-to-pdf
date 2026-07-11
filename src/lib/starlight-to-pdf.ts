import type { Browser, LaunchOptions } from 'puppeteer'
import puppeteer from 'puppeteer'
import { scrollPageToBottom } from 'puppeteer-autoscroll-down'
import type { StarlightToPdfOptions } from './options'
import { composeBody, injectBody } from './body'
import { SELECTORS } from './constants'
import applyDynamicPageHeight from './dynamic-page-height'
import { ParsingError } from './errors'
import getAllContent from './get-all-content'
import getStartingUrl from './get-starting-url'
import gotoWithRetry from './goto-with-retry'
import { log } from './log'
import { resolveOptions } from './options'
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
		await page.setViewport({ width: 799, height: 1150 })
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

		const { contentsData, htmlContent } = await getAllContent({
			contentsData: new Set(),
			htmlContent: '',
			options: resolved,
			page,
			urlQueue,
		})

		const body = await composeBody({
			baseOrigin: baseUrl.origin,
			contentsData,
			htmlContent,
			options: resolved,
		})

		log.info('Adjusting content. It may take a while...')
		await page.goto(contentStartUrl.href, {
			waitUntil: 'networkidle2',
		})
		await page.evaluate(
			injectBody,
			body,
			!resolved.starlightPrintCss,
			SELECTORS.starlightPrintStyles,
		)
		await scrollPageToBottom(page, {
			delay: resolved.scrollDelay,
			size: 1100,
		})

		if (resolved.dynamicPageHeight) {
			await applyDynamicPageHeight(page, resolved)
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
