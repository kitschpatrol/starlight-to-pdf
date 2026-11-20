import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import linkMedia from '../src/lib/link-media'
import { setLogger } from '../src/lib/log'

let browser: Browser

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

async function openFixture(body: string): Promise<Page> {
	const page = await browser.newPage()
	await page.setRequestInterception(true)
	page.on('request', (request) => {
		void request.respond({
			body: request.url() === 'https://docs.example/page/' ? `<!doctype html>${body}` : '',
			contentType: 'text/html',
		})
	})
	await page.goto('https://docs.example/page/')
	return page
}

describe('linkMedia', () => {
	it('should link media to their section of the canonical page', async () => {
		const page = await openFixture(`
			<link rel="canonical" href="https://published.example/docs/page">
			<div class="sl-markdown-content">
				<video id="intro" controls autoplay muted></video>
				<video id="poster" autoplay muted poster="https://docs.example/poster.jpg"></video>
				<h2 id="first-section">First</h2>
				<p>Text</p>
				<video id="video" controls autoplay muted style="display: block; margin-top: 24px"></video>
				<h3 id="second-section">Second</h3>
				<audio id="audio" controls src="sound.mp3"></audio>
				<iframe id="youtube" src="https://www.youtube-nocookie.com/embed/abc"></iframe>
				<iframe id="map" src="https://maps.example/embed"></iframe>
			</div>
			<video id="outside"></video>
			<script>
				// Fixtures can't ship a video file, so a canvas stream supplies frames
				const canvas = document.createElement('canvas')
				canvas.width = 160
				canvas.height = 90
				const context = canvas.getContext('2d')
				context.fillStyle = 'rgb(0 128 128)'
				context.fillRect(0, 0, 160, 90)
				const video = document.querySelector('#video')
				video.srcObject = canvas.captureStream()
				window.videoReady = new Promise((resolve) => {
					video.addEventListener('loadeddata', resolve, { once: true })
				})
				void video.play()
				requestAnimationFrame(() => context.fillRect(0, 0, 160, 90))
			</script>`)
		await page.evaluate(async () => {
			// @ts-expect-error -- Set by the fixture script
			await globalThis.videoReady
		})

		await linkMedia(page)

		const media = await page.$$eval('[id]:is(video, audio, iframe)', (elements) =>
			Object.fromEntries(
				elements.map((element) => {
					const link = element.parentElement
					const caption = (link?.matches('.s2pdf-media') ? link : element).nextElementSibling
					return [
						element.id,
						{
							attributes: [
								element.hasAttribute('autoplay') ? 'autoplay' : '',
								element.hasAttribute('controls') ? 'controls' : '',
								element.hasAttribute('preload') ? 'preload' : '',
							]
								.filter(Boolean)
								.join(' '),
							caption: caption?.matches('.s2pdf-media-link')
								? `${caption.textContent} -> ${caption.querySelector('a')?.href}`
								: undefined,
							link: link?.matches('a.s2pdf-media')
								? `${link.getAttribute('href')} ${link.style.marginTop}${link.querySelector(':scope > svg.s2pdf-media-badge') ? ' with badge' : ''}`
								: undefined,
							poster: element.getAttribute('poster')?.slice(0, 23),
						},
					]
				}),
			),
		)
		expect(media).toEqual({
			audio: {
				attributes: '',
				caption:
					'Audio · Listen to it on the website: published.example/docs/page#second-section -> https://published.example/docs/page#second-section',
				link: undefined,
				poster: undefined,
			},
			intro: {
				attributes: 'autoplay',
				caption: undefined,
				link: 'https://published.example/docs/page 0px with badge',
				poster: undefined,
			},
			map: { attributes: '', caption: undefined, link: undefined, poster: undefined },
			outside: { attributes: '', caption: undefined, link: undefined, poster: undefined },
			poster: {
				attributes: 'preload',
				caption: undefined,
				link: 'https://published.example/docs/page 0px with badge',
				poster: 'https://docs.example/po',
			},
			video: {
				attributes: 'preload',
				caption: undefined,
				link: 'https://published.example/docs/page#first-section 24px with badge',
				poster: 'data:image/jpeg;base64,',
			},
			youtube: {
				attributes: '',
				caption: undefined,
				link: 'https://published.example/docs/page#second-section 0px',
				poster: undefined,
			},
		})

		// The poster holds the current frame of the video
		const center = await page.$eval('#video', async (video) => {
			const poster = new Image()
			poster.src = video.getAttribute('poster') ?? ''
			await poster.decode()
			const canvas = document.createElement('canvas')
			canvas.width = poster.naturalWidth
			canvas.height = poster.naturalHeight
			const context = canvas.getContext('2d')
			context?.drawImage(poster, 0, 0)
			return [...(context?.getImageData(80, 45, 1, 1).data.slice(0, 3) ?? [])]
		})
		expect(center[0]).toBeLessThan(25)
		expect(center[1]).toBeGreaterThan(100)
		expect(center[2]).toBeGreaterThan(100)
	})

	it('should link to the crawled page without a canonical URL', async () => {
		const page = await openFixture(`
			<div class="sl-markdown-content">
				<h2 id="section">Section</h2>
				<audio controls></audio>
			</div>`)

		await linkMedia(page)

		const link = await page.$eval('.s2pdf-media-link a', (anchor) => anchor.href)
		expect(link).toBe('https://docs.example/page/#section')
	})
})
