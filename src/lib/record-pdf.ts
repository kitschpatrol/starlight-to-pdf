import type { Page, PDFOptions } from 'puppeteer'
import { log } from 'lognow'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { StarlightToPdfOptions } from './types'
import errorCatcher from './error-catcher'
import { ParsingError } from './errors'
import getFileContent from './get-file-content'

type RecordPdfParams = {
	hostname: string
	options: StarlightToPdfOptions
	page: Page
}

/**
 * Renders the current page to a PDF file at the configured location.
 */
async function recordPdf({ hostname, options, page }: RecordPdfParams): Promise<PDFOptions> {
	log.info('Generating PDF. Please wait.')

	const filename = `${options.filename ?? hostname}.pdf`
	const directoryPath = path.resolve(path.normalize(options.path ?? './'))

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
		displayHeaderFooter: options.header !== undefined || options.footer !== undefined,
		format: options.format,
		margin: options.margins,
		outline: options.pdfOutline,
		path: path.resolve(directoryPath, filename),
		preferCSSPageSize: options.cssPageSize,
		printBackground: options.printBg,
		timeout: options.timeout,
	}

	if (options.header !== undefined) {
		pdfOptions.headerTemplate = await getFileContent(options.header)
	}

	if (options.footer !== undefined) {
		pdfOptions.footerTemplate = await getFileContent(options.footer)
	}

	const [error] = await errorCatcher(page.pdf(pdfOptions))

	if (error) {
		throw new ParsingError(`PDF generation failed. Target directory: ${pdfOptions.path ?? ''}.`, {
			originalErrorMessage: error.message,
		})
	}

	log.info(`PDF file was generated and saved to ${pdfOptions.path ?? ''}`)

	return pdfOptions
}

export default recordPdf
