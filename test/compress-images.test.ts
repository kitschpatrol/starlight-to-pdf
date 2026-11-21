import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StarlightToPdfOptions } from '../src/lib/options'
import compressImages from '../src/lib/compress-images'
import { ParsingError } from '../src/lib/errors'
import { setLogger } from '../src/lib/log'
import { resolveOptions } from '../src/lib/options'
import { emulatePrintLayout, getPrintLayout } from '../src/lib/print-layout'
import { readPdf } from './pdf'

const ORIGIN = 'https://docs.example'

type ImageState = {
	/** Format of the current source, from its first bytes. */
	format: 'jpeg' | 'other' | 'png'
	height: number
	isComplete: boolean
	src: string | undefined
	width: number
}

/**
 * Creates the image files of the fixtures, deterministically: photo-like noise
 * over gradients, which JPEG compresses well, and flat graphics with text,
 * which it doesn't. Runs in the browser context.
 */
async function createFixtures(): Promise<Record<string, string>> {
	let seed = 1
	const random = (): number => {
		seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
		return seed / 2_147_483_648
	}

	// Data URLs carry the files to Node as text
	const toBase64 = async (blob: Blob): Promise<string> =>
		new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.addEventListener('load', () => {
				const dataUrl = typeof reader.result === 'string' ? reader.result : ''
				resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
			})
			reader.addEventListener('error', () => {
				reject(reader.error ?? new Error('Failed to read a fixture'))
			})
			reader.readAsDataURL(blob)
		})

	const drawPhoto = (
		width: number,
		height: number,
		colorSpace: PredefinedColorSpace = 'srgb',
	): OffscreenCanvas => {
		const canvas = new OffscreenCanvas(width, height)
		const context = canvas.getContext('2d', { colorSpace })
		if (context === null) {
			throw new Error('No canvas context')
		}

		const image = context.createImageData(width, height, { colorSpace })
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const index = (y * width + x) * 4
				const noise = random() * 48
				image.data[index] = 140 + (x / width) * 60 + noise
				image.data[index + 1] = 60 + (y / height) * 60 + noise
				image.data[index + 2] = 30 + noise
				image.data[index + 3] = 255
			}
		}

		context.putImageData(image, 0, 0)
		return canvas
	}

	const drawFlat = (width: number, height: number): OffscreenCanvas => {
		const canvas = new OffscreenCanvas(width, height)
		const context = canvas.getContext('2d')
		if (context === null) {
			throw new Error('No canvas context')
		}

		context.fillStyle = '#fff'
		context.fillRect(0, 0, width, height)
		for (let row = 0; row < 8; row++) {
			context.fillStyle = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'][row % 4] ?? '#000'
			context.fillRect(20, 20 + row * (height / 8), width / 3, height / 16)
			context.fillStyle = '#111'
			context.font = `${Math.round(height / 20)}px sans-serif`
			context.fillText(`Setting ${row}: enabled`, width / 2, 50 + row * (height / 8))
		}

		return canvas
	}

	const transparent = drawPhoto(400, 300)
	transparent.getContext('2d')?.clearRect(0, 0, 400, 30)

	// Stored as a landscape image with a red top and a blue bottom, and an EXIF
	// orientation that turns it a quarter clockwise into a portrait image
	const stored = new OffscreenCanvas(400, 200)
	const storedContext = stored.getContext('2d')
	if (storedContext === null) {
		throw new Error('No canvas context')
	}

	storedContext.fillStyle = '#f00'
	storedContext.fillRect(0, 0, 400, 100)
	storedContext.fillStyle = '#00f'
	storedContext.fillRect(0, 100, 400, 100)
	const storedBlob = await stored.convertToBlob({ quality: 0.92, type: 'image/jpeg' })
	const storedJpeg = new Uint8Array(await storedBlob.arrayBuffer())
	const tiff = [
		0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00,
		0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	]
	const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
	const segment = [0xff, 0xe1, 0x00, exif.length + 2, ...exif]
	const rotated = new Blob([
		storedJpeg.subarray(0, 2),
		new Uint8Array(segment),
		storedJpeg.subarray(2),
	])

	// A crisp interface of one-pixel lines, which resampling smooths into more
	// colors than it has
	const grid = new OffscreenCanvas(1600, 1000)
	const gridContext = grid.getContext('2d')
	if (gridContext === null) {
		throw new Error('No canvas context')
	}

	gridContext.fillStyle = '#fff'
	gridContext.fillRect(0, 0, 1600, 1000)
	gridContext.fillStyle = '#000'
	for (let x = 0; x < 1600; x += 13) {
		gridContext.fillRect(x, 0, 1, 1000)
	}

	for (let y = 0; y < 1000; y += 13) {
		gridContext.fillRect(0, y, 1600, 1)
	}

	// Blocks of flat color beside one-pixel lines four pixels apart, which
	// resampling blends into grays that deflate only slightly smaller
	const lines = new OffscreenCanvas(1600, 1000)
	const linesContext = lines.getContext('2d')
	if (linesContext === null) {
		throw new Error('No canvas context')
	}

	linesContext.fillStyle = '#fff'
	linesContext.fillRect(0, 0, 1600, 1000)
	for (let row = 0; row < 8; row++) {
		linesContext.fillStyle = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'][row % 4] ?? '#000'
		linesContext.fillRect(20, 20 + row * 125, 533, 62)
	}

	linesContext.fillStyle = '#111'
	for (let y = 0; y < 1000; y += 4) {
		linesContext.fillRect(800, y, 780, 1)
	}

	const photo = drawPhoto(800, 600)
	const photoPng = await toBase64(await photo.convertToBlob())
	// A part of the photo, as a canvas captured at twice the density of a box
	// 200 pixels wide
	const captured = new OffscreenCanvas(400, 300)
	captured.getContext('2d')?.drawImage(photo, 0, 0, 400, 300, 0, 0, 400, 300)
	return {
		'captured.png': await toBase64(await captured.convertToBlob()),
		'diagram.svg': await toBase64(
			new Blob([
				'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eee"/><text x="20" y="150">Diagram</text></svg>',
			]),
		),
		'flat-small.png': await toBase64(await drawFlat(400, 250).convertToBlob()),
		'flat.png': await toBase64(await drawFlat(1600, 1000).convertToBlob()),
		'grid.png': await toBase64(await grid.convertToBlob()),
		'lines.png': await toBase64(await lines.convertToBlob()),
		'low-quality.jpg': await toBase64(
			await photo.convertToBlob({ quality: 0.3, type: 'image/jpeg' }),
		),
		'photo.jpg': await toBase64(await photo.convertToBlob({ quality: 0.92, type: 'image/jpeg' })),
		'photo.png': photoPng,
		// A vector image that draws as a photo, which JPEG would take if it could
		'photo.svg': await toBase64(
			new Blob([
				`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><image href="data:image/png;base64,${photoPng}" width="800" height="600"/></svg>`,
			]),
		),
		'rotated.jpg': await toBase64(rotated),
		'small.jpg': await toBase64(
			await drawPhoto(200, 150).convertToBlob({ quality: 0.92, type: 'image/jpeg' }),
		),
		'transparent.png': await toBase64(await transparent.convertToBlob()),
		'wide-gamut.png': await toBase64(await drawPhoto(400, 300, 'display-p3').convertToBlob()),
	}
}

