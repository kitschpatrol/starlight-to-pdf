import { describe, expect, it } from 'vitest'
import { ParsingError } from '../src/lib/errors'
import { resolveOptions } from '../src/lib/options'
import { getPrintLayout } from '../src/lib/print-layout'

const INCH_PIXELS = 96

describe('getPrintLayout', () => {
	it('should subtract the default margins from a letter page', () => {
		const layout = getPrintLayout(resolveOptions({ url: 'https://example.com' }))
		expect(layout.pageWidthPixels).toBe(816)
		expect(layout.contentWidthPixels).toBe(816 - 2 * INCH_PIXELS)
		expect(layout.contentHeightPixels).toBe(1056 - 2 * INCH_PIXELS)
		expect(layout.verticalInsetPixels).toBe(2 * INCH_PIXELS)
	})

	it('should subtract paddings and numeric margins', () => {
		const layout = getPrintLayout(
			resolveOptions({
				format: 'a4',
				margins: { bottom: 10, left: 0, right: 0, top: 10 },
				paddings: '1in 20px 30pt 40px',
				url: 'https://example.com',
			}),
		)
		expect(layout.contentWidthPixels).toBeCloseTo(8.2677 * 96 - 60)
		expect(layout.contentHeightPixels).toBeCloseTo(11.6929 * 96 - 20 - 96 - 40)
	})

	it('should reject margins in unsupported units', () => {
		const options = resolveOptions({
			margins: { bottom: '1em', left: '0', right: '0', top: '0' },
			url: 'https://example.com',
		})
		expect(() => getPrintLayout(options)).toThrow(ParsingError)
	})
})
