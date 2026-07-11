import { readFile } from 'node:fs/promises'
import path from 'node:path'
import errorCatcher from './error-catcher'
import { ParsingError } from './errors'
import { log } from './log'

/**
 * Reads the content of a user-provided file, throwing a `ParsingError` with
 * context when the file cannot be read.
 */
async function getFileContent(route: string): Promise<string> {
	if (route === '') {
		throw new ParsingError('File reading failed: invalid filepath provided.')
	}

	const filePath = path.resolve(path.normalize(route))

	const [error, content] = await errorCatcher(readFile(filePath, 'utf8'))
	if (error) {
		throw new ParsingError(`Could not read the content from '${filePath}'.`, {
			originalErrorMessage: error.message,
		})
	}

	log.info(`Extracted content from ${filePath}`)

	return content
}

export default getFileContent