let browser: Browser
let fixtures = new Map<string, Uint8Array>()

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
	const page = await browser.newPage()
	const encoded = await page.evaluate(createFixtures)
	await page.close()
	fixtures = new Map(
		Object.entries(encoded).map(([name, base64]) => [name, Buffer.from(base64, 'base64')]),
	)
}, 60_000)

afterAll(async () => {
	await browser.close()
})

/**
 * Maps a requested path to the name of a fixture. The image at `varies.png`
 * changes after the first request, and the one at `negotiated.png` depends on
 * the formats that the request accepts, as on servers that negotiate content.
 */
function resolveFixtureName(path: string, requestCount: number, accept: string): string {
	if (path === 'varies.png') {
		return requestCount === 1 ? 'photo.png' : 'flat.png'
	}

	if (path === 'negotiated.png') {
		return accept.includes('image/avif') ? 'photo.png' : 'rotated.jpg'
	}

	return path
}

/**
 * Opens a page with the markup, and the headers of its response, serving the
 * fixture images by name from the page's origin, and without CORS from another
 * origin.
 */
async function openFixture(body: string, headers: Record<string, string> = {}): Promise<Page> {
	const page = await browser.newPage()
	await page.setRequestInterception(true)
	const requestCounts = new Map<string, number>()
	page.on('request', (request) => {
		const url = new URL(request.url())
		if (request.resourceType() === 'document') {
			void request.respond({ body: `<!doctype html>${body}`, contentType: 'text/html', headers })
			return
		}

		const requestCount = (requestCounts.get(url.pathname) ?? 0) + 1
		requestCounts.set(url.pathname, requestCount)
		const accept = request.headers().accept ?? ''
		const name = resolveFixtureName(url.pathname.slice(1), requestCount, accept)
		const file = fixtures.get(name)
		if (file === undefined) {
			void request.respond({ body: 'Not found', status: 404 })
			return
		}

		void request.respond({
			body: file,
			contentType: name.endsWith('.svg') ? 'image/svg+xml' : `image/${name.split('.').at(-1)}`,
		})
	})
	await page.goto(`${ORIGIN}/`)
	return page
}

