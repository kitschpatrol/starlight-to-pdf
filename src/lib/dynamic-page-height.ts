import type { Page } from 'puppeteer'
import type { PrintLayout } from './print-layout'
import type { ResolvedOptions } from './types'
import { CLASSNAMES } from './constants'
import { log } from './log'
import { emulatePrintLayout, getPrintLayout } from './print-layout'

/** Prefix for the generated named `@page` rules, one per print unit. */
const PAGE_NAME_PREFIX = 's2pdf-page-'

/** Extra height per page to absorb sub-pixel rounding in measurement. */
const HEIGHT_BUFFER_PIXELS = 2

const MIN_PAGE_HEIGHT_PIXELS = 96

/** The PDF format caps page dimensions at 14,400 pt (200 in). */
const MAX_PDF_PAGE_HEIGHT_PIXELS = 19_200

/**
 * Assigns a named `page` to every element of each print unit and returns the
 * measured content height of each unit in CSS pixels. A print unit is the
 * content between two forced page breaks: one or more elements ending with a
 * `pageBreakClass` element, plus any trailing content after the last break.
 * Runs in the browser context.
 */
function measureAndNameUnits(
	pageBreakClass: string,
	containerClass: string,
	pageNamePrefix: string,
): number[] {
	const skippedTags = new Set(['BASE', 'LINK', 'SCRIPT', 'STYLE', 'TITLE'])
	const flow = [...document.body.children].flatMap((child) =>
		child.classList.contains(containerClass) ? [...child.children] : [child],
	)

	const heights: number[] = []
	let unitIndex = 0
	let previousBottom = 0
	let hasOpenUnit = false

	for (const element of flow) {
		if (!(element instanceof HTMLElement) || skippedTags.has(element.tagName)) {
			continue
		}

		element.style.setProperty('page', `${pageNamePrefix}${unitIndex}`)
		hasOpenUnit = true

		if (!element.classList.contains(pageBreakClass)) {
			continue
		}

		const { bottom, top } = element.getBoundingClientRect()
		// Descendants can extend past the element's box, for example a grid with
		// a negative bottom margin, and print on a page of their own otherwise
		const overflowBottom = Math.max(bottom, top + element.scrollHeight)
		heights.push(overflowBottom + window.scrollY - previousBottom)
		previousBottom = bottom + window.scrollY
		unitIndex += 1
		hasOpenUnit = false
	}

	if (hasOpenUnit) {
		const documentBottom = Math.max(
			document.documentElement.scrollHeight,
			document.body.scrollHeight,
		)
		heights.push(documentBottom - previousBottom)
	}

	return heights
}

/**
 * Builds one named `@page` rule per print unit, sized to the unit's measured
 * content height plus the page margins and paddings.
 */
export function buildPageRules(
	unitHeightsPixels: number[],
	{
		pageWidthPixels,
		verticalInsetPixels,
	}: Pick<PrintLayout, 'pageWidthPixels' | 'verticalInsetPixels'>,
): string {
	const width = Math.round(pageWidthPixels)
	const rules = unitHeightsPixels.map((height, index) => {
		const pageHeight = Math.max(
			MIN_PAGE_HEIGHT_PIXELS,
			Math.ceil(height + verticalInsetPixels) + HEIGHT_BUFFER_PIXELS,
		)
		return `@page ${PAGE_NAME_PREFIX}${index} { size: ${width}px ${pageHeight}px; }`
	})

	return rules.join('\n')
}

/**
 * Sizes each PDF page individually: constant width from the paper format,
 * height as tall as the page's content. Measures each print unit at the print
 * layout width, then injects named `@page` rules sized to the measurements. The
 * PDF must be recorded with `preferCSSPageSize` for the rules to apply.
 */
async function applyDynamicPageHeight(page: Page, options: ResolvedOptions): Promise<void> {
	const layout = getPrintLayout(options)

	// Measure at the print layout width so heights match the final rendering
	await emulatePrintLayout(page, layout)

	const unitHeightsPixels = await page.evaluate(
		measureAndNameUnits,
		CLASSNAMES.pageBreak,
		CLASSNAMES.mainContainer,
		PAGE_NAME_PREFIX,
	)

	const oversizedCount = unitHeightsPixels.filter(
		(height) => height + layout.verticalInsetPixels > MAX_PDF_PAGE_HEIGHT_PIXELS,
	).length
	if (oversizedCount > 0) {
		log.warn(
			`${oversizedCount} page(s) exceed the PDF page height limit of 200 inches and may render incorrectly in some viewers.`,
		)
	}

	log.info(`Dynamic page height: sized ${unitHeightsPixels.length} pages individually.`)

	await page.addStyleTag({ content: buildPageRules(unitHeightsPixels, layout) })
}

export default applyDynamicPageHeight
