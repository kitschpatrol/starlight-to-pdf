import type { PuppeteerLifeCycleEvent } from 'puppeteer'

/** CSS class names injected into the assembled document. */
export const CLASSNAMES = {
	contents: 's2pdf-contents',
	heading: 's2pdf-heading',
	mainContainer: 's2pdf-container',
	pageBreak: 's2pdf-pagebreak',
	starlight: {
		markdownContent: 'sl-markdown-content',
	},
} as const

/** CSS selectors for the Starlight page elements the crawler relies on. */
export const SELECTORS = {
	heading: '*:has(> h1#_top)',
	mainInfo: `.${CLASSNAMES.starlight.markdownContent}`,
	nextLink: "a[rel='next']",
	sidebarLink: 'nav.sidebar a[href]',
	starlightPrintStyles: 'link[media="print"]',
	subheading: `.${CLASSNAMES.starlight.markdownContent} h2`,
	topicLink: 'nav.sidebar .starlight-sidebar-topics a[href]',
	topicsList: '.starlight-sidebar-topics',
} as const

/** Paper formats accepted by Puppeteer, as shown in help output. */
export const BASE_PAPER_FORMATS = [
	'LETTER',
	'LEGAL',
	'TABLOID',
	'LEDGER',
	'A0',
	'A1',
	'A2',
	'A3',
	'A4',
	'A5',
	'A6',
	'Letter',
	'Legal',
	'Tabloid',
	'Ledger',
] as const

/** All accepted paper format spellings, including lowercase variants. */
export const PAPER_FORMATS = new Set<string>([
	...BASE_PAPER_FORMATS,
	...BASE_PAPER_FORMATS.map((format) => format.toLowerCase()),
])

/** Default margins for the generated PDF, top right bottom left. */
export const DEFAULT_MARGINS = '1cm 1cm 1cm 1.5cm'

/** Default delay between viewport scrolls while waiting for lazy-loaded content. */
export const SCROLL_DELAY_MS = 100

/** Default timeout for page actions and the Puppeteer protocol. */
export const TIMEOUT_MS = 180_000 // 3 minutes

/** Page load lifecycle events accepted by the `--page-wait-until` flag. */
export const WAIT_UNTIL_OPTIONS = [
	'load',
	'domcontentloaded',
	'networkidle0',
	'networkidle2',
] as const satisfies readonly PuppeteerLifeCycleEvent[]
