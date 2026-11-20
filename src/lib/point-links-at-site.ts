import type { Page } from 'puppeteer'
import { SELECTORS } from './constants'
import { log } from './log'

/**
 * Points the links of the content that lead to the crawled server, including
 * those in open shadow roots, at the same path on the published site, and
 * returns how many it changed. The canonical URL of the page tells the origin
 * of the published site, as it does for linked media. Links within the page
 * stay as they are, and links written relative to the page resolve against it,
 * since the assembled document resolves them against its own base URL. Runs in
 * the browser context.
 */
function pointLinks(contentSelectors: string[]): number {
	const siteOrigin = new URL(
		document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ??
			document.querySelector('meta[property="og:url"]')?.getAttribute('content') ??
			location.href,
		location.href,
	).origin

	const pendingRoots: Array<Element | ShadowRoot> = contentSelectors.flatMap((selector) => [
		...document.querySelectorAll(selector),
	])
	let changedCount = 0
	let root = pendingRoots.pop()
	while (root !== undefined) {
		for (const element of root.querySelectorAll('*')) {
			if (element.shadowRoot) {
				pendingRoots.push(element.shadowRoot)
			}

			const href =
				element instanceof HTMLAnchorElement
					? (element.getAttribute('href') ?? undefined)
					: undefined
			if (href === undefined || href.startsWith('#') || !URL.canParse(href, location.href)) {
				continue
			}

			const url = new URL(href, location.href)
			if (url.origin !== location.origin) {
				continue
			}

			const siteUrl = new URL(`${url.pathname}${url.search}${url.hash}`, siteOrigin).href
			if (siteUrl === href) {
				continue
			}

			element.setAttribute('href', siteUrl)
			changedCount += 1
		}

		root = pendingRoots.pop()
	}

	return changedCount
}

/**
 * Points the links of the current page's content that lead to its own server at
 * the published site, so they keep working in a PDF made from a local server.
 */
async function pointLinksAtSite(page: Page): Promise<void> {
	const changedCount = await page.evaluate(pointLinks, [SELECTORS.heading, SELECTORS.mainInfo])
	if (changedCount > 0) {
		log.debug(`Pointed ${changedCount} link(s) on ${page.url()} at the published site.`)
	}
}

export default pointLinksAtSite