/** Lists the boxes of all elements, including those in open shadow roots. */
async function getLayout(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const boxes: string[] = []
		const pendingRoots: Array<Document | ShadowRoot> = [document]
		let root = pendingRoots.pop()
		while (root !== undefined) {
			for (const element of root.querySelectorAll('*')) {
				const { height, left, top, width } = element.getBoundingClientRect()
				boxes.push(`${element.tagName} ${left},${top + window.scrollY} ${width}x${height}`)
				if (element.shadowRoot) {
					pendingRoots.push(element.shadowRoot)
				}
			}

			root = pendingRoots.pop()
		}

		return boxes
	})
}

/** Reads the source of an image and the format and pixel size of its file. */
async function getImageState(page: Page, selector: string): Promise<ImageState> {
	const image = await page.$(selector)
	if (image === null) {
		throw new Error(`No image matches ${selector}`)
	}

	return image.evaluate(async (element): Promise<ImageState> => {
		if (!(element instanceof HTMLImageElement)) {
			throw new TypeError('Not an image')
		}

		const response = await fetch(element.currentSrc)
		const blob = await response.blob()
		const header = new Uint8Array(await blob.slice(0, 3).arrayBuffer())
		const bitmap = await createImageBitmap(blob)
		return {
			format:
				header[0] === 0xff && header[1] === 0xd8
					? 'jpeg'
					: header[0] === 0x89 && header[1] === 0x50
						? 'png'
						: 'other',
			height: bitmap.height,
			isComplete: element.complete && element.naturalWidth > 0,
			src: element.getAttribute('src') ?? undefined,
			width: bitmap.width,
		}
	})
}

/**
 * Compresses the images of the page at the print layout of the options, and
 * returns the layout before and after.
 */
async function compress(
	page: Page,
	options: Omit<StarlightToPdfOptions, 'url'> = {},
): Promise<{ after: string[]; before: string[] }> {
	const resolved = resolveOptions({ ...options, compress: true, url: ORIGIN })
	if (resolved.cssPageSize) {
		await page.emulateMediaType('print')
	} else {
		await emulatePrintLayout(page, getPrintLayout(resolved))
	}

	const before = await getLayout(page)
	await compressImages(page, resolved)
	return { after: await getLayout(page), before }
}

