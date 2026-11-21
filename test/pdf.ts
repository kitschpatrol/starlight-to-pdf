import { runQpdf } from '../src/lib/qpdf'

/**
 * A value of a PDF object as qpdf writes it in JSON: names and references are
 * strings, such as `/Link` and `3 0 R`, and text strings start with `u:`.
 */
export type PdfValue =
	| boolean
	// eslint-disable-next-line ts/no-restricted-types -- JSON has null, as PDF does
	| null
	| number
	| PdfValue[]
	| string
	| { [key: string]: PdfValue }

export type PdfDictionary = Record<string, PdfValue>

export type PdfOutlineItem = {
	/** The number of the page that the item points to, counting from one. */
	destpageposfrom1: number
	kids: PdfOutlineItem[]
	title: string
}

type QpdfJson = {
	outlines: PdfOutlineItem[]
	pages: Array<{
		images: Array<{ filter: string[]; width: number }>
		object: string
	}>
	qpdf: [
		{ pdfversion: string },
		Record<string, { stream?: { data: string; dict: PdfDictionary }; value?: PdfValue }>,
	]
}

export type PdfDocument = {
	/** The dictionaries of the objects that aren't streams, by reference. */
	dictionaries: Map<string, PdfDictionary>
	/** The items of the outline, which all point to a page in PDFs from Chrome. */
	outline: PdfOutlineItem[]
	/** The pages in order, with the reference of each and the images it draws. */
	pages: QpdfJson['pages']
	/** The streams with their data in base64, inflated unless asked otherwise. */
	streams: Array<{ data: string; dictionary: PdfDictionary }>
	trailer: PdfDictionary
	version: string
}

function isDictionary(value: PdfValue | undefined): value is PdfDictionary {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads the objects, pages, and outline of a PDF with qpdf, which parses the
 * PDF on its own, whether or not it has object streams. Gives the data of
 * streams as the file stores it when asked not to decode it.
 */
export async function readPdf(pdf: Uint8Array, decodeStreams = true): Promise<PdfDocument> {
	const json = await runQpdf(pdf, [
		'--json=2',
		'--json-stream-data=inline',
		`--decode-level=${decodeStreams ? 'generalized' : 'none'}`,
	])

	const { outlines, pages, qpdf } = JSON.parse(new TextDecoder().decode(json)) as QpdfJson
	const [{ pdfversion }, objects] = qpdf

	const dictionaries = new Map<string, PdfDictionary>()
	const streams: PdfDocument['streams'] = []
	let trailer: PdfDictionary = {}
	for (const [key, { stream, value }] of Object.entries(objects)) {
		if (stream !== undefined) {
			streams.push({ data: stream.data, dictionary: stream.dict })
		} else if (key === 'trailer' && isDictionary(value)) {
			trailer = value
		} else if (isDictionary(value)) {
			dictionaries.set(key.replace('obj:', ''), value)
		}
	}

	return { dictionaries, outline: outlines, pages, streams, trailer, version: pdfversion }
}

/**
 * Reads a value as a dictionary, whether it is one or refers to one, as `3 0 R`
 * does.
 */
export function getDictionary(pdf: PdfDocument, value: PdfValue | undefined): PdfDictionary {
	const target = typeof value === 'string' ? pdf.dictionaries.get(value) : value
	if (!isDictionary(target)) {
		throw new TypeError(`Expected a dictionary or a reference to one: ${JSON.stringify(value)}`)
	}

	return target
}

/**
 * Writes a PDF of the bodies of its objects, numbered from one, the first of
 * which is the catalog, with a cross-reference table that is off by the given
 * bytes. Takes each character of the bodies as one byte.
 */
export function writePdf(objects: string[], xrefOffsetError = 0): Uint8Array {
	let pdf = '%PDF-1.4\n'
	const entries = objects.map((object, index) => {
		const entry = `${String(pdf.length).padStart(10, '0')} 00000 n \n`
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
		return entry
	})
	const size = objects.length + 1
	const xrefOffset = pdf.length + xrefOffsetError
	pdf += `xref\n0 ${size}\n0000000000 65535 f \n${entries.join('')}`
	pdf += `trailer\n<< /Root 1 0 R /Size ${size} >>\nstartxref\n${xrefOffset}\n%%EOF\n`
	return Buffer.from(pdf, 'latin1')
}
