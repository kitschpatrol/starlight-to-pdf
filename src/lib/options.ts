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
	 * Adds a back page with this text, such as a description of the project.
	 * Blank lines separate paragraphs.
	 */
	about?: string | undefined
	/** Author shown on the cover page, such as a person or an organization. */
	author?: string | undefined
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
	/**
	 * Adds a back page with these contact details. Blank lines separate
	 * paragraphs, and line breaks are kept.
	 */
	contact?: string | undefined
	/** Generate a table of contents with page numbers in the PDF. */
	contents?: boolean | undefined
	/**
	 * The type of links in the generated table of contents: `'internal'` for
	 * links that navigate within the PDF file or `'external'` for links that
	 * point to the documentation website, which leaves out the page numbers.
	 */
	contentsLinks?: 'external' | 'internal' | undefined
	/** Customizes the generated table of contents name in the PDF. */
	contentsName?: string | undefined
	/**
	 * Adds a cover page with the title, subtitle, author, revision, and date.
	 */
	cover?: boolean | undefined
	/**
	 * Allows setting the PDF page size using CSS `@page`. If the predefined sizes
	 * in the `format` option don't meet your needs, enable this option and
	 * specify the desired page size in custom CSS provided via `styles` (e.g.,
	 * `@page { size: 8.5in 14in; }`).
	 */
	cssPageSize?: boolean | undefined
	/**
	 * Date shown on the cover and back pages and in the footer. Defaults to
	 * today's date, formatted for the language of the site. Pass an empty string
	 * to leave it out.
	 */
	date?: string | undefined
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
	 * Adds a footer with the title, date, and page numbers to every page except
	 * the cover and back pages. Needs bottom margins to print in.
	 */
	footer?: boolean | undefined
	/**
	 * The paper format for the PDF file. Refer to Puppeteer's paper formats for
	 * more details.
	 */
	format?: (typeof PAPER_FORMATS)[number] | undefined
	/**
	 * Adds a header with the title of the current docs page to every page except
	 * the cover and back pages. Needs top margins to print in.
	 */
	header?: boolean | undefined
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
	 * Links videos, audio, and embedded YouTube and Vimeo players, which can't
	 * play on paper, to their section on the website, and shows a play badge on
	 * each video. Links use the canonical URL of the page, so they point to the
	 * published site even when crawling a local server.
	 */
	mediaLinks?: boolean | undefined
	/**
	 * Adds a back page with this notice, such as a confidentiality or copyright
	 * notice. Blank lines separate paragraphs.
	 */
	notice?: string | undefined
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
	 * Adds an outline of the headings to the PDF file, which PDF viewers show as
	 * bookmarks in a sidebar. It's the `outline` property of Puppeteer's
	 * `PDFOptions`.
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
	 * Revision shown on the cover and back pages, such as `Version 1.2.0`.
	 */
	revision?: string | undefined
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
	/** Subtitle shown on the cover page. */
	subtitle?: string | undefined
	/**
	 * Timeout for both the page actions and `protocolTimeout` in milliseconds.
	 * You may need to increase this value for parsing large websites.
	 */
	timeout?: number | undefined
	/**
	 * Title of the document, shown on the cover and back pages and in the footer,
	 * and stored as the PDF title. Defaults to the title of the site.
	 */
	title?: string | undefined
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
	cover: false,
	cssPageSize: false,
	dynamicPageHeight: false,
	footer: false,
	format: 'letter',
	header: false,
	margins: DEFAULT_MARGINS,
	mediaLinks: true,
	pageWaitUntil: 'domcontentloaded',
	pdfOutline: true,
	printBg: false,
	scrollDelay: SCROLL_DELAY_MS,
	starlightPrintCss: true,
	timeout: TIMEOUT_MS,
} as const satisfies Partial<StarlightToPdfOptions>

function mapDefined<T, R>(value: T | undefined, transform: (value: T) => R): R | undefined {
	return value === undefined ? undefined : transform(value)
}

/**
 * Resolves the options of the cover and back pages and the running header and
 * footer.
 */
function resolveDocumentOptions(
	options: StarlightToPdfOptions,
): Pick<
	ResolvedOptions,
	| 'about'
	| 'author'
	| 'contact'
	| 'cover'
	| 'date'
	| 'footer'
	| 'header'
	| 'notice'
	| 'revision'
	| 'subtitle'
	| 'title'
> {
	const defaults = DEFAULT_STARLIGHT_TO_PDF_OPTIONS

	return {
		about: options.about,
		author: options.author,
		contact: options.contact,
		cover: options.cover ?? defaults.cover,
		date: options.date,
		footer: options.footer ?? defaults.footer,
		header: options.header ?? defaults.header,
		notice: options.notice,
		revision: options.revision,
		subtitle: options.subtitle,
		title: options.title,
	}
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
		...resolveDocumentOptions(options),
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
		format: options.format ?? defaults.format,
		last: mapDefined(options.last, (value) => resolveLastUrl(value, url.origin)),
		margins: typeof margins === 'string' ? parseMargins(margins) : margins,
		mediaLinks: options.mediaLinks ?? defaults.mediaLinks,
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
