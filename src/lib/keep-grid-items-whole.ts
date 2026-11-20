import type { Page } from 'puppeteer'
import { log } from './log'

/**
 * Avoids page breaks inside grid items that span several rows, which includes
 * row subgrids, and returns how many items it found. Runs in the browser
 * context.
 */
function avoidBreaksInRowSpanningGridItems(): number {
	// eslint-disable-next-line e18e/prefer-static-regex -- Puppeteer only sends this function's own source to the browser
	const spanRegex = /^span (?<count>\d+)$/v
	let itemCount = 0
	for (const element of document.body.querySelectorAll('*')) {
		const { parentElement } = element
		if (
			parentElement === null ||
			!(element instanceof HTMLElement) ||
			!getComputedStyle(parentElement).display.includes('grid')
		) {
			continue
		}

		const style = getComputedStyle(element)
		const rowSpan = Math.max(
			...[style.gridRowStart, style.gridRowEnd].map((value) =>
				Number(spanRegex.exec(value)?.groups?.count ?? 1),
			),
		)
		const spansRows = rowSpan > 1 || style.gridTemplateRows.startsWith('subgrid')
		if (!spansRows) {
			continue
		}

		element.style.setProperty('break-inside', 'avoid')
		itemCount += 1
	}

	return itemCount
}

/**
 * Keeps grid items that span several rows on one page. When Chrome pushes part
 * of such an item to the next page, for example an image that doesn't fit, it
 * doesn't move the following grid rows along, so their content overlaps the
 * pushed part.
 */
async function keepGridItemsWhole(page: Page): Promise<void> {
	await page.emulateMediaType('print')

	const itemCount = await page.evaluate(avoidBreaksInRowSpanningGridItems)
	if (itemCount > 0) {
		log.info(`Kept ${itemCount} row-spanning grid item(s) on one page.`)
	}
}

export default keepGridItemsWhole
