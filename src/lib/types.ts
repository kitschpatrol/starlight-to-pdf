import type { Page, PDFMargin, PuppeteerLifeCycleEvent } from 'puppeteer'
import type { PAPER_FORMATS } from './constants'

/** A parsed page entry in the generated table of contents. */
export type Contents = {
	children?: Array<Omit<Contents, 'children'>>
	heading: string
	url: string
}

/**
 * Fully resolved options controlling crawling and PDF generation, produced from
 * the public `StarlightToPdfOptions` by `resolveOptions`.
 */
export type ResolvedOptions = {
	about: string | undefined
	author: string | undefined
	browserExecutable: string | undefined
	browserNoSandbox: boolean
	contact: string | undefined
	contents: boolean
	contentsLinks: 'external' | 'internal'
	contentsName: string | undefined
	cover: boolean
	cssPageSize: boolean
	date: string | undefined
	dynamicPageHeight: boolean
	exclude: Set<string> | undefined
	filename: string | undefined
	followingHtml: string | undefined
	footer: boolean
	format: (typeof PAPER_FORMATS)[number]
	header: boolean
	last: string | undefined
	margins: PDFMargin
	mediaLinks: boolean
	notice: string | undefined
	paddings: string | undefined
	pageWaitUntil: PuppeteerLifeCycleEvent
	path: string | undefined
	pdfOutline: boolean
	precedingHtml: string | undefined
	printBg: boolean
	revision: string | undefined
	scrollDelay: number
	starlightPrintCss: boolean
	styles: string | undefined
	subtitle: string | undefined
	timeout: number
	title: string | undefined
	url: URL
}

/**
 * Title and date of the document, from the options or defaulting to the site
 * title and today's date.
 */
export type DocumentInfo = {
	date: string
	title: string
}

/** Parameters for the recursive content crawler. */
export type GetAllContentParams = {
	contentsData: Set<Contents>
	htmlContent: string
	options: ResolvedOptions
	page: Page
	/**
	 * Predefined list of pages to parse instead of following `rel="next"`
	 * pagination links. Used for sites with the `starlight-sidebar-topics`
	 * plugin, where pagination does not cover all topics.
	 */
	urlQueue?: undefined | URL[]
}

/** Accumulated crawl results. */
export type GetAllContentReturn = Pick<GetAllContentParams, 'contentsData' | 'htmlContent'> & {
	/**
	 * Markup of the stylesheets of all parsed pages, deduplicated and in cascade
	 * order. Astro bundles CSS per page, so styles for components used only on
	 * some pages are missing from any single page.
	 */
	stylesheets: string[]
}
