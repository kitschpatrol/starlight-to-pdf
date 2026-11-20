import type { Page } from 'puppeteer'
import type { PrintUnit } from './print-units'
import type { DocumentInfo } from './types'
import { PAGE_NAME_PREFIX } from './print-units'

type HeaderFooterOptions = {
	document: DocumentInfo
	footer: boolean
	header: boolean
}

type MarginTypography = {
	color: string
	fontFamily: string
}

/** Quotes text as a CSS string. */
function toCssString(text: string): string {
	return `"${text
		.replaceAll('\\', '\\\\')
		.replaceAll('"', String.raw`\"`)
		.replaceAll('\n', ' ')}"`
}

/**
 * Builds the `@page` rules for the running header and footer, which print in
 * the page margins: the title of the current docs page at the top, and the
 * document title, date, and page numbers at the bottom. The cover and back
 * pages print without them.
 */
export function buildHeaderFooterRules(
	units: PrintUnit[],
	{ document, footer, header }: HeaderFooterOptions,
	{ color, fontFamily }: MarginTypography,
): string {
	// Margin boxes inherit from the page context, but not from the document
	const rules = [`@page { color: ${color}; font-family: ${fontFamily}; font-size: 8pt; }`]

	if (footer) {
		const footerText = [document.title, document.date].filter((text) => text !== '').join(' · ')
		rules.push(
			`@page { @bottom-left { content: ${toCssString(footerText)}; } @bottom-right { content: counter(page) " / " counter(pages); } }`,
		)
	}

	for (const [index, unit] of units.entries()) {
		const pageName = `${PAGE_NAME_PREFIX}${index}`
		if (unit.kind !== 'content') {
			rules.push(
				`@page ${pageName} { @top-left { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }`,
			)
		} else if (header && unit.title !== undefined) {
			rules.push(`@page ${pageName} { @top-left { content: ${toCssString(unit.title)}; } }`)
		}
	}

	return rules.join('\n')
}

/**
 * Reads the font of the document and the muted text color of Starlight for the
 * page margins. Runs in the browser context.
 */
function getMarginTypography(): MarginTypography {
	const bodyStyle = getComputedStyle(document.body)
	const mutedColor = getComputedStyle(document.documentElement)
		.getPropertyValue('--sl-color-gray-3')
		.trim()
	return {
		color: mutedColor === '' ? bodyStyle.color : mutedColor,
		fontFamily: bodyStyle.fontFamily,
	}
}

/**
 * Adds the running header and footer to the pages of the print units, in the
 * font of the document.
 */
async function applyHeaderFooter(
	page: Page,
	units: PrintUnit[],
	options: HeaderFooterOptions,
): Promise<void> {
	const typography = await page.evaluate(getMarginTypography)
	await page.addStyleTag({ content: buildHeaderFooterRules(units, options, typography) })
}

export default applyHeaderFooter
