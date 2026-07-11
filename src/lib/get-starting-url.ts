import type { Page } from 'puppeteer'
import getNextUrl from './get-next-url'
import gotoWithRetry from './goto-with-retry'
import { log } from './log'
import { getTopicUrls } from './sidebar-topics'

type GetStartingUrlParams = {
	page: Page
	url: URL
}

/**
 * Finds the first documentation page to start parsing from, following links
 * from the given URL until a page with pagination or a topics navigation is
 * found.
 */
async function getStartingUrl(
	{ page, url }: GetStartingUrlParams,
	visited?: Set<string>,
): Promise<undefined | URL> {
	await gotoWithRetry(page, url.href)
	const nextUrl = await getNextUrl(page)

	if (nextUrl) {
		return url
	}

	// Pages of sites with the `starlight-sidebar-topics` plugin may lack
	// pagination links, so the topics navigation marks docs content too
	const topicUrls = await getTopicUrls(page)
	if (topicUrls.length > 0) {
		return url
	}

	// Recursive search for the page to start parsing
	const links = await page.$$eval('a', (anchors) => anchors.map((anchor) => anchor.href))
	if (links.length === 0) {
		return undefined
	}

	const visitedLinks = visited ?? new Set<string>()
	visitedLinks.add(url.href)

	for (const link of links) {
		if (link === '' || visitedLinks.has(link)) {
			continue
		}

		if (!URL.canParse(link, url.origin)) {
			continue
		}

		const candidateUrl = new URL(link, url.origin)
		if (candidateUrl.hostname !== url.hostname) {
			// Prevents fetching from other domains
			continue
		}

		log.info(`Looking for next page. Navigating to ${candidateUrl.href}...`)

		visitedLinks.add(candidateUrl.href)
		const nextResult = await getStartingUrl({ page, url: candidateUrl }, visitedLinks)

		if (nextResult) {
			return nextResult
		}
	}

	return undefined
}

export default getStartingUrl
