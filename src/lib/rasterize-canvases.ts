import type { Page } from 'puppeteer'
import { SELECTORS } from './constants'
import { log } from './log'

/**
 * Replaces the canvases in the content with images of their pixels, and returns
 * how many canvases couldn't be read. Runs in the browser context.
 */
function replaceCanvasesWithImages(canvasSelector: string): number {
	let unreadableCount = 0
	for (const canvas of document.querySelectorAll(canvasSelector)) {
		if (!(canvas instanceof HTMLCanvasElement)) {
			continue
		}

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
 * pixels don't survive serializing the page to HTML. Canvases that can't be
 * read stay and print blank.
 */
async function rasterizeCanvases(page: Page): Promise<void> {
	const unreadableCount = await page.evaluate(
		replaceCanvasesWithImages,
		`${SELECTORS.mainInfo} canvas`,
	)
	if (unreadableCount > 0) {
		log.warn(
			`${unreadableCount} canvas(es) on ${page.url()} can't be read, such as WebGL canvases, and print blank.`,
		)
	}
}

export default rasterizeCanvases
