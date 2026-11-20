import type { PaperFormat, PuppeteerLifeCycleEvent } from 'puppeteer'

/** CSS class names injected into the assembled document. */
export const CLASSNAMES = {
	backPage: 's2pdf-back-page',
	contents: 's2pdf-contents',
	cover: 's2pdf-cover',
	heading: 's2pdf-heading',
	mainContainer: 's2pdf-container',
	pageBreak: 's2pdf-pagebreak',
	starlight: {
		headingWrapper: 'sl-heading-wrapper',
		markdownContent: 'sl-markdown-content',
	},
	wordWrapTable: 's2pdf-word-wrap',
} as const

/**
 * Attribute holding the title of a docs page or the table of contents, which
 * the running header shows on the pages of that content.
 */
export const PAGE_TITLE_ATTRIBUTE = 'data-s2pdf-title'

/** CSS selectors for the Starlight page elements the crawler relies on. */
export const SELECTORS = {
	heading: '*:has(> h1#_top)',
	mainInfo: `.${CLASSNAMES.starlight.markdownContent}`,
	nextLink: "a[rel='next']",
	sidebarLink: 'nav.sidebar a[href]',
	siteName: 'meta[property="og:site_name"]',
	starlightPrintStyles: 'link[media="print"]',
	stylesheet: 'link[rel~="stylesheet"], style',
	subheading: `.${CLASSNAMES.starlight.markdownContent} h2`,
	topicLink: 'nav.sidebar .starlight-sidebar-topics a[href]',
	topicsList: '.starlight-sidebar-topics',
} as const

/** Paper formats accepted by the `format` option. */
export const PAPER_FORMATS = [
	'a0',
	'a1',
	'a2',
	'a3',
	'a4',
	'a5',
	'a6',
	'ledger',
	'legal',
	'letter',
	'tabloid',
] as const satisfies readonly PaperFormat[]

/** Default margins for the generated PDF, top right bottom left. */
export const DEFAULT_MARGINS = '1cm 1cm 1cm 1.5cm'

/** Default delay between viewport scrolls while waiting for lazy-loaded content. */
export const SCROLL_DELAY_MS = 100

/** Default timeout for page actions and the Puppeteer protocol. */
export const TIMEOUT_MS = 180_000 // 3 minutes

/** Page load lifecycle events accepted by the `pageWaitUntil` option. */
export const WAIT_UNTIL_OPTIONS = [
	'load',
	'domcontentloaded',
	'networkidle0',
	'networkidle2',
] as const satisfies readonly PuppeteerLifeCycleEvent[]
