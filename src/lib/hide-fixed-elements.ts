import type { Page } from 'puppeteer'
import { CLASSNAMES } from './constants'
import { log } from './log'

/**
 * Hides the rendered elements with fixed positioning inside the container, and
 * returns how many it hid. Runs in the browser context.
 */
function hideRenderedFixedElements(containerSelector: string): number {
	let hiddenCount = 0
	for (const element of document.querySelectorAll(`${containerSelector} *`)) {
		if (
			!(element instanceof HTMLElement) ||
			element.getClientRects().length === 0 ||
			getComputedStyle(element).position !== 'fixed'
		) {
			continue
		}

		element.style.setProperty('display', 'none', 'important')
		hiddenCount += 1
	}

	return hiddenCount
}

/**
 * Hides elements with fixed positioning in the docs content, such as floating
 * toolbars and control panels. Browsers print fixed elements on every page, and
 * with all docs pages assembled into one document, they would show up across
 * the whole PDF.
 */
async function hideFixedElements(page: Page): Promise<void> {
	await page.emulateMediaType('print')

	const hiddenCount = await page.evaluate(hideRenderedFixedElements, `.${CLASSNAMES.mainContainer}`)
	if (hiddenCount > 0) {
		log.info(`Hid ${hiddenCount} fixed-position element(s) that would print on every page.`)
	}
}

export default hideFixedElements
