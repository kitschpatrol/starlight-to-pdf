import type { Page } from 'puppeteer'
import type { ResolvedOptions } from './types'
import { CLASSNAMES } from './constants'
import { log } from './log'
import { emulatePrintLayout, getPrintLayout } from './print-layout'

/**
 * Adds the class to every table that fits its container with the class applied,
 * and returns how many tables are too wide for it. Runs in the browser
 * context.
 */
function markTablesThatFit(className: string): number {
	let tooWideCount = 0
	for (const table of document.body.querySelectorAll('table')) {
		table.classList.add(className)
		const containerWidth = table.parentElement?.getBoundingClientRect().width ?? Infinity
		// Starlight lays tables out as scrolling blocks, which overflow internally
		const isTooWide =
			table.scrollWidth > table.clientWidth || table.getBoundingClientRect().width > containerWidth
		if (!isTooWide) {
			continue
		}

		table.classList.remove(className)
		tooWideCount += 1
	}

	return tooWideCount
}

/**
 * Wraps table cells only between words wherever the table still fits the page
 * width. Starlight's print styles let table cells wrap anywhere so wide tables
 * can't overflow the page, which also splits words in narrow columns of tables
 * that would fit.
 */
async function fitTablesToPage(page: Page, options: ResolvedOptions): Promise<void> {
	const layout = getPrintLayout(options)
	await emulatePrintLayout(page, layout)

	const wordWrapClass = CLASSNAMES.wordWrapTable
	await page.addStyleTag({
		content: `table.${wordWrapClass} :is(th, td), table.${wordWrapClass} :is(th, td) * { overflow-wrap: break-word; }`,
	})

	const tooWideCount = await page.evaluate(markTablesThatFit, wordWrapClass)
	if (tooWideCount > 0) {
		log.info(`${tooWideCount} table(s) are too wide to wrap only between words.`)
	}
}

export default fitTablesToPage
