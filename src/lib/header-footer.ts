import type { Page } from 'puppeteer'
import type { PrintUnit } from './print-units'
import type { DocumentInfo } from './types'
import { PAGE_NAME_PREFIX } from './print-units'

type HeaderFooterOptions = {
	document: DocumentInfo
	footer: boolean
	header: boolean
	revision: string | undefined
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

/** Joins the parts that have text with a middle dot. */
function joinParts(parts: Array<string | undefined>): string {
	return parts.filter((part) => part !== undefined && part !== '').join(' · ')
}

/**
 * Builds the `@page` rules for the running header and footer, which print in
 * the page margins: the document title and the title of the current docs page
 * at the top, and the revision, date, and page numbers at the bottom, where the
 * document title moves without a header. The cover and back pages print without
 * them.
 */
export function buildHeaderFooterRules(
	units: PrintUnit[],
	{ document, footer, header, revision }: HeaderFooterOptions,
	{ color, fontFamily }: MarginTypography,
): string {
	// Margin boxes inherit from the page context, but not from the document
	const rules = [`@page { color: ${color}; font-family: ${fontFamily}; font-size: 8pt; }`]

	if (header) {
		rules.push(`@page { @top-left { content: ${toCssString(document.title)}; } }`)
	}

	if (footer) {
		const footerText = joinParts([header ? undefined : document.title, revision, document.date])
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
		} else if (header && unit.title !== undefined && unit.title !== document.title) {
			const headerText = joinParts([document.title, unit.title])
			rules.push(`@page ${pageName} { @top-left { content: ${toCssString(headerText)}; } }`)
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
