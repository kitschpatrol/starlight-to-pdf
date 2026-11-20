import type { Page } from 'puppeteer'
import type { ResolvedOptions } from './types'
import { log } from './log'
import { emulatePrintLayout, getPrintLayout } from './print-layout'

/**
 * Avoids page breaks inside boxes, block-level elements with a border or a
 * shadow, that fit on a page, including boxes in open shadow roots, and returns
 * how many boxes it found. Runs in the browser context.
 */
function avoidBreaksInBoxes(maxHeight: number): number {
	const elements: Element[] = []
	const pendingRoots: Array<Element | ShadowRoot> = [document.body]
	let root = pendingRoots.pop()
	while (root !== undefined) {
		for (const element of root.querySelectorAll('*')) {
			elements.push(element)
			if (element.shadowRoot) {
				pendingRoots.push(element.shadowRoot)
			}
		}

		root = pendingRoots.pop()
	}

	// Only block-level boxes break across pages
	const breakableDisplays = new Set(['block', 'flex', 'flow-root', 'grid', 'list-item', 'table'])
	// Measures every box before changing any, since each change invalidates the layout
	const boxes = elements.filter((element): element is HTMLElement => {
		if (!(element instanceof HTMLElement)) {
			return false
		}

		const style = getComputedStyle(element)
		const hasBorder = [
			[style.borderTopStyle, style.borderTopWidth, style.borderTopColor],
			[style.borderRightStyle, style.borderRightWidth, style.borderRightColor],
			[style.borderBottomStyle, style.borderBottomWidth, style.borderBottomColor],
			[style.borderLeftStyle, style.borderLeftWidth, style.borderLeftColor],
		].some(
			([borderStyle, width, color]) =>
				borderStyle !== 'none' &&
				borderStyle !== 'hidden' &&
				width !== '0px' &&
				color !== 'rgba(0, 0, 0, 0)',
		)
		if (!breakableDisplays.has(style.display) || (!hasBorder && style.boxShadow === 'none')) {
			return false
		}

		const { height } = element.getBoundingClientRect()
		return height > 0 && height <= maxHeight
	})

	for (const box of boxes) {
		box.style.setProperty('break-inside', 'avoid')
	}

	return boxes.length
}

/**
 * Keeps boxes, such as cards and callouts, on one page when they fit on a page.
 * A box split across pages loses its edges at the break, and its heading can
 * end up apart from the rest, such as the chart of a dashboard card. Measures
 * at the print layout of the configured paper format, so it doesn't apply to
 * page sizes set in CSS.
 */
async function keepBoxesWhole(page: Page, options: ResolvedOptions): Promise<void> {
	const layout = getPrintLayout(options)
	await emulatePrintLayout(page, layout)

	const boxCount = await page.evaluate(avoidBreaksInBoxes, layout.contentHeightPixels)
	if (boxCount > 0) {
		log.info(`Kept ${boxCount} box(es) that fit on a page whole.`)
	}
}

export default keepBoxesWhole
