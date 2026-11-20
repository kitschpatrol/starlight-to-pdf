import type { Page } from 'puppeteer'
import { decodeName, readChromePdf, readNamedDestinations, readPageNumbers } from './chrome-pdf'
import { CLASSNAMES } from './constants'

const DESTINATION_PAGE_REGEX = /^\[(?<number>\d+) 0 R/v

/** Decodes the percent-encoding of a link fragment, keeping malformed ones. */
function decodeFragment(fragment: string): string {
	try {
		return decodeURIComponent(fragment)
	} catch {
		return fragment
	}
}

/**
 * Reads the page that each link target of a PDF that Chrome wrote starts on,
 * keyed by the decoded fragment of the links that point to it.
 */
export function readTargetPages(pdf: Uint8Array): Map<string, number> {
	const targetPages = new Map<string, number>()
	const chromePdf = readChromePdf(pdf)
	if (chromePdf === undefined) {
		return targetPages
	}

	const pageNumbers = readPageNumbers(chromePdf)
	for (const [name, destination] of readNamedDestinations(chromePdf)) {
		const pageObject = Number(DESTINATION_PAGE_REGEX.exec(destination)?.groups?.number)
		const pageNumber = pageNumbers.get(pageObject)
		if (pageNumber !== undefined) {
			targetPages.set(decodeFragment(decodeName(name)), pageNumber)
		}
	}

	return targetPages
}

/**
 * Writes the page numbers into the entries of the table of contents and returns
 * how many it wrote. Runs in the browser context.
 */
function writePageNumbers(
	targetPages: Array<[string, number]>,
	classnames: { contents: string; contentsPage: string },
): number {
	const pages = new Map(targetPages)
	let writtenCount = 0
	for (const link of document.querySelectorAll(`.${classnames.contents} a[href^="#"]`)) {
		const pageNumber = link.querySelector(`.${classnames.contentsPage}`)
		let fragment = link.getAttribute('href')?.slice(1) ?? ''
		try {
			fragment = decodeURIComponent(fragment)
		} catch {
			// Malformed percent-encoding stays as written
		}

		const page = pages.get(fragment)
		if (pageNumber === null || page === undefined) {
			continue
		}

		pageNumber.textContent = String(page)
		writtenCount += 1
	}

	return writtenCount
}

/**
 * Fills in the page numbers of the table of contents from a rendering of the
 * PDF and returns how many entries got a number. The entries reserve the space
 * of their numbers, so filling them in moves nothing to another page.
 */
export async function fillContentsPageNumbers(page: Page, pdf: Uint8Array): Promise<number> {
	const targetPages = [...readTargetPages(pdf)]
	return targetPages.length === 0 ? 0 : page.evaluate(writePageNumbers, targetPages, CLASSNAMES)
}
