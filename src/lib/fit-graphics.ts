import type { Page } from 'puppeteer'
import type { ResolvedOptions } from './types'
import { log } from './log'
import { emulatePrintLayout, getPrintLayout } from './print-layout'

/** Space kept free below fitted content to absorb sub-pixel rounding. */
const FIT_BUFFER_PIXELS = 2

/**
 * Caps the height of graphics taller than the space a page offers them and
 * returns how many were capped. A graphic alone in a figure gets the page
 * height minus the rest of the figure, so the graphic prints together with its
 * caption, unless the rest of the figure takes more than half a page. Runs in
 * the browser context.
 */
function capGraphicHeights(maxHeight: number): number {
	const graphicSelector = 'img, video, canvas, svg'

	// Inline SVGs only scale with a viewBox, and nested SVGs scale with their
	// outermost SVG
	// eslint-disable-next-line unicorn/consistent-function-scoping -- Puppeteer only sends this function's own source to the browser
	const isScalableGraphic = (element: Element): element is HTMLElement | SVGSVGElement =>
		(element instanceof HTMLElement ||
			(element instanceof SVGSVGElement &&
				element.ownerSVGElement === null &&
				element.hasAttribute('viewBox'))) &&
		element.getClientRects().length > 0

	let cappedCount = 0
	const graphics = [...document.body.querySelectorAll(graphicSelector)].filter(isScalableGraphic)
	for (const graphic of graphics) {
		const { height } = graphic.getBoundingClientRect()
		const figure = graphic.closest('figure')
		const isOnlyFigureGraphic =
			figure !== null &&
			[...figure.querySelectorAll(graphicSelector)].filter(isScalableGraphic).length === 1
		const surroundingHeight = isOnlyFigureGraphic
			? figure.getBoundingClientRect().height - height
			: 0
		const availableHeight =
			surroundingHeight < maxHeight / 2 ? maxHeight - surroundingHeight : maxHeight

		if (height <= availableHeight) {
			continue
		}

		graphic.style.setProperty('max-height', `${availableHeight}px`, 'important')
		graphic.style.setProperty('object-fit', 'contain', 'important')
		cappedCount += 1
	}

	return cappedCount
}

/**
 * Scales down graphics too tall to fit on a page, which the browser would
 * otherwise slice across pages. Measures at the print layout of the configured
 * paper format, so it doesn't apply to page sizes set in CSS.
 */
async function fitGraphicsToPage(page: Page, options: ResolvedOptions): Promise<void> {
	const layout = getPrintLayout(options)
	await emulatePrintLayout(page, layout)

	const cappedCount = await page.evaluate(
		capGraphicHeights,
		layout.contentHeightPixels - FIT_BUFFER_PIXELS,
	)
	if (cappedCount > 0) {
		log.info(`Scaled down ${cappedCount} graphic(s) to fit on a page.`)
	}
}

export default fitGraphicsToPage
