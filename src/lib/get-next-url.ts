import type { Page } from 'puppeteer'
import { SELECTORS } from './constants'
import errorCatcher from './error-catcher'

/**
 * Returns the target of the Starlight pagination `rel="next"` link on the
 * current page, or `undefined` when the page has none.
 */
async function getNextUrl(page: Page): Promise<undefined | URL> {
	const [nextLinkError, nextLink] = await errorCatcher(
		page.$eval(SELECTORS.nextLink, (element) =>
			element instanceof HTMLAnchorElement ? element.href : undefined,
		),
	)

	if (nextLinkError) {
		return undefined
	}

	const currentUrl = new URL(page.url())

	return nextLink !== undefined && URL.canParse(nextLink, currentUrl.origin)
		? new URL(nextLink, currentUrl.origin)
		: undefined
}

export default getNextUrl
