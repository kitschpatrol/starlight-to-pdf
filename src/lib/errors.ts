type AdditionalInfo = {
	originalErrorMessage?: string
}

/** Error thrown when option values fail validation. */
export class ValidationError extends Error {
	additionalInfo: AdditionalInfo | undefined

	constructor(message: string, additionalInfo?: AdditionalInfo) {
		super(message)
		this.name = 'ValidationError'
		this.additionalInfo = additionalInfo
	}
}

/** Error thrown when crawling or PDF generation fails. */
export class ParsingError extends Error {
	additionalInfo: AdditionalInfo | undefined

	constructor(message: string, additionalInfo?: AdditionalInfo) {
		super(message)
		this.name = 'ParsingError'
		this.additionalInfo = additionalInfo
	}
}
