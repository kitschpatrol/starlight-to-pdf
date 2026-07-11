import type { Contents, GetAllContentReturn, ResolvedOptions } from './types'
import { CLASSNAMES } from './constants'
import getFileContent from './get-file-content'
import { log } from './log'

function composeListElement(contentData: Contents[]): string {
	let contentsHtml = ''

	for (const value of contentData) {
		contentsHtml += `<li><a href="${value.url}">${value.heading}</a>`
		if (value.children) {
			contentsHtml += composeListElement(value.children)
		}

		contentsHtml += `</li>`
	}

	return `<ul ${CLASSNAMES.contents}>${contentsHtml}</ul>`
}

function createContents(contentData: Contents[], options: ResolvedOptions): string {
	const list = composeListElement(contentData)
	const defaultContentsName = 'Contents'
	const contentsName = options.contentsName ?? defaultContentsName

	log.info(
		`Created table of contents.${
			contentsName === defaultContentsName ? '' : ` User defined name: \`${contentsName}\``
		}`,
	)

	return `<div class="${CLASSNAMES.starlight.markdownContent} ${CLASSNAMES.contents} ${CLASSNAMES.pageBreak}">
						<h2>${contentsName}</h2>
						${list}
					</div>`
}

type ComposeBodyParams = GetAllContentReturn & {
	baseOrigin: string
	options: ResolvedOptions
}

/**
 * Assembles the final HTML body from the parsed pages, table of contents, and
 * user-provided styles and surrounding HTML fragments.
 */
export async function composeBody({
	baseOrigin,
	contentsData,
	htmlContent,
	options,
}: ComposeBodyParams): Promise<string> {
	const contents = options.contents ? createContents([...contentsData], options) : ''

	const { followingHtml: followingRoute, paddings, precedingHtml: precedingRoute, styles } = options

	const pagePaddings = paddings === undefined ? '' : `@page { padding: ${paddings} }`
	const [userStyles, followingHtml, precedingHtml] = await Promise.all([
		styles === undefined ? '' : getFileContent(styles),
		followingRoute === undefined ? '' : getFileContent(followingRoute),
		precedingRoute === undefined ? '' : getFileContent(precedingRoute),
	])

	const body = `<base href="${baseOrigin}" />
								<style>
									aside,
									code,
									figure,
									pre {
										break-inside: avoid !important;
									}

									.${CLASSNAMES.pageBreak} {
										break-after: page;
									}

									${userStyles}
									${pagePaddings}
								</style>
								${precedingHtml}
								${contents}
								<div class=${CLASSNAMES.mainContainer}>${htmlContent}</div>
								${followingHtml}
							 `

	return body
}

/**
 * Replaces the page body with the assembled HTML. Runs in the browser context.
 */
export function injectBody(result: string, noPrintCss: boolean, selector: string) {
	const { body } = document
	body.innerHTML = result

	if (noPrintCss) {
		const printStyles = document.head.querySelector(selector)
		if (printStyles) {
			printStyles.remove()
		}
	}

	return body.innerHTML
}
