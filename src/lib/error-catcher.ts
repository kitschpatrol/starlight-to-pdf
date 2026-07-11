/**
 * Awaits a promise and returns an `[error, result]` tuple instead of throwing.
 */
async function errorCatcher<T>(promise: Promise<T>): Promise<[Error] | [undefined, T]> {
	try {
		const result = await promise
		return [undefined, result]
	} catch (error) {
		return [error instanceof Error ? error : new Error(String(error))]
	}
}

export default errorCatcher
