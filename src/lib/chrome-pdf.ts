const XREF_HEADER_REGEX = /^xref\s+0 (?<count>\d+)\s+/v
const XREF_ENTRY_REGEX = /^(?<offset>\d{10}) \d{5} (?<type>[fn])(?: \r| \n|\r\n)$/v
const TRAILER_REGEX = /^trailer\s*<<(?<body>[\s\S]*?)>>\s*startxref/v
const STARTXREF_REGEX = /startxref\s+(?<offset>\d+)\s+%%EOF\s*$/v
const ROOT_REGEX = /\/Root (?<number>\d+) 0 R/v
const DESTS_REGEX = /\/Dests (?<number>\d+) 0 R/v
const PAGES_REGEX = /\/Pages (?<number>\d+) 0 R/v
const PAGE_TREE_NODE_REGEX = /\/Type \/Pages(?![A-Za-z])/v
const KIDS_REGEX = /\/Kids \[(?<kids>[^\[\]]*)\]/v
const REFERENCE_REGEX = /(?<number>\d+) 0 R/gv
const NAMED_DESTINATION_REGEX =
	/\/(?<name>[^\s\/\[\]<>\(\)\{\}%]+)\s*(?<destination>\[[^\[\]]*\])/gv
const NAME_ESCAPE_REGEX = /#(?<hex>[\dA-F]{2})/giv

/** Size of each entry in a PDF cross-reference table. */
const XREF_ENTRY_LENGTH = 20

/**
 * The structure of a PDF that Chrome wrote, which has a single cross-reference
 * table and no object streams, so the tool reads it without a PDF library.
 */
export type ChromePdf = {
	/** Byte offset of each object by object number, or -1 for free objects. */
	offsets: number[]
	/** The PDF with one character per byte, so string offsets are byte offsets. */
	text: string
	/** The content of the trailer dictionary. */
	trailerBody: string
	/** Byte offset of the cross-reference table. */
	xrefOffset: number
}

/**
 * Reads the byte offsets of the objects from the cross-reference table that
 * Chrome writes, a single section that starts at object 0. Free objects get
 * offset -1.
 */
function readXref(
	text: string,
	xrefOffset: number,
): undefined | { entriesEnd: number; offsets: number[] } {
	const header = XREF_HEADER_REGEX.exec(text.slice(xrefOffset, xrefOffset + 64))
	if (header?.groups?.count === undefined) {
		return undefined
	}

	const entriesStart = xrefOffset + header[0].length
	const offsets: number[] = []
	for (let number = 0; number < Number(header.groups.count); number++) {
		const start = entriesStart + number * XREF_ENTRY_LENGTH
		const entry = XREF_ENTRY_REGEX.exec(text.slice(start, start + XREF_ENTRY_LENGTH))
		if (entry?.groups?.offset === undefined) {
			return undefined
		}

		offsets.push(entry.groups.type === 'n' ? Number(entry.groups.offset) : -1)
	}

	return { entriesEnd: entriesStart + offsets.length * XREF_ENTRY_LENGTH, offsets }
}

/**
 * Reads the structure of a PDF that Chrome wrote. Returns undefined for a PDF
 * structured otherwise, such as one with an incremental update, whose earlier
 * cross-reference sections would need reading too.
 */
export function readChromePdf(pdf: Uint8Array): ChromePdf | undefined {
	const text = new TextDecoder('latin1').decode(pdf)

	const xrefOffset = Number(STARTXREF_REGEX.exec(text.slice(-64))?.groups?.offset)
	const xref = Number.isNaN(xrefOffset) ? undefined : readXref(text, xrefOffset)
	if (xref === undefined) {
		return undefined
	}

	const trailer = TRAILER_REGEX.exec(text.slice(text.indexOf('trailer', xref.entriesEnd)))
	const trailerBody = trailer?.groups?.body
	return trailerBody === undefined || trailerBody.includes('/Prev')
		? undefined
		: { offsets: xref.offsets, text, trailerBody, xrefOffset }
}

/** Returns the dictionary of an object without a stream. */
export function readDictionary(pdf: ChromePdf, number: number): string | undefined {
	const offset = pdf.offsets[number]
	if (offset === undefined || offset < 0) {
		return undefined
	}

	const end = pdf.text.indexOf('endobj', offset)
	const start = pdf.text.indexOf('<<', offset)
	const stop = pdf.text.lastIndexOf('>>', end)
	return end === -1 || start === -1 || start > stop ? undefined : pdf.text.slice(start, stop + 2)
}

function readCatalog(pdf: ChromePdf): string {
	const rootNumber = Number(ROOT_REGEX.exec(pdf.trailerBody)?.groups?.number)
	return readDictionary(pdf, rootNumber) ?? ''
}

/**
 * Reads the named destinations that the document catalog lists, mapping each
 * name, as written in the PDF, to its explicit destination, such as `[12 0 R
 * /XYZ 0 792 0]`.
 */
export function readNamedDestinations(pdf: ChromePdf): Map<string, string> {
	const destsNumber = Number(DESTS_REGEX.exec(readCatalog(pdf))?.groups?.number)
	const dests = readDictionary(pdf, destsNumber) ?? '<<>>'

	const destinations = new Map<string, string>()
	const entries = dests.slice(2, -2).matchAll(NAMED_DESTINATION_REGEX)
	for (const entry of entries) {
		const { destination, name } = entry.groups ?? {}
		if (name !== undefined && destination !== undefined) {
			destinations.set(name, destination)
		}
	}

	return destinations
}

/** Maps the object number of each page to its page number, starting at 1. */
export function readPageNumbers(pdf: ChromePdf): Map<number, number> {
	const pageNumbers = new Map<number, number>()
	// Depth first, so the pages come in the order of each node's kids
	const pending = [Number(PAGES_REGEX.exec(readCatalog(pdf))?.groups?.number)]
	let number = pending.pop()
	while (number !== undefined) {
		const node = readDictionary(pdf, number)
		if (node !== undefined && PAGE_TREE_NODE_REGEX.test(node)) {
			const kids = (KIDS_REGEX.exec(node)?.groups?.kids ?? '').matchAll(REFERENCE_REGEX)
			pending.push(...Array.from(kids, (kid) => Number(kid.groups?.number)).toReversed())
		} else if (node !== undefined) {
			pageNumbers.set(number, pageNumbers.size + 1)
		}

		number = pending.pop()
	}

	return pageNumbers
}

/** Decodes the `#` escapes of a PDF name, which encode the bytes of UTF-8. */
export function decodeName(name: string): string {
	const bytes = name.replaceAll(NAME_ESCAPE_REGEX, (_match, hex: string) =>
		String.fromCodePoint(Number.parseInt(hex, 16)),
	)
	return new TextDecoder().decode(Uint8Array.from(bytes, (byte) => byte.codePointAt(0) ?? 0))
}
