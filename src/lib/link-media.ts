import type { Page } from 'puppeteer'
import { CLASSNAMES, SELECTORS } from './constants'
import { log } from './log'

/**
 * Links the media in the content that can't play on paper to their section on
 * the website, and returns how many it linked: videos, audio, and embedded
 * YouTube and Vimeo players. Each gets a caption with the link, and each video
 * also becomes a link itself, with a play badge over it, and keeps its current
 * frame as its poster. Runs in the browser context.
 */
function markMedia(
	contentSelector: string,
	classnames: { media: string; mediaBadge: string; mediaLink: string },
): number {
	const content = document.querySelector(contentSelector)
	if (content === null) {
		return 0
	}

	// Unlike the crawled URL, the canonical URL points to the published site
	const pageUrl = new URL(
		document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ??
			document.querySelector('meta[property="og:url"]')?.getAttribute('content') ??
			location.href,
		location.href,
	)
	pageUrl.hash = ''

	const headingSelector = 'h2[id], h3[id], h4[id], h5[id], h6[id]'
	const mediaSelector =
		'video, audio, iframe[src*="youtube.com/embed/"], iframe[src*="youtube-nocookie.com/embed/"], iframe[src*="player.vimeo.com/video/"]'
	// A circle with a triangle pointing right, centered on its centroid
	const badge = `<svg class="${classnames.mediaBadge}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="rgb(0 0 0 / 55%)"/><path d="M22.7 16 L22.7 48 L50.5 32 Z" fill="#fff"/></svg>`

	// Returns the current frame of a video as an image URL. Frames of
	// cross-origin videos can't be read.

	const captureFrame = (video: HTMLVideoElement): string | undefined => {
		if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
			return undefined
		}

		const canvas = document.createElement('canvas')
		canvas.width = video.videoWidth
		canvas.height = video.videoHeight
		const context = canvas.getContext('2d')
		if (context === null) {
			return undefined
		}

		context.drawImage(video, 0, 0)
		try {
			return canvas.toDataURL('image/jpeg', 0.92)
		} catch {
			return undefined
		}
	}

	let linkedCount = 0
	// In document order, so the last heading seen names the section of the media
	let heading: Element | undefined
	for (const element of content.querySelectorAll(`${headingSelector}, ${mediaSelector}`)) {
		if (element.matches(headingSelector)) {
			heading = element
			continue
		}

		const url = new URL(pageUrl)
		if (heading !== undefined) {
			url.hash = heading.id
		}

		const isAudio = element instanceof HTMLAudioElement
		const captionLink = document.createElement('a')
		captionLink.href = url.href
		captionLink.textContent = `${url.host}${url.pathname}${url.search}${url.hash}`
		const caption = document.createElement('span')
		caption.className = classnames.mediaLink
		caption.append(
			isAudio ? 'Audio · Listen to it on the website: ' : 'Video · Watch it on the website: ',
			captionLink,
		)

		// Without controls, audio doesn't render and videos print no control bar
		element.removeAttribute('controls')

		if (element instanceof HTMLVideoElement) {
			const frame = captureFrame(element)
			if (frame !== undefined) {
				element.setAttribute('poster', frame)
			}

			// The poster shows until the video plays, which it doesn't on paper
			if (element.hasAttribute('poster')) {
				element.setAttribute('preload', 'none')
				element.removeAttribute('autoplay')
			}

			// The link takes the place of the video among its siblings, whose
			// spacing rules skip links, so it takes the video's top margin too
			const link = document.createElement('a')
			link.href = url.href
			link.className = classnames.media
			link.style.marginTop = getComputedStyle(element).marginTop
			element.replaceWith(link)
			link.append(element)
			link.insertAdjacentHTML('beforeend', badge)
			link.after(caption)
		} else {
			element.after(caption)
		}

		linkedCount += 1
	}

	return linkedCount
}

/**
 * Links the videos, audio, and embedded video players of the current page,
 * which can't play on paper, to their section on the website.
 */
async function linkMedia(page: Page): Promise<void> {
	const linkedCount = await page.evaluate(markMedia, SELECTORS.mainInfo, CLASSNAMES)
	if (linkedCount > 0) {
		log.info(`Linked ${linkedCount} media element(s) on ${page.url()} to the website.`)
	}
}

export default linkMedia
