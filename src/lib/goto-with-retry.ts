import type { GoToOptions, Page } from 'puppeteer'
import { setTimeout as sleep } from 'node:timers/promises'
import errorCatcher from './error-catcher'
import { ParsingError } from './errors'
import { log } from './log'

/**
 * Navigates the page to the given URL, retrying twice on failure.
 */
async function gotoWithRetry(page: Page, href: string, options?: GoToOptions) {
	let numberOfTries = 2

	while (numberOfTries >= 0) {
		const [error] = await errorCatcher(page.goto(href, options))
		if (!error) {
			break
		}

		if (numberOfTries > 0) {
			log.warn(`Error occurred while fetching ${href}. Retries left: ${numberOfTries}. Retrying...`)
			numberOfTries--
			await sleep(500) // Waits for ~500ms before fetch retrying
		} else {
			throw new ParsingError(`Error occurred while fetching '${href}'.`, {
				originalErrorMessage: error.message,
			})
		}
	}
}

export default gotoWithRetry
