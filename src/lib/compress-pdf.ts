import { runQpdf } from './qpdf'

/**
 * Compresses a PDF without changing anything it shows: qpdf deflates its Flate
 * streams again at the highest level and writes it with object streams, which
 * pack the many small objects of the structure tree, the outline, and the
 * links. Keeps tags, the outline, links, and Chrome's metadata, and gives the
 * same bytes for the same PDF. Throws when qpdf can't read the data as a PDF.
 */
async function compressPdf(pdf: Uint8Array): Promise<Uint8Array> {
	return runQpdf(pdf, [
		'--object-streams=generate',
		'--recompress-flate',
		'--compression-level=9',
		'--deterministic-id',
	])
}

export default compressPdf
