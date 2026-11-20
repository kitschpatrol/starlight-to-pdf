import type { Page } from 'puppeteer'
import { CLASSNAMES, SELECTORS } from './constants'
import { log } from './log'

type MarkMediaResult = {
	linkedCount: number
	videosWithoutBadgeCount: number
}

/**
 * Links the media in the content that can't play on paper to their section on
 * the website: videos, audio, and embedded YouTube and Vimeo players. Each gets
 * a caption with the link, and each video also becomes a link itself and shows
 * its current frame, or else its poster, with a play badge drawn on it. Runs in
 * the browser context.
 */
async function markMedia(
	contentSelector: string,
	classnames: { media: string; mediaLink: string },
): Promise<MarkMediaResult> {
	const result: MarkMediaResult = { linkedCount: 0, videosWithoutBadgeCount: 0 }
	const content = document.querySelector(contentSelector)
	if (content === null) {
		return result
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

	// Draws a play badge on the current frame of a video, or else on its poster,
	// and returns the result as an image URL. Cross-origin frames can't be read.
	const drawBadgedFrame = async (video: HTMLVideoElement): Promise<string | undefined> => {
		let source: HTMLImageElement | HTMLVideoElement = video
		let width = video.videoWidth
		let height = video.videoHeight
		if (width === 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
			if (video.poster === '') {
				return undefined
			}

			const poster = new Image()
			poster.src = video.poster
			try {
				await poster.decode()
			} catch {
				return undefined
			}

			source = poster
			width = poster.naturalWidth
			height = poster.naturalHeight
		}

		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext('2d')
		if (context === null) {
			return undefined
		}

		context.drawImage(source, 0, 0, width, height)

		const centerX = width / 2
		const centerY = height / 2
		const radius = Math.min(width, height) * 0.09
		const circle = new Path2D()
		circle.arc(centerX, centerY, radius, 0, 2 * Math.PI)
		context.fillStyle = 'rgb(0 0 0 / 55%)'
		context.fill(circle)

		// A triangle pointing right, centered on its centroid
		const triangleWidth = radius * 0.87
		const left = centerX - triangleWidth / 3
		const triangle = new Path2D()
		triangle.moveTo(left, centerY - radius / 2)
		triangle.lineTo(left, centerY + radius / 2)
		triangle.lineTo(left + triangleWidth, centerY)
		triangle.closePath()
		context.fillStyle = 'white'
		context.fill(triangle)

		try {
			return canvas.toDataURL('image/jpeg', 0.92)
		} catch {
			return undefined
		}
	}

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
			const poster = await drawBadgedFrame(element)
			if (poster === undefined) {
				result.videosWithoutBadgeCount += 1
			} else {
				// The poster shows until the video plays, which it doesn't on paper
				element.setAttribute('poster', poster)
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
			link.after(caption)
		} else {
			element.after(caption)
		}

		result.linkedCount += 1
	}

	return result
}

/**
 * Links the videos, audio, and embedded video players of the current page,
 * which can't play on paper, to their section on the website.
 */
async function linkMedia(page: Page): Promise<void> {
	const { linkedCount, videosWithoutBadgeCount } = await page.evaluate(
		markMedia,
		SELECTORS.mainInfo,
		CLASSNAMES,
	)
	if (linkedCount > 0) {
		log.info(`Linked ${linkedCount} media element(s) on ${page.url()} to the website.`)
	}

	if (videosWithoutBadgeCount > 0) {
		log.warn(
			`${videosWithoutBadgeCount} video(s) on ${page.url()} have no readable frame or poster, such as cross-origin videos, and print without a play badge.`,
		)
	}
}

export default linkMedia
