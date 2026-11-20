const XREF_HEADER_REGEX = /^xref\s+0 (?<count>\d+)\s+/v
const XREF_ENTRY_REGEX = /^(?<offset>\d{10}) \d{5} (?<type>[fn])(?: \r| \n|\r\n)$/v
const TRAILER_REGEX = /^trailer\s*<<(?<body>[\s\S]*?)>>\s*startxref/v
const STARTXREF_REGEX = /startxref\s+(?<offset>\d+)\s+%%EOF\s*$/v
const ROOT_REGEX = /\/Root (?<number>\d+) 0 R/v
const DESTS_REGEX = /\/Dests (?<number>\d+) 0 R/v
const NAMED_DESTINATION_REGEX =
	/\/(?<name>[^\s\/\[\]<>\(\)\{\}%]+)\s*(?<destination>\[[^\[\]]*\])/gv
const LINK_DESTINATION_REGEX = /\/Dest \/(?<name>[^\s\/\[\]<>\(\)\{\}%]+)/v
const LINK_START_REGEX = /^\d+ 0 obj\s*<<\/Type \/Annot\s*\/Subtype \/Link\s/v
const ASCII_REGEX = /^[\0-\u{7F}]*$/v

/** Size of each entry in a PDF cross-reference table. */
const XREF_ENTRY_LENGTH = 20

type ResolveLinkDestinationsResult = {
	linkCount: number
	pdf: Uint8Array
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

/** Returns the dictionary of an object without a stream. */
function readDictionary(text: string, offset: number | undefined): string | undefined {
	if (offset === undefined || offset < 0) {
		return undefined
	}

	const end = text.indexOf('endobj', offset)
	const start = text.indexOf('<<', offset)
	const stop = text.lastIndexOf('>>', end)
	return end === -1 || start === -1 || start > stop ? undefined : text.slice(start, stop + 2)
}

/**
 * Reads the named destinations that the document catalog lists, mapping each
 * name to its explicit destination, such as `[12 0 R /XYZ 0 792 0]`.
 */
function readNamedDestinations(
	text: string,
	offsets: number[],
	trailerBody: string,
): Map<string, string> {
	const rootNumber = Number(ROOT_REGEX.exec(trailerBody)?.groups?.number)
	const catalog = readDictionary(text, offsets[rootNumber])
	const destsNumber = Number(DESTS_REGEX.exec(catalog ?? '')?.groups?.number)
	const dests = readDictionary(text, offsets[destsNumber]) ?? '<<>>'

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

/**
 * Returns the link annotations that point to a named destination, rewritten to
 * point to its explicit destination instead.
 */
function rewriteLinks(
	text: string,
	offsets: number[],
	destinations: Map<string, string>,
): Array<{ dictionary: string; number: number }> {
	const links: Array<{ dictionary: string; number: number }> = []
	for (const [number, offset] of offsets.entries()) {
		if (offset < 0 || !LINK_START_REGEX.test(text.slice(offset, offset + 64))) {
			continue
		}

		const dictionary = readDictionary(text, offset)
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
	{ trailerBody, xrefOffset }: { trailerBody: string; xrefOffset: number },
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
	const unchanged = { linkCount: 0, pdf }
	// One character per byte, so string offsets are byte offsets
	const text = new TextDecoder('latin1').decode(pdf)

	const xrefOffset = Number(STARTXREF_REGEX.exec(text.slice(-64))?.groups?.offset)
	const xref = Number.isNaN(xrefOffset) ? undefined : readXref(text, xrefOffset)
	if (xref === undefined) {
		return unchanged
	}

	const trailer = TRAILER_REGEX.exec(text.slice(text.indexOf('trailer', xref.entriesEnd)))
	const trailerBody = trailer?.groups?.body
	// A previous update would need its own cross-reference sections read too
	if (trailerBody === undefined || trailerBody.includes('/Prev')) {
		return unchanged
	}

	const destinations = readNamedDestinations(text, xref.offsets, trailerBody)
	const links = rewriteLinks(text, xref.offsets, destinations)
	if (links.length === 0) {
		return unchanged
	}

	return {
		linkCount: links.length,
		pdf: appendUpdate(pdf, links, { trailerBody, xrefOffset }),
	}
}
