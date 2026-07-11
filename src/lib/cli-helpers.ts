import type { PaperFormat, PDFMargin } from 'puppeteer'
import { sep } from 'node:path'
import { BASE_PAPER_FORMATS, PAPER_FORMATS } from './constants'
import { ValidationError } from './errors'
import { logger } from './logger'

// Windows-specific characters and reserved names
const INVALID_PATH_CHARS = /[<>:"\|?*]/v
const RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iv
const HTTP_PROTOCOL_REGEX = /^https?:\/\//v
const SPACING_REGEX = /^\d+(?:\.\d+)?(?:mm|in|cm|px|pt|pc)?$/v

/**
 * Parses the user-provided documentation URL, defaulting to HTTPS when no
 * protocol is given.
 */
export function parseBaseUrl(url: string): URL {
	let userUrl = url

	if (!HTTP_PROTOCOL_REGEX.test(url)) {
		userUrl = `https://${url}`
		logger.warn(`Protocol is not specified. Defaulting to HTTPS. Resulting URL: ${userUrl}`)
	}

	if (!URL.canParse(userUrl)) {
		throw new ValidationError(`Can not parse URL. '${userUrl}' is not a valid URL string.`)
	}

	return new URL(userUrl)
}

function resolvePageUrl(value: string, origin: string): string {
	if (!URL.canParse(value, origin)) {
		throw new ValidationError(`Invalid URL path provided: '${value}'.`)
	}

	const url = new URL(value, origin)
	return url.href.endsWith('/') ? url.href : `${url.href}/`
}

/**
 * Resolves the space-separated `--exclude` values against the documentation
 * origin into a set of absolute page URLs.
 */
export function resolveExcludeUrls(values: string[], origin: string): Set<string> {
	const excludeUrls = new Set<string>()

	for (const value of values) {
		const parts = value.split(' ').filter((part) => part !== '')
		for (const part of parts) {
			excludeUrls.add(resolvePageUrl(part, origin))
		}
	}

	return excludeUrls
}

/**
 * Resolves the `--last` value against the documentation origin into an absolute
 * page URL.
 */
export function resolveLastUrl(value: string, origin: string): string {
	return resolvePageUrl(value, origin)
}

/**
 * Validates a four-value spacing string (e.g. `'1cm 1cm 1cm 1.5cm'`) as used by
 * the `--margins` and `--paddings` flags. Returns the value unchanged.
 */
export function validateSpacing(value: string, flag: string): string {
	const parts = value.split(' ')
	if (parts.length !== 4) {
		throw new ValidationError(`For \`--${flag}\` argument must be four values separated by spaces.`)
	}

	for (const part of parts) {
		if (!SPACING_REGEX.test(part)) {
			throw new ValidationError(`Invalid \`--${flag}\` value provided: '${part}'.`)
		}
	}

	return value
}

/**
 * Parses the `--margins` value into a Puppeteer margin object.
 */
export function parseMargins(value: string): PDFMargin {
	validateSpacing(value, 'margins')
	const [top = '0', right = '0', bottom = '0', left = '0'] = value.split(' ')
	return { bottom, left, right, top }
}

/**
 * Validates the `--filename` value against characters and names that are
 * invalid on common filesystems. Returns the value unchanged.
 */
export function validateFilename(name: string): string {
	if (name.trim() === '') {
		throw new ValidationError('`--filename` argument value must be a non-empty string.')
	}

	if (INVALID_PATH_CHARS.test(name) || RESERVED_NAMES.test(name)) {
		throw new ValidationError(`Invalid \`--filename\` value. Provided: '${name}'`)
	}

	return name
}

/**
 * Validates a path-like flag value against characters and names that are
 * invalid on common filesystems. Returns the value unchanged.
 */
export function validatePath(value: string, flag: string): string {
	if (value.trim() === '') {
		throw new ValidationError(`\`--${flag}\` argument value must be a non-empty string.`)
	}

	for (const part of value.split(sep)) {
		if (INVALID_PATH_CHARS.test(part) || RESERVED_NAMES.test(part)) {
			throw new ValidationError(`\`--${flag}\` value contains invalid part: ${part}`)
		}
	}

	// Ensures the path doesn't have null bytes
	if (value.includes('\0')) {
		throw new ValidationError(`\`--${flag}\` value contains null byte.`)
	}

	return value
}

/**
 * Validates that a path-like flag value points to a file with the expected
 * extension. Returns the value unchanged.
 */
export function validateFileExtension(value: string, extension: string, flag: string): string {
	validatePath(value, flag)

	if (value.split('.').at(-1) !== extension) {
		throw new ValidationError(
			`Invalid file provided: '${value}'. Expected \`*.${extension}\` file.`,
		)
	}

	return value
}

/**
 * Parses the `--format` value into Puppeteer's `PaperFormat` type. Case
 * variants of the known formats are accepted.
 */
export function parsePaperFormat(value: string): PaperFormat {
	if (!isPaperFormat(value)) {
		throw new ValidationError(
			`Invalid format value provided: '${value}'.\nAllowed values: '${BASE_PAPER_FORMATS.join("', '")}'.`,
		)
	}

	return value
}

function isPaperFormat(value: string): value is PaperFormat {
	return PAPER_FORMATS.has(value)
}

/**
 * Validates a millisecond flag value, optionally requiring it to be
 * non-negative. Returns the value unchanged.
 */
export function validateMilliseconds(
	value: number,
	flag: string,
	{ isNonNegative }: { isNonNegative: boolean },
): number {
	if (Number.isNaN(value) || (isNonNegative && value < 0)) {
		throw new ValidationError(
			`Invalid \`--${flag}\` value provided. It must be a ${isNonNegative ? 'non-negative ' : ''}number of milliseconds.`,
		)
	}

	return value
}
