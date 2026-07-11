import type { Page, PaperFormat, PDFMargin, PuppeteerLifeCycleEvent } from 'puppeteer'

/** A parsed page entry in the generated table of contents. */
export type Contents = {
	children?: Array<Omit<Contents, 'children'>>
	heading: string
	url: string
}

/** Fully resolved options controlling crawling and PDF generation. */
export type StarlightToPdfOptions = {
	browserExecutable: string | undefined
	contents: boolean
	contentsLinks: 'external' | 'internal'
	contentsName: string | undefined
	cssPageSize: boolean
	exclude: Set<string> | undefined
	filename: string | undefined
	followingHtml: string | undefined
	footer: string | undefined
	format: PaperFormat
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
	options: StarlightToPdfOptions
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
