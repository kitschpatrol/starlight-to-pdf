import type { Contents, DocumentInfo, GetAllContentReturn, ResolvedOptions } from './types'
import { CLASSNAMES, HEADINGS_SELECTOR, PAGE_TITLE_ATTRIBUTE } from './constants'
import getFileContent from './get-file-content'
import { log } from './log'

const PARAGRAPH_SEPARATOR_REGEX = /\n\s*\n/v

/** Escapes text for HTML content and quoted attribute values. */
function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
}

function hasText(text: string | undefined): text is string {
	return text !== undefined && text !== ''
}

/** Escapes the lines that have text and joins them with line breaks. */
function linesToHtml(lines: Array<string | undefined>): string {
	return lines
		.filter((line) => hasText(line))
		.map((line) => escapeHtml(line))
		.join('<br>')
}

/**
 * Converts plain text to HTML paragraphs. Blank lines separate paragraphs, and
 * line breaks within a paragraph are kept.
 */
function textToParagraphs(text: string): string {
	return text
		.replaceAll('\r\n', '\n')
		.trim()
		.split(PARAGRAPH_SEPARATOR_REGEX)
		.map((paragraph) => `<p>${linesToHtml(paragraph.split('\n'))}</p>`)
		.join('')
}

/** Joins the revision and date that have text into one line. */
function getRevisionAndDate(document: DocumentInfo, options: ResolvedOptions): string {
	return [options.revision, document.date].filter((text) => hasText(text)).join(' · ')
}

function createCover(document: DocumentInfo, options: ResolvedOptions): string {
	const subtitle = hasText(options.subtitle)
		? `<p class="${CLASSNAMES.cover}-subtitle">${escapeHtml(options.subtitle)}</p>`
		: ''

	return `<section class="${CLASSNAMES.cover} ${CLASSNAMES.pageBreak}">
						<div class="${CLASSNAMES.cover}-title">
							<h1>${escapeHtml(document.title)}</h1>
							${subtitle}
						</div>
						<p class="${CLASSNAMES.cover}-details">${linesToHtml([options.author, getRevisionAndDate(document, options)])}</p>
					</section>`
}

function createBackPage(document: DocumentInfo, options: ResolvedOptions): string {
	// Fine print goes last, at the bottom of the page
	const sections = [
		{ name: 'about', text: options.about },
		{ name: 'contact', text: options.contact },
		{ name: 'notice', text: options.notice },
	]
		.filter((section): section is { name: string; text: string } => hasText(section.text))
		.map(
			({ name, text }) =>
				`<div class="${CLASSNAMES.backPage}-${name}">${textToParagraphs(text)}</div>`,
		)
	if (sections.length === 0) {
		return ''
	}

	const revisionAndDate = getRevisionAndDate(document, options)

	return `<section class="${CLASSNAMES.backPage}">
						<p><strong>${escapeHtml(document.title)}</strong>${revisionAndDate === '' ? '' : `<br>${escapeHtml(revisionAndDate)}`}</p>
						${sections.join('')}
					</section>`
}

/**
 * Composes the nested list of the table of contents. With page numbers, each
 * entry gets an empty element that the page number fills in after a first
 * rendering of the PDF.
 */
function composeListElement(contentData: Contents[], withPageNumbers: boolean): string {
	let contentsHtml = ''
	const pageNumber = withPageNumbers ? `<span class="${CLASSNAMES.contentsPage}"></span>` : ''

	for (const value of contentData) {
		contentsHtml += `<li><a href="${escapeHtml(value.url)}"><span class="${CLASSNAMES.contentsTitle}">${escapeHtml(value.heading)}</span>${pageNumber}</a>`
		if (value.children) {
			contentsHtml += composeListElement(value.children, withPageNumbers)
		}

		contentsHtml += `</li>`
	}

	return `<ul>${contentsHtml}</ul>`
}

