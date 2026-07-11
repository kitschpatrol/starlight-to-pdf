import type { Browser, LaunchOptions } from 'puppeteer'
import { log } from 'lognow'
import puppeteer from 'puppeteer'
import { scrollPageToBottom } from 'puppeteer-autoscroll-down'
import type { StarlightToPdfOptions } from './types'
import { version } from '../../package.json' with { type: 'json' }
import { composeBody, injectBody } from './body'
import { SELECTORS } from './constants'
import applyDynamicPageHeight from './dynamic-page-height'
import { ParsingError } from './errors'
import getAllContent from './get-all-content'
import getStartingUrl from './get-starting-url'
import gotoWithRetry from './goto-with-retry'
import recordPdf from './record-pdf'
import { getTopicsPageUrls, getTopicUrls } from './sidebar-topics'

/**
 * Crawls the Starlight documentation site at the configured URL and renders all
 * of its pages into a single PDF file.
 */
export async function starlightToPdf(options: StarlightToPdfOptions): Promise<void> {
	let browser: Browser | undefined

	try {
		const startTime = performance.now()

		log.info('Welcome to Starlight to PDF tool! 📖')
		log.info(`version: ${version}`)

		const baseUrl = options.url

		const browserOptions: LaunchOptions = {
			headless: true,
			protocolTimeout: options.timeout,
		}
		if (options.browserExecutable !== undefined) {
			browserOptions.executablePath = options.browserExecutable
			log.info(`Using custom browser executable: ${browserOptions.executablePath}`)
		}

		if (options.browserNoSandbox) {
			browserOptions.args = ['--no-sandbox', '--disable-setuid-sandbox']
			log.info('Launching browser with sandboxing disabled.')
		}

		browser = await puppeteer.launch(browserOptions)
		const page = await browser.newPage()
		await page.setViewport({ width: 799, height: 1150 })
		page.setDefaultTimeout(options.timeout)

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
				waitUntil: options.pageWaitUntil,
			})
			const [firstUrl, ...restUrls] = pageUrls

			if (firstUrl) {
				contentStartUrl = firstUrl
				urlQueue = restUrls
				await gotoWithRetry(page, firstUrl.href, { waitUntil: options.pageWaitUntil })
			}
		}

		log.info(`Docs content was found. Starting page: ${contentStartUrl.href}`)

		const { contentsData, htmlContent } = await getAllContent({
			contentsData: new Set(),
			htmlContent: '',
			options,
			page,
			urlQueue,
		})

		const body = await composeBody({
			baseOrigin: baseUrl.origin,
			contentsData,
			htmlContent,
			options,
		})

		log.info('Adjusting content. It may take a while...')
		await page.goto(contentStartUrl.href, {
			waitUntil: 'networkidle2',
		})
		await page.evaluate(
			injectBody,
			body,
			!options.starlightPrintCss,
			SELECTORS.starlightPrintStyles,
		)
		await scrollPageToBottom(page, {
			delay: options.scrollDelay,
			size: 1100,
		})

		if (options.dynamicPageHeight) {
			await applyDynamicPageHeight(page, options)
		}

		await recordPdf({ hostname: baseUrl.hostname, options, page })

		const finishTime = performance.now()
		const timeTaken = ((finishTime - startTime) / 1000).toFixed(2)

		log.info(`Total processing time: ${timeTaken}s.`)
		log.info('Thank you for using Starlight to PDF!✨')
	} finally {
		if (browser?.connected) {
			await browser.close()
		}
	}
}
