import { describe, expect, it } from 'vitest'
import { buildPageRules } from '../src/lib/dynamic-page-height'

describe('buildPageRules', () => {
	it('should emit one named @page rule per unit, sized to content plus insets', () => {
		const rules = buildPageRules([500, 1000.4], { pageWidthPixels: 794, verticalInsetPixels: 76 })
		expect(rules).toBe(
			'@page s2pdf-page-0 { size: 794px 578px; }\n@page s2pdf-page-1 { size: 794px 1079px; }',
		)
	})

	it('should clamp tiny units to a minimum page height', () => {
		const rules = buildPageRules([1], { pageWidthPixels: 794, verticalInsetPixels: 0 })
		expect(rules).toBe('@page s2pdf-page-0 { size: 794px 96px; }')
	})

	it('should return an empty string for no units', () => {
		expect(buildPageRules([], { pageWidthPixels: 794, verticalInsetPixels: 0 })).toBe('')
	})
})
