import type { Page, PaperFormat } from 'puppeteer'
import type { ResolvedOptions } from './types'
import { CLASSNAMES } from './constants'
import { ParsingError } from './errors'
import { log } from './log'

/** Widths of Puppeteer's paper formats in inches. */
const PAPER_WIDTHS_INCHES = {
	a0: 33.1,
	a1: 23.4,
	a2: 16.54,
	a3: 11.7,
	a4: 8.27,
	a5: 5.83,
	a6: 4.13,
	ledger: 17,
	legal: 8.5,
	letter: 8.5,
	tabloid: 11,
} as const

const CSS_PIXELS_PER_INCH = 96

const PIXELS_PER_UNIT: Record<string, number> = {
	cm: CSS_PIXELS_PER_INCH / 2.54,
	in: CSS_PIXELS_PER_INCH,
	mm: CSS_PIXELS_PER_INCH / 25.4,
	pc: 16,
	pt: CSS_PIXELS_PER_INCH / 72,
	px: 1,
}

/** Prefix for the generated named `@page` rules, one per print unit. */
const PAGE_NAME_PREFIX = 's2pdf-page-'

/** Extra height per page to absorb sub-pixel rounding in measurement. */
const HEIGHT_BUFFER_PIXELS = 2

const MIN_PAGE_HEIGHT_PIXELS = 96

/** The PDF format caps page dimensions at 14,400 pt (200 in). */
const MAX_PDF_PAGE_HEIGHT_PIXELS = 19_200

const SPACING_TO_PIXELS_REGEX = /^(?<amount>\d+(?:\.\d+)?)(?<unit>mm|in|cm|px|pt|pc)?$/v

function isKnownFormat(value: string): value is keyof typeof PAPER_WIDTHS_INCHES {
	return Object.hasOwn(PAPER_WIDTHS_INCHES, value)
}

function formatWidthPixels(format: PaperFormat): number {
	const key = format.toLowerCase()
	if (!isKnownFormat(key)) {
		throw new ParsingError(
			`\`--dynamic-page-height\` doesn't support the '${format}' paper format.`,
		)
	}

	return PAPER_WIDTHS_INCHES[key] * CSS_PIXELS_PER_INCH
}

function spacingToPixels(value: number | string | undefined): number {
	if (value === undefined) {
		return 0
	}

	if (typeof value === 'number') {
		return value
	}

	const match = SPACING_TO_PIXELS_REGEX.exec(value.trim())
	const amount = match?.groups?.amount
	if (amount === undefined) {
		throw new ParsingError(`Couldn't convert spacing value to pixels: '${value}'.`)
	}

	return Number(amount) * (PIXELS_PER_UNIT[match?.groups?.unit ?? 'px'] ?? 1)
}

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

		if (element.classList.contains(pageBreakClass)) {
			const bottom = element.getBoundingClientRect().bottom + window.scrollY
			heights.push(bottom - previousBottom)
			previousBottom = bottom
			unitIndex += 1
			hasOpenUnit = false
		}
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
	}: { pageWidthPixels: number; verticalInsetPixels: number },
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
	const pageWidthPixels = formatWidthPixels(options.format)

	const [paddingTop = '0', paddingRight = '0', paddingBottom = '0', paddingLeft = '0'] =
		options.paddings?.split(' ') ?? []
	const horizontalInsetPixels =
		spacingToPixels(options.margins.left) +
		spacingToPixels(options.margins.right) +
		spacingToPixels(paddingLeft) +
		spacingToPixels(paddingRight)
	const verticalInsetPixels =
		spacingToPixels(options.margins.top) +
		spacingToPixels(options.margins.bottom) +
		spacingToPixels(paddingTop) +
		spacingToPixels(paddingBottom)

	// Measure at the print layout width so heights match the final rendering
	await page.emulateMediaType('print')
	await page.setViewport({
		width: Math.max(1, Math.round(pageWidthPixels - horizontalInsetPixels)),
		height: 1150,
	})

	const unitHeightsPixels = await page.evaluate(
		measureAndNameUnits,
		CLASSNAMES.pageBreak,
		CLASSNAMES.mainContainer,
		PAGE_NAME_PREFIX,
	)

	const oversizedCount = unitHeightsPixels.filter(
		(height) => height + verticalInsetPixels > MAX_PDF_PAGE_HEIGHT_PIXELS,
	).length
	if (oversizedCount > 0) {
		log.warn(
			`${oversizedCount} page(s) exceed the PDF page height limit of 200 inches and may render incorrectly in some viewers.`,
		)
	}

	log.info(`Dynamic page height: sized ${unitHeightsPixels.length} pages individually.`)

	await page.addStyleTag({
		content: buildPageRules(unitHeightsPixels, { pageWidthPixels, verticalInsetPixels }),
	})
}

export default applyDynamicPageHeight
