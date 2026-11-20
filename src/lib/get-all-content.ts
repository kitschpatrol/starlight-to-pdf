import type { Page } from 'puppeteer'
import type { Contents, GetAllContentParams, GetAllContentReturn } from './types'
import { CLASSNAMES, PAGE_TITLE_ATTRIBUTE, SELECTORS } from './constants'
import errorCatcher from './error-catcher'
import { ParsingError } from './errors'
import getNextUrl from './get-next-url'
import gotoWithRetry from './goto-with-retry'
import { log } from './log'
import { normalizePageUrl } from './options'
import rasterizeCanvases from './rasterize-canvases'

type ProcessPageContentReturn = {
	contents: Contents
	html: string
	stylesheets: string[]
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
	/** Markup of the page's stylesheets outside the parsed content. */
	stylesheets: string[]
	subheadings: Array<{
		heading: string
		url: string
	}>
}

/**
 * Serializes the element matching the selector like outerHTML, but includes its
 * open shadow roots as declarative shadow DOM. Runs in the browser context.
 */
function serializeWithShadowRoots(selector: string): string {
	const element = document.querySelector(selector)
	if (element === null) {
		return ''
	}

	const shadowRoots: ShadowRoot[] = []
	const pendingRoots: Array<Element | ShadowRoot> = [element]
	let root = pendingRoots.pop()
	while (root !== undefined) {
		for (const descendant of root.querySelectorAll('*')) {
			if (!descendant.shadowRoot) {
				continue
			}

			shadowRoots.push(descendant.shadowRoot)
			pendingRoots.push(descendant.shadowRoot)
		}

		root = pendingRoots.pop()
	}

	if (shadowRoots.length === 0) {
		return element.outerHTML
	}

	// Constructed stylesheets aren't serialized either. Appended style elements
	// take their place in the cascade, after a shadow root's own styles.
	for (const shadowRoot of shadowRoots) {
		for (const sheet of shadowRoot.adoptedStyleSheets) {
			const style = document.createElement('style')
			style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n')
			shadowRoot.append(style)
		}
	}

	const closingTag = `</${element.localName}>`
	const openingTag = element.outerHTML.slice(0, -(element.getHTML().length + closingTag.length))
	return `${openingTag}${element.getHTML({ shadowRoots })}${closingTag}`
}

async function parsePage({ internalLinks, page }: ParsePageParams): Promise<ParsedData> {
	const currentLink = page.url()

	const evaluatePage = async (link: string, isInternal: boolean): Promise<ParsedData> => {
		const parsedData = await page.evaluate(
			(linkArg, selectors, classnames, isInternalArg, titleAttribute) => {
				const { pathname } = new URL(linkArg)

				const heading = document.querySelector<HTMLElement>(selectors.heading)
				heading?.classList.add(classnames.heading)
				heading?.setAttribute('id', pathname)
				// eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Reflects rendered text only, unlike textContent
				heading?.setAttribute(titleAttribute, heading.innerText)

				const mainInfo = document.querySelector(selectors.mainInfo)
				mainInfo?.classList.add(classnames.pageBreak)

				// A PDF reader can't expand collapsed details, so print their content
				const allDetails = mainInfo?.querySelectorAll('details') ?? []
				for (const details of allDetails) {
					// Opening every details of an exclusive accordion would close the others
					details.removeAttribute('name')
					details.open = true
				}

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

				// Stylesheets inside the parsed elements travel with their markup
				const stylesheets = [...document.querySelectorAll(selectors.stylesheet)]
					.filter((element) => !heading?.contains(element) && !mainInfo?.contains(element))
					.map((element) => {
						const clone = element.cloneNode()
						if (!(clone instanceof HTMLLinkElement)) {
							return element.outerHTML
						}

						// Absolute URLs resolve from the assembled document and deduplicate
						// links written relative to pages at different depths
						clone.setAttribute('href', clone.href)
						return clone.outerHTML
					})

				return {
					heading: {
						html: heading?.outerHTML ?? '',
						// eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Reflects rendered text only, unlike textContent
						text: heading?.innerText ?? '',
						url: isInternalArg ? `#${pathname}` : linkArg,
					},
					stylesheets,
					subheadings,
				}
			},
			link,
			SELECTORS,
			CLASSNAMES,
			isInternal,
			PAGE_TITLE_ATTRIBUTE,
		)

		// Serialize after the changes above, such as opened details
		const html = await page.evaluate(serializeWithShadowRoots, SELECTORS.mainInfo)
		return { ...parsedData, mainInfo: { html } }
	}

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
	await rasterizeCanvases(page)
	const parsedData = await parsePage({ internalLinks, page })

	const contents: Contents = {
		children: parsedData.subheadings,
		heading: parsedData.heading.text,
		url: parsedData.heading.url,
	}

	const html = parsedData.heading.html + parsedData.mainInfo.html

	return { contents, html, stylesheets: parsedData.stylesheets }
}

/**
 * Adds a page's stylesheets to the stylesheets accumulated from previous pages,
 * skipping duplicates. Each new stylesheet is placed right after the stylesheet
 * preceding it on its page, so the merged cascade order matches the order on
 * every page as closely as possible.
 */
export function mergeStylesheets(accumulated: string[], pageStylesheets: string[]): string[] {
	const merged = [...accumulated]
	let insertIndex = 0

	for (const stylesheet of pageStylesheets) {
		const index = merged.indexOf(stylesheet)
		if (index === -1) {
			merged.splice(insertIndex, 0, stylesheet)
			insertIndex += 1
		} else {
			insertIndex = Math.max(insertIndex, index + 1)
		}
	}

	return merged
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
	let stylesheets: string[] = []
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
			const {
				contents,
				html,
				stylesheets: pageStylesheets,
			} = await processPageContent(page, options.contentsLinks === 'internal')
			contentsData.add(contents)
			accumulatedHtml += html
			stylesheets = mergeStylesheets(stylesheets, pageStylesheets)
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
		stylesheets,
	}
}

export default getAllContent
