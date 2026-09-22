import type { PDFMargin } from 'puppeteer'
import type { PAPER_FORMATS, WAIT_UNTIL_OPTIONS } from './constants'
import type { ResolvedOptions } from './types'
import { DEFAULT_MARGINS, SCROLL_DELAY_MS, TIMEOUT_MS } from './constants'
import { ValidationError } from './errors'
import { log } from './log'

// Characters and names that are invalid in filenames on common filesystems,
// including path separators since the filename must not escape the target
// directory
const INVALID_FILENAME_CHARS = /[<>:"\/\\\|?*]/v
const RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iv
const HTTP_PROTOCOL_REGEX = /^https?:\/\//v
const SPACING_REGEX = /^\d+(?:\.\d+)?(?:mm|in|cm|px|pt|pc)?$/v

/**
 * Options for `starlightToPdf`. Only `url` is required; all other fields fall
 * back to the values in `DEFAULT_STARLIGHT_TO_PDF_OPTIONS`.
 */
export type StarlightToPdfOptions = {
	/**
	 * Path to a browser executable to use instead of the default one (e.g.
	 * `/usr/bin/chromium-browser`).
	 */
	browserExecutable?: string | undefined
	/**
	 * Adds the `--no-sandbox` and `--disable-setuid-sandbox` flags when launching
	 * the browser. Useful when running in environments where sandboxing is not
	 * available (e.g., certain CI/CD pipelines or Docker containers).
	 */
	browserNoSandbox?: boolean | undefined
	/** Generate a table of contents in the PDF. */
	contents?: boolean | undefined
	/**
	 * The type of links in the generated table of contents: `'internal'` for
	 * links that navigate within the PDF file or `'external'` for links that
	 * point to the documentation website.
	 */
	contentsLinks?: 'external' | 'internal' | undefined
	/** Customizes the generated table of contents name in the PDF. */
	contentsName?: string | undefined
	/**
	 * Allows setting the PDF page size using CSS `@page`. If the predefined sizes
	 * in the `format` option don't meet your needs, enable this option and
	 * specify the desired page size in custom CSS provided via `styles` (e.g.,
	 * `@page { size: 8.5in 14in; }`).
	 */
	cssPageSize?: boolean | undefined
	/**
	 * Experimental: sizes each PDF page individually so every docs page fits on a
	 * single page without breaks — constant width taken from `format`, height as
	 * tall as the content requires. Cannot be combined with `cssPageSize`.
	 */
	dynamicPageHeight?: boolean | undefined
	/**
	 * Links that shouldn't be added to the resulting PDF file. Each entry may
	 * also contain multiple space-separated links (e.g. `['/docs/contacts
	 * /docs/demo']`).
	 */
	exclude?: string[] | undefined
	/**
	 * The output filename for the PDF. Default is the hostname of the provided
	 * URL.
	 */
	filename?: string | undefined
	/**
	 * Path to an HTML file which content will be inserted at the end of the PDF
	 * file. Its behavior is similar to the `precedingHtml` option.
	 */
	followingHtml?: string | undefined
	/**
	 * Path to the HTML file for the PDF print footer. For more details, check the
	 * PDF header and footer section in the readme and Puppeteer's `PDFOptions`.
	 */
	footer?: string | undefined
	/**
	 * The paper format for the PDF file. Refer to Puppeteer's paper formats for
	 * more details.
	 */
	format?: (typeof PAPER_FORMATS)[number] | undefined
	/**
	 * Path to the HTML file for the PDF print header. For more details, check the
	 * PDF header and footer section in the readme and Puppeteer's `PDFOptions`.
	 */
	header?: string | undefined
	/**
	 * The last link to parse (e.g. `/docs/demo`). Further parsing stops once this
	 * link is reached and parsed.
	 */
	last?: string | undefined
	/**
	 * Margins for the PDF file. Provide a Puppeteer `PDFMargin` object or a
	 * string with 4 values separated by space, reflecting the top, right, bottom
	 * and left margins respectively.
	 */
	margins?: PDFMargin | string | undefined
	/**
	 * Padding for the PDF content. Provide as a string with 4 values separated by
	 * space, reflecting the top, right, bottom and left paddings respectively.
	 * Paddings are disabled by default.
	 */
	paddings?: string | undefined
	/** The event that indicates a successful page load. */
	pageWaitUntil?: (typeof WAIT_UNTIL_OPTIONS)[number] | undefined
	/**
	 * The directory path for the output PDF. Default is the current working
	 * directory.
	 */
	path?: string | undefined
	/**
	 * Enables a side outline in the PDF file. It's an `outline` property in
	 * Puppeteer's `PDFOptions`.
	 */
	pdfOutline?: boolean | undefined
	/**
	 * Path to an HTML file which content will be inserted at the beginning of the
	 * PDF file. This option may be useful for adding a cover page.
	 */
	precedingHtml?: string | undefined
	/**
	 * Enables printing of background graphics. It's a `printBackground` property
	 * in Puppeteer's `PDFOptions`.
	 */
	printBg?: boolean | undefined
	/**
	 * The delay (in milliseconds) between each viewport scroll to allow
	 * lazy-loaded content to fully render.
	 */
	scrollDelay?: number | undefined
	/**
	 * Applies the default `@media print` CSS styles from Starlight. Disable to
	 * retain the website's original colors when printing.
	 */
	starlightPrintCss?: boolean | undefined
	/**
	 * Path to a CSS file for custom PDF styles. The styles are injected into the
	 * `<style>` tag inside the `<body>` element. Also check the readme for a list
	 * of special CSS classes used by the tool.
	 */
	styles?: string | undefined
	/**
	 * Timeout for both the page actions and `protocolTimeout` in milliseconds.
	 * You may need to increase this value for parsing large websites.
	 */
	timeout?: number | undefined
	/**
	 * The URL of the Starlight powered documentation website to convert to PDF.
	 * Strings without a protocol default to HTTPS.
	 */
	url: string | URL
}

/**
 * Default values for the optional fields of `StarlightToPdfOptions`.
 */
export const DEFAULT_STARLIGHT_TO_PDF_OPTIONS = {
	browserNoSandbox: false,
	contents: true,
	contentsLinks: 'internal',
	cssPageSize: false,
	dynamicPageHeight: false,
	format: 'letter',
	margins: DEFAULT_MARGINS,
	pageWaitUntil: 'domcontentloaded',
	pdfOutline: false,
	printBg: false,
	scrollDelay: SCROLL_DELAY_MS,
	starlightPrintCss: true,
	timeout: TIMEOUT_MS,
} as const satisfies Partial<StarlightToPdfOptions>

function mapDefined<T, R>(value: T | undefined, transform: (value: T) => R): R | undefined {
	return value === undefined ? undefined : transform(value)
}

/**
 * Validates user-provided options, applies defaults, and resolves relative
 * links against the documentation origin. Throws a `ValidationError` when a
 * value is invalid.
 */
export function resolveOptions(options: StarlightToPdfOptions): ResolvedOptions {
	const defaults = DEFAULT_STARLIGHT_TO_PDF_OPTIONS
	const url = options.url instanceof URL ? options.url : parseBaseUrl(options.url)

	const cssPageSize = options.cssPageSize ?? defaults.cssPageSize
	const dynamicPageHeight = options.dynamicPageHeight ?? defaults.dynamicPageHeight
	if (cssPageSize && dynamicPageHeight) {
		throw new ValidationError('`dynamicPageHeight` cannot be combined with `cssPageSize`.')
	}

	const margins = options.margins ?? defaults.margins

	return {
		browserExecutable: mapDefined(options.browserExecutable, (value) =>
			validatePath(value, 'browserExecutable'),
		),
		browserNoSandbox: options.browserNoSandbox ?? defaults.browserNoSandbox,
		contents: options.contents ?? defaults.contents,
		contentsLinks: options.contentsLinks ?? defaults.contentsLinks,
		contentsName: options.contentsName,
		cssPageSize,
		dynamicPageHeight,
		exclude: mapDefined(options.exclude, (value) => resolveExcludeUrls(value, url.origin)),
		filename: mapDefined(options.filename, (value) => validateFilename(value)),
		followingHtml: mapDefined(options.followingHtml, (value) =>
			validateFileExtension(value, 'html', 'followingHtml'),
		),
		footer: mapDefined(options.footer, (value) => validateFileExtension(value, 'html', 'footer')),
		format: options.format ?? defaults.format,
		header: mapDefined(options.header, (value) => validateFileExtension(value, 'html', 'header')),
		last: mapDefined(options.last, (value) => resolveLastUrl(value, url.origin)),
		margins: typeof margins === 'string' ? parseMargins(margins) : margins,
		paddings: mapDefined(options.paddings, (value) => validateSpacing(value, 'paddings')),
		pageWaitUntil: options.pageWaitUntil ?? defaults.pageWaitUntil,
		path: mapDefined(options.path, (value) => validatePath(value, 'path')),
		pdfOutline: options.pdfOutline ?? defaults.pdfOutline,
		precedingHtml: mapDefined(options.precedingHtml, (value) =>
			validateFileExtension(value, 'html', 'precedingHtml'),
		),
		printBg: options.printBg ?? defaults.printBg,
		scrollDelay: validateMilliseconds(options.scrollDelay ?? defaults.scrollDelay, 'scrollDelay'),
		starlightPrintCss: options.starlightPrintCss ?? defaults.starlightPrintCss,
		styles: mapDefined(options.styles, (value) => validateFileExtension(value, 'css', 'styles')),
		timeout: validateMilliseconds(options.timeout ?? defaults.timeout, 'timeout'),
		url,
	}
}

/**
 * Parses the user-provided documentation URL, defaulting to HTTPS when no
 * protocol is given.
 */
export function parseBaseUrl(url: string): URL {
	let userUrl = url

	if (!HTTP_PROTOCOL_REGEX.test(url)) {
		userUrl = `https://${url}`
		log.warn(`Protocol is not specified. Defaulting to HTTPS. Resulting URL: ${userUrl}`)
	}

	if (!URL.canParse(userUrl)) {
		throw new ValidationError(`Can not parse URL. '${userUrl}' is not a valid URL string.`)
	}

	return new URL(userUrl)
}

/**
 * Normalizes a page URL into the canonical form used when comparing `exclude`
 * and `last` values against crawled page URLs: the hash is dropped and the
 * pathname gets a trailing slash, so the comparison works for sites built with
 * and without trailing slashes.
 */
export function normalizePageUrl(url: URL): string {
	const normalized = new URL(url)
	normalized.hash = ''

	if (!normalized.pathname.endsWith('/')) {
		normalized.pathname += '/'
	}

	return normalized.href
}

function resolvePageUrl(value: string, origin: string): string {
	if (!URL.canParse(value, origin)) {
		throw new ValidationError(`Invalid URL path provided: '${value}'.`)
	}

	return normalizePageUrl(new URL(value, origin))
}

/**
 * Resolves the space-separated `exclude` values against the documentation
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
 * Resolves the `last` value against the documentation origin into an absolute
 * page URL.
 */
export function resolveLastUrl(value: string, origin: string): string {
	return resolvePageUrl(value, origin)
}

/**
 * Validates a four-value spacing string (e.g. `'1cm 1cm 1cm 1.5cm'`) as used by
 * the `margins` and `paddings` options. Returns the value unchanged.
 */
export function validateSpacing(value: string, optionName: string): string {
	const parts = value.split(' ')
	if (parts.length !== 4) {
		throw new ValidationError(`The \`${optionName}\` option requires four space-separated values.`)
	}

	for (const part of parts) {
		if (!SPACING_REGEX.test(part)) {
			throw new ValidationError(`Invalid \`${optionName}\` value provided: '${part}'.`)
		}
	}

	return value
}

/**
 * Parses the `margins` value into a Puppeteer margin object.
 */
export function parseMargins(value: string): PDFMargin {
	validateSpacing(value, 'margins')
	const [top = '0', right = '0', bottom = '0', left = '0'] = value.split(' ', 4)
	return { bottom, left, right, top }
}

/**
 * Validates the `filename` value against characters and names that are invalid
 * on common filesystems. Returns the value unchanged.
 */
export function validateFilename(name: string): string {
	if (name.trim() === '') {
		throw new ValidationError('The `filename` option must be a non-empty string.')
	}

	if (INVALID_FILENAME_CHARS.test(name) || RESERVED_NAMES.test(name)) {
		throw new ValidationError(`Invalid \`filename\` value. Provided: '${name}'`)
	}

	return name
}

/**
 * Validates a path-like option value, rejecting empty strings and null bytes.
 * Problems like missing files or permissions surface later as `ParsingError`s
 * when the path is used. Returns the value unchanged.
 */
function validatePath(value: string, optionName: string): string {
	if (value.trim() === '') {
		throw new ValidationError(`The \`${optionName}\` option must be a non-empty string.`)
	}

	if (value.includes('\0')) {
		throw new ValidationError(`The \`${optionName}\` option contains a null byte.`)
	}

	return value
}

/**
 * Validates that a path-like option value points to a file with the expected
 * extension. Returns the value unchanged.
 */
export function validateFileExtension(
	value: string,
	extension: string,
	optionName: string,
): string {
	validatePath(value, optionName)

	if (value.split('.').at(-1) !== extension) {
		throw new ValidationError(
			`Invalid \`${optionName}\` file provided: '${value}'. Expected \`*.${extension}\` file.`,
		)
	}

	return value
}

/**
 * Validates a millisecond option value, requiring a non-negative number.
 * Returns the value unchanged.
 */
export function validateMilliseconds(value: number, optionName: string): number {
	if (Number.isNaN(value) || value < 0) {
		throw new ValidationError(
			`Invalid \`${optionName}\` value provided. It must be a non-negative number of milliseconds.`,
		)
	}

	return value
}
