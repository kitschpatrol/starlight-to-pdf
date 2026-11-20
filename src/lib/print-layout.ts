import type { Page } from 'puppeteer'
import type { ResolvedOptions } from './types'
import { ParsingError } from './errors'

/** Dimensions of Puppeteer's paper formats in inches. */
const PAPER_SIZES_INCHES = {
	a0: { width: 33.1102, height: 46.811 },
	a1: { width: 23.3858, height: 33.1102 },
	a2: { width: 16.5354, height: 23.3858 },
	a3: { width: 11.6929, height: 16.5354 },
	a4: { width: 8.2677, height: 11.6929 },
	a5: { width: 5.8268, height: 8.2677 },
	a6: { width: 4.1339, height: 5.8268 },
	ledger: { width: 17, height: 11 },
	legal: { width: 8.5, height: 14 },
	letter: { width: 8.5, height: 11 },
	tabloid: { width: 11, height: 17 },
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

const SPACING_TO_PIXELS_REGEX = /^(?<amount>\d+(?:\.\d+)?)(?<unit>mm|in|cm|px|pt|pc)?$/v

/** Page and content box dimensions of the printed PDF in CSS pixels. */
export type PrintLayout = {
	/** Height of the page area left for content inside the margins and paddings. */
	contentHeightPixels: number
	/** Width of the page area left for content inside the margins and paddings. */
	contentWidthPixels: number
	pageWidthPixels: number
	/** Sum of the top and bottom margins and paddings. */
	verticalInsetPixels: number
}

function isKnownFormat(value: string): value is keyof typeof PAPER_SIZES_INCHES {
	return Object.hasOwn(PAPER_SIZES_INCHES, value)
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
 * Computes the page and content box dimensions of the PDF from the paper
 * format, margins, and paddings. Not applicable to `cssPageSize`, where the
 * page size comes from user CSS.
 */
export function getPrintLayout(options: ResolvedOptions): PrintLayout {
	const formatKey = options.format.toLowerCase()
	if (!isKnownFormat(formatKey)) {
		throw new ParsingError(`Unsupported paper format: '${options.format}'.`)
	}

	const paperSize = PAPER_SIZES_INCHES[formatKey]
	const pageWidthPixels = paperSize.width * CSS_PIXELS_PER_INCH
	const pageHeightPixels = paperSize.height * CSS_PIXELS_PER_INCH

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

	return {
		contentHeightPixels: pageHeightPixels - verticalInsetPixels,
		contentWidthPixels: pageWidthPixels - horizontalInsetPixels,
		pageWidthPixels,
		verticalInsetPixels,
	}
}

/**
 * Lays the page out like a page of the PDF, with print styles at the content
 * box size, so measurements in the browser match the final rendering.
 */
export async function emulatePrintLayout(page: Page, layout: PrintLayout): Promise<void> {
	await page.emulateMediaType('print')
	await page.setViewport({
		width: Math.max(1, Math.round(layout.contentWidthPixels)),
		height: Math.max(1, Math.round(layout.contentHeightPixels)),
	})
}