function createContents(contentData: Contents[], options: ResolvedOptions): string {
	// Page numbers come from the destinations of links within the PDF
	const list = composeListElement(contentData, options.contentsLinks === 'internal')
	const defaultContentsName = 'Contents'
	const contentsName = options.contentsName ?? defaultContentsName

	log.info(
		`Created table of contents.${
			contentsName === defaultContentsName ? '' : ` User defined name: \`${contentsName}\``
		}`,
	)

	return `<div class="${CLASSNAMES.starlight.markdownContent} ${CLASSNAMES.contents} ${CLASSNAMES.pageBreak}" ${PAGE_TITLE_ATTRIBUTE}="${escapeHtml(contentsName)}">
						<h1>${escapeHtml(contentsName)}</h1>
						${list}
					</div>`
}

type ComposeBodyParams = Omit<GetAllContentReturn, 'stylesheets'> & {
	baseOrigin: string
	document: DocumentInfo
	options: ResolvedOptions
}

/**
 * Assembles the final HTML body from the parsed pages, cover and back pages,
 * table of contents, and user-provided styles and surrounding HTML fragments.
 */
export async function composeBody({
	baseOrigin,
	contentsData,
	document,
	htmlContent,
	options,
}: ComposeBodyParams): Promise<string> {
	const cover = options.cover ? createCover(document, options) : ''
	const backPage = createBackPage(document, options)
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
									/* Lets the content span the page, as Starlight's print styles do for its page layout, which the document leaves out */
									.${CLASSNAMES.mainContainer} {
										--sl-content-width: 100%;
									}

									aside,
									code,
									figure,
									pre,
									tr {
										break-inside: avoid !important;
									}

									/* Applies without Starlight's print styles too. Anchor links make Starlight headings inline, which voids their own break-after, so their wrappers need it. */
									${HEADINGS_SELECTOR} {
										break-after: avoid;
									}

									/* The empty boxes of sources let Chrome break a page right before the image of a picture, apart from the heading above it */
									picture > source {
										display: none;
									}

									/* Stands in for the playback of media on paper */
									.${CLASSNAMES.media} {
										display: block;
										position: relative;
										anchor-scope: --s2pdf-video;
									}

									.${CLASSNAMES.media} > video {
										anchor-name: --s2pdf-video;
									}

									/* The spacing rules of Starlight skip links, so the content after the link of the media gets the gap it would have had */
									.${CLASSNAMES.starlight.markdownContent} .${CLASSNAMES.media}:not(:where(.not-content *)) {
										margin-bottom: var(--sl-content-gap-y, 1rem);
									}

									/* Centered on the video, which can be narrower than the link around it */
									.${CLASSNAMES.mediaBadge} {
										position: absolute;
										position-anchor: --s2pdf-video;
										top: anchor(center);
										left: anchor(center);
										translate: -50% -50%;
										width: clamp(1.5rem, calc(anchor-size(height) * 0.18), 4.5rem);
										aspect-ratio: 1;
									}

									.${CLASSNAMES.mediaLink} {
										display: block;
										margin: 0.5rem 0 var(--sl-content-gap-y, 1rem);
										font-size: var(--sl-text-sm);
										color: var(--sl-color-gray-3);
										overflow-wrap: anywhere;
										break-before: avoid;
									}

									/* Avoids lone words on the last line of text and evens out the lines of wrapped headings, unless the site sets otherwise */
									:where(p, li, dd, figcaption, blockquote) {
										text-wrap: pretty;
									}

									:where(${HEADINGS_SELECTOR}) {
										text-wrap: balance;
									}

									.${CLASSNAMES.pageBreak} {
										break-after: page;
									}

									/* Sets page titles apart from their content, as the panels of the site do */
									.${CLASSNAMES.heading},
									.${CLASSNAMES.contents} > h1 {
										margin-bottom: 1.5rem;
									}

									/* Each page title starts a page, which its margins already offset */
									.${CLASSNAMES.heading} > h1 {
										margin-top: 0;
									}

									.${CLASSNAMES.contents} ul {
										padding-inline-start: 0;
										list-style: none;
									}

									.${CLASSNAMES.contents} ul ul {
										padding-inline-start: 1.25em;
									}

									.${CLASSNAMES.contents} li {
										margin: 0;
									}

									/* Up to two columns, as many as fit at a comfortable width */
									.${CLASSNAMES.contents} > ul {
										columns: 2 18em;
										column-gap: 4rem;
									}

									/* Keeps each page entry with its sections in one column */
									.${CLASSNAMES.contents} > ul > li {
										margin-top: 0.875em;
										font-weight: 600;
										color: var(--sl-color-white);
										break-inside: avoid;
									}

									/* Breaks drop the margin at the top of the other columns */
									.${CLASSNAMES.contents} > ul > li:first-child {
										margin-top: 0;
									}

									.${CLASSNAMES.contents} li li {
										margin-top: 0.25em;
										font-weight: normal;
										color: var(--sl-color-gray-2);
									}

									/* Page numbers line up at the end of the column, on the last line of their entry */
									.${CLASSNAMES.contents} a {
										display: flex;
										gap: 1em;
										align-items: flex-end;
										color: inherit;
										text-decoration: none;
									}

									.${CLASSNAMES.contentsTitle} {
										flex: 1;
									}

									/* A fixed width keeps the entries the same before and after the numbers fill in */
									.${CLASSNAMES.contentsPage} {
										flex: none;
										width: 3ch;
										text-align: end;
										font-variant-numeric: tabular-nums;
									}

									/* Keeps each page entry with the first of its sections */
									.${CLASSNAMES.contents} > ul > li > a {
										break-after: avoid;
									}

									.${CLASSNAMES.cover},
									.${CLASSNAMES.backPage} {
										display: flex;
										flex-direction: column;
										gap: 1.5rem;
										/* Fills the page area when printed, and grows onto more pages when its text takes more room */
										min-height: 100vh;
										line-height: 1.5;
										color: var(--sl-color-gray-2);
									}

									.${CLASSNAMES.cover} {
										justify-content: space-between;
									}

									/* A narrower measure for the large type of the generated cover, for better line breaks in long titles */
									:is(.${CLASSNAMES.cover}-title, .${CLASSNAMES.cover}-details) {
										max-width: 75%;
									}

									/* Sets the title two lines down from the top of the page area */
									.${CLASSNAMES.cover}-title {
										padding-top: 2lh;
									}

									/* A word longer than the measure runs into the space beside it rather than splitting */
									.${CLASSNAMES.cover}-title h1 {
										overflow-wrap: normal;
									}

									.${CLASSNAMES.backPage} {
										justify-content: flex-end;
										break-before: page;
										font-size: var(--sl-text-sm);
									}

									/* Keeps lines of the small print to a comfortable length */
									.${CLASSNAMES.backPage} > * {
										max-width: 36em;
									}

									:is(.${CLASSNAMES.cover}, .${CLASSNAMES.backPage}) p {
										margin: 0;
									}

									.${CLASSNAMES.backPage} p + p {
										margin-top: 0.75em;
									}

									.${CLASSNAMES.cover} h1 {
										margin: 0 0 0.25em;
										/* Larger than page titles, and smaller on narrow pages so words fit */
										font-size: min(var(--sl-text-6xl), 10vw);
										line-height: 1.1;
										color: var(--sl-color-white);
									}

									.${CLASSNAMES.cover}-subtitle {
										/* Smaller on narrow pages too, so it stays smaller than the title */
										font-size: min(var(--sl-text-2xl), 7.5vw);
									}

									/* Evens out the lines of long titles and subtitles, whatever wrapping the site gives headings and paragraphs */
									.${CLASSNAMES.cover}-title h1,
									.${CLASSNAMES.cover}-subtitle {
										text-wrap: balance;
									}

									.${CLASSNAMES.backPage} strong {
										color: var(--sl-color-white);
									}

									.${CLASSNAMES.backPage}-notice {
										color: var(--sl-color-gray-3);
									}

									${userStyles}
									${pagePaddings}
								</style>
								${cover}
								${precedingHtml}
								${contents}
								<div class="${CLASSNAMES.mainContainer}">${htmlContent}</div>
								${followingHtml}
								${backPage}
							 `

	return body
}

type InjectBodyParams = {
	body: string
	noPrintCss: boolean
	printStylesSelector: string
	stylesheets: string[]
	stylesheetSelector: string
	title: string
}

/**
 * Replaces the page body with the assembled HTML and the head's stylesheets
 * with the stylesheets of all parsed pages, sets the document title, which
 * becomes the PDF title, then waits for linked stylesheets to load. Returns the
 * URLs of stylesheets that failed to load. Runs in the browser context.
 */
export async function injectBody({
	body,
	noPrintCss,
	printStylesSelector,
	stylesheets,
	stylesheetSelector,
	title,
}: InjectBodyParams): Promise<string[]> {
	document.title = title

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
