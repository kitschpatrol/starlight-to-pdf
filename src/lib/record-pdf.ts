import type { Page, PDFOptions } from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedOptions } from './types'
import compressPdf from './compress-pdf'
import { fillContentsPageNumbers } from './contents-page-numbers'
import errorCatcher from './error-catcher'
import { ParsingError } from './errors'
import { log } from './log'
import { resolveLinkDestinations } from './resolve-link-destinations'

function formatKilobytes(bytes: number): string {
	return `${Math.round(bytes / 1000).toLocaleString('en-US')} kB`
}

/**
 * Compresses the PDF without loss, keeping it as Chrome printed it when
 * compression fails or doesn't make it smaller, since that PDF is complete.
 */
async function compress(pdf: Uint8Array, pdfPath: string): Promise<Uint8Array> {
	log.info('Compressing the PDF.')
	const [error, compressed] = await errorCatcher(compressPdf(pdf))
	if (error) {
		log.warn(
			`Couldn't compress the PDF file ${pdfPath}, so it's saved as Chrome printed it: ${error.message}`,
		)
		return pdf
	}

	if (compressed.length >= pdf.length) {
		log.info(`Compression didn't make the PDF smaller, so it's saved as it is.`)
		return pdf
	}

	const savedPercent = Math.round((1 - compressed.length / pdf.length) * 100)
	log.info(
		`Compressed the PDF from ${formatKilobytes(pdf.length)} to ${formatKilobytes(compressed.length)}, ${savedPercent}% smaller.`,
	)
	return compressed
}

/** Renders the page to a PDF in memory, failing with the path it was meant for. */
async function renderPdf(page: Page, pdfOptions: PDFOptions, pdfPath: string): Promise<Uint8Array> {
	const [error, pdf] = await errorCatcher(page.pdf(pdfOptions))
	if (error) {
		throw new ParsingError(`PDF generation failed. Target file: ${pdfPath}.`, {
			originalErrorMessage: error.message,
		})
	}

	return pdf
}

type RecordPdfParams = {
	hostname: string
	options: ResolvedOptions
	page: Page
}

/**
 * Renders the current page to a PDF file at the configured location and returns
 * the absolute path of the written file.
 */
async function recordPdf({ hostname, options, page }: RecordPdfParams): Promise<string> {
	log.info('Generating PDF. Please wait.')

	const filename = `${options.filename ?? hostname}.pdf`
	const directoryPath = path.resolve(path.normalize(options.path ?? './'))
	const pdfPath = path.resolve(directoryPath, filename)

	const [mkdirError, createdPath] = await errorCatcher(mkdir(directoryPath, { recursive: true }))
	if (mkdirError) {
		throw new ParsingError(
			`Couldn't create the PDF target directory: ${directoryPath}. The program aborts.`,
			{ originalErrorMessage: mkdirError.message },
		)
	}

	if (createdPath !== undefined) {
		log.info(`Created the PDF target directory: ${directoryPath}`)
	}

	const pdfOptions: PDFOptions = {
		format: options.format,
		margin: options.margins,
		outline: options.pdfOutline,
		preferCSSPageSize: options.cssPageSize || options.dynamicPageHeight,
		printBackground: options.printBg,
		timeout: options.timeout,
	}

	let chromePdf = await renderPdf(page, pdfOptions, pdfPath)

	// CSS can't number the pages of link targets in Chrome, so the first
	// rendering tells which page each entry of the table of contents starts on
	const pageNumberCount = await fillContentsPageNumbers(page, chromePdf)
	if (pageNumberCount > 0) {
		log.info(`Numbered ${pageNumberCount} entries of the table of contents. Rendering again.`)
		chromePdf = await renderPdf(page, pdfOptions, pdfPath)
	}

	// Reads the single cross-reference table that Chrome writes, so it runs
	// before compression, which writes object streams instead
	const { linkCount, pdf: linkedPdf } = resolveLinkDestinations(chromePdf)
	if (linkCount > 0) {
		log.info(`Pointed ${linkCount} internal link(s) straight at their page.`)
	}

	const pdf = await compress(linkedPdf, pdfPath)

	const [writeError] = await errorCatcher(writeFile(pdfPath, pdf))
	if (writeError) {
		throw new ParsingError(`Couldn't write the PDF file: ${pdfPath}. The program aborts.`, {
			originalErrorMessage: writeError.message,
		})
	}

	log.info(`PDF file was generated and saved to ${pdfPath}`)

	return pdfPath
}

export default recordPdf