describe('compressImages', () => {
	it('should re-encode photos as JPEG at twice their printed size without moving anything', async () => {
		const page = await openFixture(`
			<style>
				body { margin: 0; font: 16px/1.5 sans-serif; }
				img { display: block; max-width: 100%; height: auto; }
				/* Starlight's spacing between siblings, which the sources of a picture take part in */
				.content :not(a, strong) + :not(a, strong) { margin-top: 1rem; }
			</style>
			<div class="content">
				<p>Photos</p>
				<img id="photo" src="/photo.png" style="width: 200px">
				<a href="/zoom/"><picture>
					<source srcset="/photo.png?picture 800w" sizes="200px" type="image/png">
					<img id="picture" src="/small.jpg?picture" alt="Picture">
				</picture></a>
				<img id="density" srcset="/photo.png?density 2x" alt="Twice the density">
				<img id="contain" src="/photo.png?contain" style="width: 400px; height: 100px; object-fit: contain">
				<img id="cover" src="/photo.png?cover" style="width: 200px; height: 200px; object-fit: cover">
				<img id="nearly" src="/photo.png?nearly" style="width: 360px">
				<img class="shared" src="/photo.png?shared" style="width: 200px">
				<img class="shared" src="/photo.png?shared" style="width: 100px">
				<img id="negotiated" src="/negotiated.png" style="width: 200px">
				<div id="host"></div>
				<!-- Far from the viewport, so it loads only when printed, in a box that its size reserves -->
				<img id="lazy" loading="lazy" src="/photo.png?lazy" width="800" height="600" style="width: 200px; margin-top: 8000px">
			</div>
			<script>
				const image = document.createElement('img')
				image.src = '/photo.png?shadow'
				image.style.width = '200px'
				document.querySelector('#host').attachShadow({ mode: 'open' }).append(image)
			</script>`)
		expect(
			await page.$eval('#lazy', (image) => image instanceof HTMLImageElement && image.complete),
		).toBe(false)

		const { after, before } = await compress(page)
		expect(after).toEqual(before)

		const jpeg = { format: 'jpeg', isComplete: true }
		expect(await getImageState(page, '#photo')).toMatchObject({ ...jpeg, width: 400, height: 300 })
		expect(await getImageState(page, '#picture')).toMatchObject({
			...jpeg,
			width: 400,
			height: 300,
		})
		// Printed at its natural size of 400 pixels, which its 800 pixels match
		expect(await getImageState(page, '#density')).toMatchObject({
			...jpeg,
			width: 800,
			height: 600,
		})
		// Drawn 133 pixels wide inside its box
		expect(await getImageState(page, '#contain')).toMatchObject({
			...jpeg,
			width: 267,
			height: 200,
		})
		// Drawn 267 pixels wide, cropped to its box
		expect(await getImageState(page, '#cover')).toMatchObject({ ...jpeg, width: 533, height: 400 })
		// Printed at 213 ppi, which JPEG brings down to 192 ppi
		expect(await getImageState(page, '#nearly')).toMatchObject({ ...jpeg, width: 720, height: 540 })
		expect(await getImageState(page, '#host >>> img')).toMatchObject({
			...jpeg,
			width: 400,
			height: 300,
		})
		expect(await getImageState(page, '#lazy')).toMatchObject({ ...jpeg, width: 400, height: 300 })
		// Read in the format that the page received, as image requests accept it
		expect(await getImageState(page, '#negotiated')).toMatchObject({
			...jpeg,
			width: 400,
			height: 300,
		})

		// The larger use sets the size, and both share one image, which the PDF stores once
		const shared = await page.$$eval('.shared', (images) =>
			images.map((image) => (image instanceof HTMLImageElement ? image.currentSrc : '')),
		)
		expect(new Set(shared).size).toBe(1)
		expect(await getImageState(page, '.shared')).toMatchObject({ ...jpeg, width: 400, height: 300 })

		// The source of the picture stays in place, pointing to the replacement
		const source = await page.$eval('source', (element) => element.getAttribute('srcset'))
		expect(source).toBe(await page.$eval('#picture', (image) => image.getAttribute('src')))
	})

	it('should keep flat graphics lossless and downsample only those larger than needed', async () => {
		const page = await openFixture(`
			<img id="flat" src="/flat.png" style="display: block; width: 400px">
			<img id="flat-small" src="/flat-small.png" style="display: block">
			<img id="lines" src="/lines.png" style="display: block; width: 420px">
			<img id="grid" src="/grid.png" style="display: block; width: 560px">`)

		const { after, before } = await compress(page)
		expect(after).toEqual(before)

		expect(await getImageState(page, '#flat')).toMatchObject({
			format: 'png',
			height: 500,
			width: 800,
		})
		expect(await getImageState(page, '#flat-small')).toMatchObject({
			format: 'png',
			src: '/flat-small.png',
		})
		// Printed at 366 ppi, but its lines would deflate only about an eighth
		// smaller at 192 ppi, which isn't worth softening them for
		expect(await getImageState(page, '#lines')).toMatchObject({
			format: 'png',
			src: '/lines.png',
			width: 1600,
		})
		// Printed at 274 ppi, but its lines would deflate larger at 192 ppi
		expect(await getImageState(page, '#grid')).toMatchObject({
			format: 'png',
			src: '/grid.png',
			width: 1600,
		})
	})

	it('should downsample JPEG photos larger than needed and leave the others as they are', async () => {
		const page = await openFixture(`
			<img id="large" src="/photo.jpg" style="display: block; width: 200px">
			<img id="small" src="/small.jpg" style="display: block">
			<img id="low-quality" src="/low-quality.jpg" style="display: block; width: 280px">`)

		await compress(page)

		const large = await getImageState(page, '#large')
		expect(large).toMatchObject({ format: 'jpeg', height: 300, width: 400 })
		expect(large.src).not.toBe('/photo.jpg')
		expect(await getImageState(page, '#small')).toMatchObject({ src: '/small.jpg', width: 200 })
		// Its file is smaller than any JPEG at the quality of the tool
		expect(await getImageState(page, '#low-quality')).toMatchObject({
			src: '/low-quality.jpg',
			width: 800,
		})
	})

	it('should leave images alone that JPEG cannot represent or that cannot be read', async () => {
		const page = await openFixture(`
			<img id="transparent" src="/transparent.png" style="width: 200px">
			<img id="vector" src="/diagram.svg" style="width: 200px">
			<img id="vector-photo" src="/photo.svg" style="width: 200px">
			<img id="cross-origin" src="https://other.example/photo.png" style="width: 200px">
			<img id="pixelated" src="/photo.png?pixelated" style="width: 200px; image-rendering: pixelated">
			<img id="stored-orientation" src="/rotated.jpg" style="width: 50px; image-orientation: none">
			<!-- Drawn at its natural size of 400 pixels, which a replacement of 800 pixels would double -->
			<img id="unfitted" srcset="/photo.png?unfitted 2x" style="width: 200px; height: 150px; object-fit: none">
			<img id="hidden" src="/photo.png?hidden" style="display: none">
			<img id="broken" src="/missing.png">`)

		const { after, before } = await compress(page)
		expect(after).toEqual(before)

		const sources = await page.$$eval('img', (images) =>
			images.map((image) => `${image.id}: ${image.getAttribute('src')}`),
		)
		expect(sources).toEqual([
			'transparent: /transparent.png',
			'vector: /diagram.svg',
			'vector-photo: /photo.svg',
			'cross-origin: https://other.example/photo.png',
			'pixelated: /photo.png?pixelated',
			'stored-orientation: /rotated.jpg',
			'unfitted: null',
			'hidden: /photo.png?hidden',
			'broken: /missing.png',
		])
	})

	it('should re-encode padded, transformed, and zoomed images at the size they print at without moving anything', async () => {
		const page = await openFixture(`
			<style>img { display: block; }</style>
			<img id="padded" src="/photo.png?padded" style="width: 200px; padding: 50px; border: 10px solid">
			<img id="transformed" src="/photo.png?transformed" style="width: 400px; transform: scale(0.5)">
			<div style="transform: scale(0.5)">
				<img id="in-transformed" src="/photo.png?in-transformed" style="width: 400px">
			</div>
			<div style="zoom: 0.5">
				<img id="in-zoomed" src="/photo.png?in-zoomed" style="width: 400px">
			</div>
			<img id="rotated" src="/photo.png?rotated" style="width: 200px; transform: rotate(90deg)">
			<div style="transform: scale(2, 1)">
				<img id="stretched" src="/photo.png?stretched" style="width: 200px; transform: rotate(90deg)">
			</div>`)

		const { after, before } = await compress(page)
		expect(after).toEqual(before)

		// Each draws the image 200 pixels wide in print, which takes 400 pixels at
		// 192 ppi, inside the padding and the border of its box
		for (const selector of ['#padded', '#transformed', '#in-transformed', '#in-zoomed']) {
			expect(await getImageState(page, selector)).toMatchObject({
				format: 'jpeg',
				height: 300,
				width: 400,
			})
		}

		// Turned, and stretched twice as much along its height as its width, so
		// that its bounds would understate the pixels it needs
		for (const selector of ['#rotated', '#stretched']) {
			expect(await getImageState(page, selector)).toMatchObject({
				format: 'jpeg',
				height: 600,
				width: 800,
			})
		}
	})

	it('should leave images alone that skip rendering without holding up the others', async () => {
		const page = await openFixture(`
			<img id="photo" src="/photo.png" style="display: block; width: 200px">
			<details>
				<summary>Closed</summary>
				<img id="closed" src="/photo.png?closed" style="width: 200px">
			</details>
			<div hidden="until-found">
				<img id="until-found" src="/photo.png?until-found" style="width: 200px">
			</div>
			<div style="content-visibility: hidden">
				<img id="hidden" src="/photo.png?hidden" style="width: 200px">
			</div>
			<!-- Far from the viewport, so it renders only when printed -->
			<div style="margin-top: 20000px; content-visibility: auto; contain-intrinsic-size: auto 150px">
				<img id="auto" src="/photo.png?auto" style="display: block; width: 200px">
			</div>`)

		const { after, before } = await compress(page)
		expect(after).toEqual(before)

		expect(await getImageState(page, '#photo')).toMatchObject({ format: 'jpeg', width: 400 })
		const sources = await page.$$eval('img:not(#photo)', (images) =>
			images.map((image) => `${image.id}: ${image.getAttribute('src')}`),
		)
		expect(sources).toEqual([
			'closed: /photo.png?closed',
			'until-found: /photo.png?until-found',
			'hidden: /photo.png?hidden',
			'auto: /photo.png?auto',
		])
	})

	it('should fail with a way around it when the images cannot be found', async () => {
		const page = await openFixture('<img src="/photo.png" style="width: 200px">')
		await page.evaluate(() => {
			Element.prototype.checkVisibility = () => {
				throw new Error('Broken page')
			}
		})

		const compressing = compress(page)
		await expect(compressing).rejects.toBeInstanceOf(ParsingError)
		await expect(compressing).rejects.toMatchObject({
			additionalInfo: { originalErrorMessage: expect.stringContaining('Broken page') as string },
			message:
				"Couldn't find the images to re-encode for the `compress` option. Turn it off to save the PDF without re-encoding its images. The program aborts.",
		})
	})

	it('should print the image that the page shows when its URL serves another one each time', async () => {
		const page = await openFixture(
			'<img id="varies" src="/varies.png" style="display: block; width: 200px">',
		)
		// The average colors of the left and right halves of the image on the page
		const getShownColors = async (): Promise<number[]> =>
			page.$eval('#varies', (image) => {
				const context = new OffscreenCanvas(2, 1).getContext('2d')
				if (context === null || !(image instanceof HTMLImageElement)) {
					throw new Error('No canvas context or no image')
				}

				context.imageSmoothingQuality = 'high'
				context.drawImage(image, 0, 0, 2, 1)
				return [...context.getImageData(0, 0, 2, 1).data]
			})
		const shownColors = await getShownColors()

		const { after, before } = await compress(page)
		expect(after).toEqual(before)

		// The proportions of the photo that the page shows, not of the graphic
		// that the server sends next
		expect(await getImageState(page, '#varies')).toMatchObject({
			format: 'jpeg',
			height: 300,
			width: 400,
		})
		const printedColors = await getShownColors()
		for (const [channel, value] of printedColors.entries()) {
			expect(Math.abs(value - (shownColors[channel] ?? 0))).toBeLessThanOrEqual(6)
		}
	})

	it('should re-encode images under a content security policy that allows images from data URLs', async () => {
		const captured = Buffer.from(fixtures.get('captured.png') ?? []).toString('base64')
		// Sized with attributes, since the policy blocks inline styles, and with the
		// data URL that a canvas becomes during the crawl, also wrapped across
		// lines, as markup can carry it
		const page = await openFixture(
			`<img id="photo" src="/photo.png" width="200" height="150">
			<img id="canvas" src="data:image/png;base64,${captured}" width="200" height="150">
			<img id="wrapped" src="data:image/png;base64,${captured.replaceAll(/.{76}/gv, '$&\n')}" width="200" height="150">`,
			{ 'content-security-policy': "default-src 'self'; img-src 'self' data:" },
		)

		const { after, before } = await compress(page)
		expect(after).toEqual(before)

		// The policy keeps the page from fetching data URLs, so the images tell
		// their own state
		const states = await page.$$eval('img', (images) =>
			images.map((image) =>
				image instanceof HTMLImageElement
					? `${image.id}: ${image.currentSrc.slice(0, image.currentSrc.indexOf(','))} ${image.naturalWidth}x${image.naturalHeight}`
					: '',
			),
		)
		expect(states).toEqual([
			'photo: data:image/jpeg;base64 400x300',
			'canvas: data:image/jpeg;base64 400x300',
			'wrapped: data:image/jpeg;base64 400x300',
		])
	})

	it('should put an image back when the content security policy blocks its replacement', async () => {
		// Images from data URLs fall under default-src
		const page = await openFixture('<img id="photo" src="/photo.png" width="200" height="150">', {
			'content-security-policy': "default-src 'self'",
		})

		const { after, before } = await compress(page)
		expect(after).toEqual(before)
		expect(
			await page.$eval('#photo', (image) =>
				image instanceof HTMLImageElement
					? `${image.getAttribute('src')} ${image.naturalWidth}x${image.naturalHeight} ${image.complete}`
					: '',
			),
		).toBe('/photo.png 800x600 true')
	})

	it('should load the replacement of a lazy image far from the viewport', async () => {
		const page = await openFixture(`
			<img id="lazy" loading="lazy" src="/photo.png" style="display: block; width: 200px">
			<div style="height: 10000px"></div>`)
		await page.evaluate(() => {
			window.scrollTo(0, document.body.scrollHeight)
		})

		await compress(page)

		expect(await getImageState(page, '#lazy')).toMatchObject({
			format: 'jpeg',
			isComplete: true,
			width: 400,
		})
	})

	it('should put an image back when its replacement would move the layout', async () => {
		const page = await openFixture(`
			<style>img[src="/photo.png"] { margin-top: 40px; }</style>
			<img id="moves" src="/photo.png" style="display: block; width: 200px">
			<p>After</p>`)

		const { after, before } = await compress(page)
		expect(after).toEqual(before)
		expect(await getImageState(page, '#moves')).toMatchObject({
			format: 'png',
			isComplete: true,
			src: '/photo.png',
		})
	})

	it('should keep the orientation and the colors that the original image shows', async () => {
		const page = await openFixture(`
			<img id="rotated" src="/rotated.jpg" style="display: block; width: 50px">
			<img id="wide-gamut" src="/wide-gamut.png" style="display: block; width: 400px">`)
		// The average colors of the left and right halves of each image, in sRGB
		const getColors = async (): Promise<number[][]> =>
			page.$$eval('img', async (images) => {
				const colors: number[][] = []
				for (const image of images) {
					const response = await fetch(image instanceof HTMLImageElement ? image.currentSrc : '')
					const bitmap = await createImageBitmap(await response.blob())
					const context = new OffscreenCanvas(2, 1).getContext('2d')
					if (context === null) {
						throw new Error('No canvas context')
					}

					context.imageSmoothingQuality = 'high'
					context.drawImage(bitmap, 0, 0, 2, 1)
					colors.push([...context.getImageData(0, 0, 2, 1).data])
				}

				return colors
			})
		const originalColors = await getColors()

		await compress(page)

		expect(await getImageState(page, '#rotated')).toMatchObject({
			format: 'jpeg',
			height: 200,
			width: 100,
		})
		expect(await getImageState(page, '#wide-gamut')).toMatchObject({ format: 'jpeg' })
		const colors = await getColors()
		for (const [index, original] of originalColors.entries()) {
			for (const [channel, value] of original.entries()) {
				expect(Math.abs((colors[index]?.[channel] ?? 0) - value)).toBeLessThanOrEqual(6)
			}
		}

		// The rotated image shows its blue bottom on the left and its red top on the
		// right, as the red values of its halves tell
		const [rotatedColors = []] = originalColors
		expect(rotatedColors[0]).toBeLessThan(50)
		expect(rotatedColors[4]).toBeGreaterThan(200)
		// The wide-gamut image shows a bluer right half than its stored values of 54
		// would in sRGB, so dropping its color profile would fail the comparison
		expect(originalColors[1]?.[6]).toBeLessThan(54 - 6)
	})

	it('should keep the pixels of images on pages sized in CSS, whose printed size is unknown', async () => {
		// The container narrows the image of twice the density at the measured
		// layout, and would on narrow pages, but not on pages wider than its
		// natural size, which a replacement of density 1 would double
		const page = await openFixture(`
			<img id="photo" src="/photo.png" style="display: block; width: 200px">
			<div style="width: 300px">
				<img id="density" srcset="/photo.png?density 2x" style="display: block; max-width: 100%">
			</div>`)

		const { after, before } = await compress(page, { cssPageSize: true })
		expect(after).toEqual(before)

		expect(await getImageState(page, '#photo')).toMatchObject({
			format: 'jpeg',
			height: 600,
			width: 800,
		})
		// Without a box measured at the print layout, the natural size keeps it in place
		expect(await page.$eval('#photo', (image) => image.getAttribute('style'))).toBe(
			'display: block; width: 200px',
		)
		expect(await getImageState(page, '#density')).toMatchObject({ format: 'png' })
	})

	it('should make Chrome embed a re-encoded image as JPEG data', async () => {
		const page = await openFixture('<img src="/photo.png" style="display: block; width: 200px">')
		await compress(page)

		const pdf = await readPdf(await page.pdf({ format: 'letter' }))
		const images = pdf.pages.flatMap((pdfPage) => pdfPage.images)
		expect(images).toMatchObject([{ filter: ['/DCTDecode'], width: 400 }])
	})
})
