import type { ChromePdf } from './chrome-pdf'
import { readChromePdf, readDictionary, readNamedDestinations } from './chrome-pdf'

const LINK_DESTINATION_REGEX = /\/Dest \/(?<name>[^\s\/\[\]<>\(\)\{\}%]+)/v
const LINK_START_REGEX = /^\d+ 0 obj\s*<<\/Type \/Annot\s*\/Subtype \/Link\s/v
const ASCII_REGEX = /^[\0-\u{7F}]*$/v

type ResolveLinkDestinationsResult = {
	linkCount: number
	pdf: Uint8Array
}

/**
 * Returns the link annotations that point to a named destination, rewritten to
 * point to its explicit destination instead.
 */
function rewriteLinks(pdf: ChromePdf): Array<{ dictionary: string; number: number }> {
	const destinations = readNamedDestinations(pdf)
	const links: Array<{ dictionary: string; number: number }> = []
	for (const [number, offset] of pdf.offsets.entries()) {
		if (offset < 0 || !LINK_START_REGEX.test(pdf.text.slice(offset, offset + 64))) {
			continue
		}

		const dictionary = readDictionary(pdf, number)
		const name = LINK_DESTINATION_REGEX.exec(dictionary ?? '')?.groups?.name
		const destination = name === undefined ? undefined : destinations.get(name)
		if (dictionary === undefined || destination === undefined || !ASCII_REGEX.test(dictionary)) {
			continue
		}

		links.push({
			dictionary: dictionary.replace(`/Dest /${name}`, () => `/Dest ${destination}`),
			number,
		})
	}

	return links
}

/**
 * Appends new versions of objects to a PDF as an incremental update, with a
 * cross-reference section and a trailer that points to the previous one.
 */
function appendUpdate(
	pdf: Uint8Array,
	objects: Array<{ dictionary: string; number: number }>,
	{ trailerBody, xrefOffset }: ChromePdf,
): Uint8Array {
	let update = '\n'
	const xrefLines: string[] = []
	for (const { dictionary, number } of objects) {
		const offset = pdf.length + update.length
		// Each entry takes 20 bytes, including the space before its line break
		xrefLines.push(`${number} 1`, `${String(offset).padStart(10, '0')} 00000 n `)
		update += [`${number} 0 obj`, dictionary, 'endobj', ''].join('\n')
	}

	const updateXrefOffset = pdf.length + update.length
	update += [
		'xref',
		...xrefLines,
		'trailer',
		`<<${trailerBody.trim()} /Prev ${xrefOffset}>>`,
		'startxref',
		String(updateXrefOffset),
		'%%EOF',
		'',
	].join('\n')

	const updateBytes = new TextEncoder().encode(update)
	const result = new Uint8Array(pdf.length + updateBytes.length)
	result.set(pdf)
	result.set(updateBytes, pdf.length)
	return result
}

/**
 * Points the internal links of a PDF that Chrome wrote straight at their page.
 * Chrome links to named destinations that the document catalog lists, and PDF
 * tools such as compressors can drop that list, which leaves the links without
 * a target. Appends the changed links as an incremental update, so the original
 * bytes stay intact. Returns the PDF unchanged when it has no named
 * destinations or isn't structured the way Chrome writes PDFs.
 */
export function resolveLinkDestinations(pdf: Uint8Array): ResolveLinkDestinationsResult {
	const chromePdf = readChromePdf(pdf)
	const links = chromePdf === undefined ? [] : rewriteLinks(chromePdf)
	return chromePdf === undefined || links.length === 0
		? { linkCount: 0, pdf }
		: { linkCount: links.length, pdf: appendUpdate(pdf, links, chromePdf) }
}
