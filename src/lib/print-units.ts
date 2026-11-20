import type { Page } from 'puppeteer'
import type { ResolvedOptions } from './types'
import { CLASSNAMES, PAGE_TITLE_ATTRIBUTE } from './constants'
import { emulatePrintLayout, getPrintLayout } from './print-layout'

/** Prefix for the generated named `@page` rules, one per print unit. */
export const PAGE_NAME_PREFIX = 's2pdf-page-'

/**
 * Content that prints on pages of its own, such as a docs page, the table of
 * contents, or the cover page.
 */
export type PrintUnit = {
	/** Content height in CSS pixels, measured at the print layout when known. */
	height: number
	/** Cover and back pages print without header and footer. */
	kind: 'back-page' | 'content' | 'cover'
	/** Title of the docs page or table of contents, for the running header. */
	title: string | undefined
}

/**
 * Assigns a named `page` to every element of each print unit and returns the
 * units. A unit ends with an element that forces a page break after it, or
 * before the back page, which starts on a new page. Runs in the browser
 * context.
 */
function measureAndNameUnits(
	classnames: typeof CLASSNAMES,
	titleAttribute: string,
	pageNamePrefix: string,
): PrintUnit[] {
	const skippedTags = new Set(['BASE', 'LINK', 'SCRIPT', 'STYLE', 'TITLE'])
	const flow = [...document.body.children].flatMap((child) =>
		child.classList.contains(classnames.mainContainer) ? [...child.children] : [child],
	)

	const units: PrintUnit[] = []
	let previousBottom = 0
	let openUnit: Omit<PrintUnit, 'height'> | undefined

	for (const element of flow) {
		if (!(element instanceof HTMLElement) || skippedTags.has(element.tagName)) {
			continue
		}

		const rect = element.getBoundingClientRect()
		const top = rect.top + window.scrollY
		const bottom = rect.bottom + window.scrollY

		if (openUnit !== undefined && element.classList.contains(classnames.backPage)) {
			units.push({ ...openUnit, height: top - previousBottom })
			previousBottom = top
			openUnit = undefined
		}

		openUnit ??= { kind: 'content', title: undefined }
		if (element.classList.contains(classnames.cover)) {
			openUnit.kind = 'cover'
		} else if (element.classList.contains(classnames.backPage)) {
			openUnit.kind = 'back-page'
		}

		openUnit.title ??= element.getAttribute(titleAttribute) ?? undefined
		element.style.setProperty('page', `${pageNamePrefix}${units.length}`)

		if (!element.classList.contains(classnames.pageBreak)) {
			continue
		}

		// Descendants can extend past the element's box, for example a grid with a
		// negative bottom margin, and print on a page of their own otherwise
		const overflowBottom = Math.max(bottom, top + element.scrollHeight)
		units.push({ ...openUnit, height: overflowBottom - previousBottom })
		previousBottom = bottom
		openUnit = undefined
	}

	if (openUnit !== undefined) {
		const documentBottom = Math.max(
			document.documentElement.scrollHeight,
			document.body.scrollHeight,
		)
		units.push({ ...openUnit, height: documentBottom - previousBottom })
	}

	return units
}

/**
 * Names the pages of each print unit, so `@page` rules can size them and give
 * them a header and footer, and returns the units. Measures at the print layout
 * of the paper format, unless the page size comes from CSS.
 */
export async function namePrintUnits(page: Page, options: ResolvedOptions): Promise<PrintUnit[]> {
	if (options.cssPageSize) {
		await page.emulateMediaType('print')
	} else {
		await emulatePrintLayout(page, getPrintLayout(options))
	}

	return page.evaluate(measureAndNameUnits, CLASSNAMES, PAGE_TITLE_ATTRIBUTE, PAGE_NAME_PREFIX)
}
