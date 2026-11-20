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

	return `<ul>${contentsHtml}</ul>`
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

type ComposeBodyParams = Omit<GetAllContentReturn, 'stylesheets'> & {
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
									pre,
									tr {
										break-inside: avoid !important;
									}

									/* Anchor links make Starlight headings inline, which voids their own break-after */
									.${CLASSNAMES.starlight.headingWrapper} {
										break-after: avoid;
									}

									.${CLASSNAMES.pageBreak} {
										break-after: page;
									}

									${userStyles}
									${pagePaddings}
								</style>
								${precedingHtml}
								${contents}
								<div class="${CLASSNAMES.mainContainer}">${htmlContent}</div>
								${followingHtml}
							 `

	return body
}

type InjectBodyParams = {
	body: string
	noPrintCss: boolean
	printStylesSelector: string
	stylesheets: string[]
	stylesheetSelector: string
}

/**
 * Replaces the page body with the assembled HTML and the head's stylesheets
 * with the stylesheets of all parsed pages, then waits for linked stylesheets
 * to load. Returns the URLs of stylesheets that failed to load. Runs in the
 * browser context.
 */
export async function injectBody({
	body,
	noPrintCss,
	printStylesSelector,
	stylesheets,
	stylesheetSelector,
}: InjectBodyParams): Promise<string[]> {
	for (const element of document.head.querySelectorAll(stylesheetSelector)) {
		element.remove()
	}

	document.head.insertAdjacentHTML('beforeend', stylesheets.join(''))
	// Unlike innerHTML, attaches the declarative shadow roots of the parsed pages
	document.body.setHTMLUnsafe(body)

	if (noPrintCss) {
		document.head.querySelector(printStylesSelector)?.remove()
	}

	// Browsers never fetch disabled, href-less, or non-CSS links, so those
	// never fire a load or error event
	const pendingLinks = [...document.querySelectorAll(stylesheetSelector)].filter(
		(element) =>
			element instanceof HTMLLinkElement &&
			element.sheet === null &&
			!element.disabled &&
			(element.getAttribute('href') ?? '') !== '' &&
			['', 'text/css'].includes(element.type.toLowerCase()),
	)
	const failedUrls = await Promise.all(
		pendingLinks.map(
			async (link) =>
				new Promise<string | undefined>((resolve) => {
					link.addEventListener('load', () => {
						resolve(undefined)
					})
					link.addEventListener('error', () => {
						resolve(link.getAttribute('href') ?? '')
					})
				}),
		),
	)

	return failedUrls.filter((url) => url !== undefined)
}
