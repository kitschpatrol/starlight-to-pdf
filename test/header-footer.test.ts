import { describe, expect, it } from 'vitest'
import type { PrintUnit } from '../src/lib/print-units'
import { buildHeaderFooterRules } from '../src/lib/header-footer'

const typography = { color: 'rgb(90, 90, 90)', fontFamily: '"Inter", sans-serif' }
const documentInfo = { date: 'November 19, 2026', title: 'Docs "Plus"' }
const units: PrintUnit[] = [
	{ height: 900, kind: 'cover', title: undefined },
	{ height: 400, kind: 'content', title: 'Contents' },
	{ height: 2000, kind: 'content', title: String.raw`Install \ Setup` },
	{ height: 300, kind: 'content', title: undefined },
	{ height: 900, kind: 'back-page', title: undefined },
	{ height: 600, kind: 'content', title: 'Docs "Plus"' },
]

describe('buildHeaderFooterRules', () => {
	it('should print the margins in the given typography', () => {
		expect(
			buildHeaderFooterRules(
				[],
				{ document: documentInfo, footer: false, header: false, revision: undefined },
				typography,
			),
		).toBe('@page { color: rgb(90, 90, 90); font-family: "Inter", sans-serif; font-size: 8pt; }')
	})

	it('should add the revision, date, and page numbers to the footer of every page', () => {
		const rules = buildHeaderFooterRules(
			[],
			{ document: documentInfo, footer: true, header: true, revision: 'Version 1.2.0' },
			typography,
		)
		expect(rules).toContain(
			'@page { @bottom-left { content: "Version 1.2.0 · November 19, 2026"; } @bottom-right { content: counter(page) " / " counter(pages); } }',
		)
	})

	it('should add the document title to the footer without a header', () => {
		const rules = buildHeaderFooterRules(
			[],
			{ document: documentInfo, footer: true, header: false, revision: undefined },
			typography,
		)
		expect(rules).toContain(
			String.raw`@bottom-left { content: "Docs \"Plus\" · November 19, 2026"; }`,
		)
	})

	it('should leave an empty date out of the footer', () => {
		const rules = buildHeaderFooterRules(
			[],
			{ document: { ...documentInfo, date: '' }, footer: true, header: true, revision: 'Draft' },
			typography,
		)
		expect(rules).toContain('@bottom-left { content: "Draft"; }')
	})

	it('should add the document title and the title of its content to the header of each page', () => {
		const rules = buildHeaderFooterRules(
			units,
			{ document: documentInfo, footer: false, header: true, revision: undefined },
			typography,
		)
		expect(rules).toContain(String.raw`@page { @top-left { content: "Docs \"Plus\""; } }`)
		expect(rules).toContain(
			String.raw`@page s2pdf-page-1 { @top-left { content: "Docs \"Plus\" · Contents"; } }`,
		)
		expect(rules).toContain(
			String.raw`@page s2pdf-page-2 { @top-left { content: "Docs \"Plus\" · Install \\ Setup"; } }`,
		)
		// Content without a title, or titled like the document, gets the document title alone
		expect(rules).not.toContain('@page s2pdf-page-3')
		expect(rules).not.toContain('@page s2pdf-page-5')
	})

	it('should keep the cover and back pages free of header and footer', () => {
		const rules = buildHeaderFooterRules(
			units,
			{ document: documentInfo, footer: true, header: true, revision: undefined },
			typography,
		)
		for (const index of [0, 4]) {
			expect(rules).toContain(
				`@page s2pdf-page-${index} { @top-left { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }`,
			)
		}
	})
})
