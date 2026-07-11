import { describe, expect, it } from 'vitest'
import {
	parseBaseUrl,
	parseMargins,
	resolveExcludeUrls,
	resolveLastUrl,
	validateFileExtension,
	validateFilename,
	validateMilliseconds,
	validateSpacing,
} from '../src/lib/cli-helpers'
import { ValidationError } from '../src/lib/errors'

describe('parseBaseUrl', () => {
	it('should parse a full URL', () => {
		expect(parseBaseUrl('https://example.com/docs').href).toBe('https://example.com/docs')
	})

	it('should default to https when no protocol is given', () => {
		expect(parseBaseUrl('example.com').href).toBe('https://example.com/')
	})

	it('should keep explicit http', () => {
		expect(parseBaseUrl('http://localhost:8787/docs').protocol).toBe('http:')
	})

	it('should throw on unparsable input', () => {
		expect(() => parseBaseUrl('https://bad host.com')).toThrow(ValidationError)
	})
})

describe('resolveExcludeUrls', () => {
	it('should resolve paths against the origin with trailing slashes', () => {
		const result = resolveExcludeUrls(['/docs/demo'], 'https://example.com')
		expect(result).toEqual(new Set(['https://example.com/docs/demo/']))
	})

	it('should split space-separated values', () => {
		const result = resolveExcludeUrls(['/a /b', '/c'], 'https://example.com')
		expect(result).toEqual(
			new Set(['https://example.com/a/', 'https://example.com/b/', 'https://example.com/c/']),
		)
	})
})

describe('resolveLastUrl', () => {
	it('should resolve a path against the origin', () => {
		expect(resolveLastUrl('/docs/demo', 'https://example.com')).toBe(
			'https://example.com/docs/demo/',
		)
	})
})

describe('validateSpacing', () => {
	it('should accept four valid values', () => {
		expect(validateSpacing('1cm 2mm 3in 4.5px', 'margins')).toBe('1cm 2mm 3in 4.5px')
	})

	it('should reject fewer than four values', () => {
		expect(() => validateSpacing('1cm 1cm', 'margins')).toThrow(ValidationError)
	})

	it('should reject invalid units', () => {
		expect(() => validateSpacing('1cm 1cm 1cm 1banana', 'margins')).toThrow(ValidationError)
	})
})

describe('parseMargins', () => {
	it('should map values to sides in order', () => {
		expect(parseMargins('1cm 2cm 3cm 4cm')).toEqual({
			bottom: '3cm',
			left: '4cm',
			right: '2cm',
			top: '1cm',
		})
	})
})

describe('validateFilename', () => {
	it('should accept a normal filename', () => {
		expect(validateFilename('my-docs')).toBe('my-docs')
	})

	it('should reject reserved names and invalid characters', () => {
		expect(() => validateFilename('con')).toThrow(ValidationError)
		expect(() => validateFilename('a<b')).toThrow(ValidationError)
	})
})

describe('validateFileExtension', () => {
	it('should accept matching extensions', () => {
		expect(validateFileExtension('cover.html', 'html', 'preceding-html')).toBe('cover.html')
	})

	it('should reject mismatched extensions', () => {
		expect(() => validateFileExtension('cover.htm', 'html', 'preceding-html')).toThrow(
			ValidationError,
		)
	})
})

describe('validateMilliseconds', () => {
	it('should accept valid values', () => {
		expect(validateMilliseconds(100, 'scroll-delay', { isNonNegative: true })).toBe(100)
	})

	it('should reject negative values when non-negative is required', () => {
		expect(() => validateMilliseconds(-1, 'scroll-delay', { isNonNegative: true })).toThrow(
			ValidationError,
		)
	})

	it('should reject NaN', () => {
		expect(() => validateMilliseconds(NaN, 'timeout', { isNonNegative: false })).toThrow(
			ValidationError,
		)
	})
})
