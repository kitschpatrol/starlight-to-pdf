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
	browserExecutable: string | undefined
	browserNoSandbox: boolean
	contents: boolean
	contentsLinks: 'external' | 'internal'
	contentsName: string | undefined
	cssPageSize: boolean
	dynamicPageHeight: boolean
	exclude: Set<string> | undefined
	filename: string | undefined
	followingHtml: string | undefined
	footer: string | undefined
	format: (typeof PAPER_FORMATS)[number]
	header: string | undefined
	last: string | undefined
	margins: PDFMargin
	paddings: string | undefined
	pageWaitUntil: PuppeteerLifeCycleEvent
	path: string | undefined
	pdfOutline: boolean
	precedingHtml: string | undefined
	printBg: boolean
	scrollDelay: number
	starlightPrintCss: boolean
	styles: string | undefined
	timeout: number
	url: URL
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
export type GetAllContentReturn = Pick<GetAllContentParams, 'contentsData' | 'htmlContent'>
