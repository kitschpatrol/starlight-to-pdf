import type { Page } from 'puppeteer'
import { SELECTORS } from './constants'
import { log } from './log'

/**
 * Replaces the canvases in the content, including those in open shadow roots,
 * with images of their pixels, and returns how many canvases couldn't be read.
 * Runs in the browser context.
 */
function replaceCanvasesWithImages(contentSelector: string): number {
	const canvases: HTMLCanvasElement[] = []
	const content = document.querySelector(contentSelector)
	const pendingRoots: Array<Element | ShadowRoot> = content === null ? [] : [content]
	let root = pendingRoots.pop()
	while (root !== undefined) {
		for (const element of root.querySelectorAll('*')) {
			if (element instanceof HTMLCanvasElement) {
				canvases.push(element)
			}

			if (element.shadowRoot) {
				pendingRoots.push(element.shadowRoot)
			}
		}

		root = pendingRoots.pop()
	}

	let unreadableCount = 0
	for (const canvas of canvases) {
		let source: string | undefined
		try {
			// WebGL canvases don't keep their pixels after drawing, and canvases
			// with cross-origin images throw on read
			source = canvas.getContext('2d') === null ? undefined : canvas.toDataURL()
		} catch {
			// Counted as unreadable below
		}

		if (source === undefined) {
			unreadableCount += 1
			continue
		}

		const image = document.createElement('img')
		for (const { name, value } of canvas.attributes) {
			if (name !== 'width' && name !== 'height') {
				image.setAttribute(name, value)
			}
		}

		image.src = source
		// Keep the rendered width, shrinking to narrower print layouts
		const { width } = canvas.getBoundingClientRect()
		if (width > 0) {
			image.style.width = `${width}px`
		}

		image.style.maxWidth = '100%'
		image.style.height = 'auto'
		canvas.replaceWith(image)
	}

	return unreadableCount
}

/**
 * Replaces the canvases in the current page's content with images, since canvas
 * pixels don't survive serializing the page to HTML, and returns how many
 * canvases print blank. Canvases that can't be read stay, and print blank
 * unless print styles hide them, such as a demo that prints a screenshot in its
 * place.
 */
async function rasterizeCanvases(page: Page): Promise<number> {
	const unreadableCount = await page.evaluate(replaceCanvasesWithImages, SELECTORS.mainInfo)
	if (unreadableCount === 0) {
		return 0
	}

	// The readable canvases are images by now, so the canvases left can't be read
	await page.emulateMediaType('print')
	const blankCount = await page.$$eval(
		`${SELECTORS.mainInfo} >>> canvas`,
		(canvases) => canvases.filter((canvas) => canvas.getClientRects().length > 0).length,
	)
	await page.emulateMediaType()

	if (blankCount > 0) {
		log.warn(
			`${blankCount} canvas(es) on ${page.url()} can't be read, such as WebGL canvases, and print blank.`,
		)
	}

	return blankCount
}

export default rasterizeCanvases
