import type { Page } from 'puppeteer'
import type { PrintLayout } from './print-layout'
import type { PrintUnit } from './print-units'
import type { ResolvedOptions } from './types'
import { log } from './log'
import { getPrintLayout } from './print-layout'
import { PAGE_NAME_PREFIX } from './print-units'

/** Extra height per page to absorb sub-pixel rounding in measurement. */
const HEIGHT_BUFFER_PIXELS = 2

const MIN_PAGE_HEIGHT_PIXELS = 96

/** The PDF format caps page dimensions at 14,400 pt (200 in). */
const MAX_PDF_PAGE_HEIGHT_PIXELS = 19_200

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
 * height as tall as the content of its print unit. The PDF must be recorded
 * with `preferCSSPageSize` for the rules to apply.
 */
async function applyDynamicPageHeight(
	page: Page,
	units: PrintUnit[],
	options: ResolvedOptions,
): Promise<void> {
	const layout = getPrintLayout(options)
	const unitHeightsPixels = units.map(({ height }) => height)

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
