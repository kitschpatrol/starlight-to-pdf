import type { Page } from 'puppeteer'
import type { Contents, GetAllContentParams, GetAllContentReturn } from './types'
import { CLASSNAMES, SELECTORS } from './constants'
import errorCatcher from './error-catcher'
import { ParsingError } from './errors'
import getNextUrl from './get-next-url'
import gotoWithRetry from './goto-with-retry'
import { log } from './log'
import { normalizePageUrl } from './options'

type ProcessPageContentReturn = {
	contents: Contents
	html: string
}

type ParsePageParams = {
	internalLinks: boolean
	page: Page
}

type ParsedData = {
	heading: {
		html: string
		text: string
		url: string
	}
	mainInfo: {
		html: string
	}
	subheadings: Array<{
		heading: string
		url: string
	}>
}

async function parsePage({ internalLinks, page }: ParsePageParams): Promise<ParsedData> {
	const currentLink = page.url()

	const evaluatePage = async (link: string, isInternal: boolean) =>
		page.evaluate(
			(linkArg, selectors, classnames, isInternalArg) => {
				const currentUrl = new URL(linkArg)
				const { pathname } = currentUrl

				const heading = document.querySelector<HTMLElement>(selectors.heading)
				heading?.classList.add(classnames.heading)
				heading?.setAttribute('id', pathname)

				const mainInfo = document.querySelector(selectors.mainInfo)
				mainInfo?.classList.add(classnames.pageBreak)

				const subheadings = Array.from(
					document.querySelectorAll<HTMLElement>(selectors.subheading),
					(subheading) => {
						if (isInternalArg) {
							const originalId = subheading.getAttribute('id') ?? crypto.randomUUID()
							subheading.setAttribute('id', `${pathname}-${originalId}`)
						}

						const id = subheading.getAttribute('id') ?? crypto.randomUUID()
						return {
							// eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Reflects rendered text only, unlike textContent
							heading: subheading.innerText,
							url: isInternalArg ? `#${id}` : `${linkArg}#${id}`,
						}
					},
				)

				return {
					heading: {
						html: heading?.outerHTML ?? '',
						// eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Reflects rendered text only, unlike textContent
						text: heading?.innerText ?? '',
						url: isInternalArg ? `#${pathname}` : linkArg,
					},
					mainInfo: { html: mainInfo?.outerHTML ?? '' },
					subheadings,
				}
			},
			link,
			SELECTORS,
			CLASSNAMES,
			isInternal,
		)

	const [error, parsedData] = await errorCatcher(evaluatePage(currentLink, internalLinks))

	if (error) {
		throw new ParsingError(`Failed to parse page: '${currentLink}'`, {
			originalErrorMessage: error.message,
		})
	}

	return parsedData
}

async function processPageContent(
	page: Page,
	internalLinks: boolean,
): Promise<ProcessPageContentReturn> {
	const parsedData = await parsePage({ internalLinks, page })

	const contents: Contents = {
		children: parsedData.subheadings,
		heading: parsedData.heading.text,
		url: parsedData.heading.url,
	}

	const html = parsedData.heading.html + parsedData.mainInfo.html

	return { contents, html }
}

/**
 * Parses documentation pages one by one, following pagination links or the
 * predefined URL queue, and accumulates their HTML and table of contents data.
 */
async function getAllContent({
	contentsData,
	htmlContent,
	options,
	page,
	urlQueue,
}: GetAllContentParams): Promise<GetAllContentReturn> {
	const { exclude, last } = options
	let accumulatedHtml = htmlContent
	const visitedUrls = new Set<string>()

	for (;;) {
		const currentUrl = page.url()
		const normalizedCurrentUrl = normalizePageUrl(new URL(currentUrl))
		visitedUrls.add(normalizedCurrentUrl)
		const isExcluded = exclude?.has(normalizedCurrentUrl) ?? false
		const isLastPage = normalizedCurrentUrl === last

		if (isExcluded) {
			log.info(`Page excluded: ${currentUrl}`)
		} else {
			log.info(`Parsing page: ${currentUrl}`)
			const { contents, html } = await processPageContent(
				page,
				options.contentsLinks === 'internal',
			)
			contentsData.add(contents)
			accumulatedHtml += html
		}

		const nextUrl = urlQueue ? urlQueue.shift() : await getNextUrl(page)
		if (isLastPage || !nextUrl) {
			if (isLastPage) {
				log.info(`Parsing finishes: encountered user defined last page: ${currentUrl}`)
			}

			break
		}

		// Guards against pagination cycles when following `rel="next"` links; the
		// predefined URL queue is finite and needs no guard
		if (!urlQueue && visitedUrls.has(normalizePageUrl(nextUrl))) {
			log.warn(`Pagination loop detected: ${nextUrl.href} was already parsed. Parsing stops.`)
			break
		}

		await gotoWithRetry(page, nextUrl.href, { waitUntil: options.pageWaitUntil })
	}

	log.info(`All pages were parsed. Web pages total: ${contentsData.size}.`)
	return {
		contentsData,
		htmlContent: accumulatedHtml,
	}
}

export default getAllContent
