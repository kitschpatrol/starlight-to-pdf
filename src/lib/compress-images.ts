import type { JSHandle, Page } from 'puppeteer'
import type { ResolvedOptions } from './types'
import errorCatcher from './error-catcher'
import { ParsingError } from './errors'
import { log } from './log'
import { emulatePrintLayout, getPrintLayout } from './print-layout'

/**
 * Image pixels per CSS pixel of printed size, 192 ppi, the density at which
 * canvases are captured during the crawl.
 */
const PRINT_DENSITY = 2

const JPEG_QUALITY = 0.85

/**
 * JPEG replaces the lossless pixels that Chrome would embed only when it takes
 * at most this share of their deflated size. Photos come to a sixth or less,
 * while crisp screenshots, charts, and diagrams deflate as small as JPEG or
 * smaller, and blur in it.
 */
const JPEG_MAX_SIZE_RATIO = 0.5

/**
 * Images that stay lossless downsample only when their fewer pixels deflate to
 * at most this share of the size of their original pixels, since resampling
 * softens crisp graphics, which only a clear saving makes worth it.
 */
const DOWNSAMPLE_MAX_SIZE_RATIO = 0.75

/** Larger canvases can exhaust the memory of the page. */
const MAX_CANVAS_PIXELS = 50_000_000

/**
 * Time to wait for an image to load or decode before leaving it as it is, at
 * most. A shorter `timeout` shortens it, since the protocol timeout bounds each
 * call into the page, which can wait up to five times.
 */
const IMAGE_TIMEOUT_MS = 30_000

type CompressionSettings = {
	cssPageSize: boolean
	density: number
	downsampleMaxSizeRatio: number
	jpegMaxSizeRatio: number
	jpegQuality: number
	maxCanvasPixels: number
	timeoutMs: number
}

type Size = {
	width: number
	height: number
}

/** A rendered image element, measured before anything changes. */
type ImageUse = {
	/**
	 * Content box of the layout, which the image keeps, and which leaves out
	 * transforms and zoom, unlike its client rect.
	 */
	content: Size
	element: HTMLImageElement
	naturalHeight: number
	naturalWidth: number
	objectFit: string
	/** Client rect in document coordinates, which tells whether the image moved. */
	rect: Size & { left: number; top: number }
	/** Puts back the original sources and styles, once the image is replaced. */
	restore?: () => void
	/**
	 * How much the transforms and zoom of the image and its ancestors scale it in
	 * print, or infinity when they change its proportions, which keeps all its
	 * pixels.
	 */
	transformScale: number
}

/** The uses of one image source, which share one replacement and one PDF image. */
type ImageGroup = {
	source: string
	uses: ImageUse[]
}

type ImagePlan = {
	documentHeight: number
	groups: ImageGroup[]
	/**
	 * Images that print, but that content-visibility: auto keeps from rendering
	 * on screen, so that they can't be measured.
	 */
	skippedCount: number
}

type ImageOutcome = {
	decodedHeight: number
	decodedWidth: number
	/**
	 * Size of the deflated pixels at the printed size, as Chrome would embed them
	 * for formats but JPEG.
	 */
	deflatedBytes: number
	encodedHeight: number
	encodedWidth: number
	jpegBytes: number
	/**
	 * What became of the image: re-encoded as JPEG or losslessly, or kept since
	 * nothing would be smaller, its replacement would move the layout, or it is
	 * transparent, unreadable, or a vector image.
	 */
	kind: 'jpeg' | 'kept' | 'layout' | 'lossless' | 'transparent' | 'unreadable' | 'vector'
	originalBytes: number
	/**
	 * Size of the original pixels deflated, which fewer pixels must clearly
	 * undercut for an image to downsample without loss.
	 */
	originalDeflatedBytes: number
	replacementBytes: number
	/** The start of the source URL, which can be a long data URL. */
	source: string
}

/**
 * Finds the rendered images of the document, including those in open shadow
 * roots, waits for them and for fonts to load, and measures them before
 * anything changes. Lazy images load, as Chrome loads them for printing anyway.
 * Images with pixelated rendering or image-orientation: none are skipped, since
 * a replacement would draw differently. Runs in the browser context.
 */
async function planImages(settings: CompressionSettings): Promise<ImagePlan> {
	const images: HTMLImageElement[] = []
	const pendingRoots: Array<Document | ShadowRoot> = [document]
	let root = pendingRoots.pop()
	while (root !== undefined) {
		for (const element of root.querySelectorAll('*')) {
			if (element instanceof HTMLImageElement) {
				images.push(element)
			}

			if (element.shadowRoot) {
				pendingRoots.push(element.shadowRoot)
			}
		}

		root = pendingRoots.pop()
	}

	// Images in closed details, hidden="until-found" content, and other content
	// under content-visibility: hidden don't print. Those under
	// content-visibility: auto far from the viewport print, but don't render on
	// screen, so resize observers can't measure them, and they stay as they are.
	const printed = images.filter((image) => image.checkVisibility({ visibilityProperty: true }))
	const rendered = printed.filter((image) =>
		image.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }),
	)

	const pending = rendered.filter((image) => !image.complete)
	for (const image of pending) {
		if (image.loading === 'lazy') {
			image.loading = 'eager'
		}
	}

	await Promise.race([
		Promise.allSettled([document.fonts.ready, ...pending.map(async (image) => image.decode())]),
		new Promise((resolve) => {
			setTimeout(resolve, settings.timeoutMs)
		}),
	])

	const isReplaceable = (image: HTMLImageElement): boolean => {
		const style = getComputedStyle(image)
		const { width, height } = image.getBoundingClientRect()
		return (
			image.complete &&
			image.naturalWidth > 0 &&
			image.currentSrc !== '' &&
			width > 0 &&
			height > 0 &&
			style.imageRendering === 'auto' &&
			style.imageOrientation === 'from-image'
		)
	}

	const replaceable = rendered.filter((image) => isReplaceable(image))

	// Resize observers report the boxes of the layout, which leave out
	// transforms and zoom, for each element once observed, on the next rendering
	const layoutBoxes = new Map<Element, ResizeObserverEntry>()
	await new Promise<void>((resolve) => {
		if (replaceable.length === 0) {
			resolve()
			return
		}

		const observer = new ResizeObserver((observed) => {
			for (const entry of observed) {
				layoutBoxes.set(entry.target, entry)
			}

			if (layoutBoxes.size !== replaceable.length) {
				return
			}

			observer.disconnect()
			resolve()
		})
		// Border boxes report even when the content box is empty
		for (const image of replaceable) {
			observer.observe(image, { box: 'border-box' })
		}

		// Images that aren't measured in time stay as they are
		setTimeout(() => {
			observer.disconnect()
			resolve()
		}, settings.timeoutMs)
	})

	const groups = new Map<string, ImageGroup>()
	for (const image of replaceable) {
		const entry = layoutBoxes.get(image)
		const [contentBox] = entry?.contentBoxSize ?? []
		const [borderBox] = entry?.borderBoxSize ?? []
		if (contentBox === undefined || borderBox === undefined) {
			continue
		}

		const style = getComputedStyle(image)
		const isHorizontal = style.writingMode.startsWith('horizontal')
		const toSize = ({ blockSize, inlineSize }: ResizeObserverSize): Size =>
			isHorizontal
				? { width: inlineSize, height: blockSize }
				: { width: blockSize, height: inlineSize }
		const content = toSize(contentBox)
		// Padding or a border around no content shows no pixels
		if (content.width === 0 || content.height === 0) {
			continue
		}

		const border = toSize(borderBox)
		const rect = image.getBoundingClientRect()
		// The client rect bounds the transformed box, so its ratio to the border
		// box is the scale of transforms that keep proportions, such as scale()
		// and zoom. Those that don't, such as rotate() and uneven scaling, can
		// stretch the image further than either ratio tells.
		const widthScale = rect.width / border.width
		const heightScale = rect.height / border.height
		const isProportional =
			Math.abs(widthScale - heightScale) <= Math.max(widthScale, heightScale) / 1000
		const group = groups.get(image.currentSrc) ?? { source: image.currentSrc, uses: [] }
		groups.set(image.currentSrc, group)
		group.uses.push({
			content,
			element: image,
			naturalHeight: image.naturalHeight,
			naturalWidth: image.naturalWidth,
			objectFit: style.objectFit,
			rect: {
				height: rect.height,
				left: rect.left + window.scrollX,
				top: rect.top + window.scrollY,
				width: rect.width,
			},
			transformScale: isProportional ? Math.max(widthScale, heightScale) : Infinity,
		})
	}

	return {
		documentHeight: document.documentElement.scrollHeight,
		groups: groups.values().toArray(),
		skippedCount: printed.length - rendered.length,
	}
}

/**
 * Re-encodes the image of one group for print and points all its uses to the
 * replacement, unless that would move the layout or make nothing smaller.
 * Opaque images become JPEG at no more than the print density, unless JPEG
 * isn't clearly smaller than the lossless pixels Chrome would embed, in which
 * case they stay lossless and only downsample, when they have more pixels than
 * print needs and fewer pixels deflate clearly smaller. Each use keeps the size
 * of its content box, so the natural size of the replacement doesn't matter to
 * the layout. Runs in the browser context.
 */
async function compressImageGroup(
	plan: ImagePlan,
	index: number,
	settings: CompressionSettings,
): Promise<ImageOutcome> {
	/** The start, size, and media type of the file of an image. */
	type ImageFile = {
		header: Uint8Array
		size: number
		type: string
	}

	const group = plan.groups[index] ?? { source: '', uses: [] }
	const outcome: ImageOutcome = {
		decodedHeight: 0,
		decodedWidth: 0,
		deflatedBytes: 0,
		encodedHeight: 0,
		encodedWidth: 0,
		jpegBytes: 0,
		kind: 'unreadable',
		originalBytes: 0,
		originalDeflatedBytes: 0,
		replacementBytes: 0,
		source: group.source.startsWith('data:')
			? `${group.source.slice(0, group.source.indexOf(','))} data URL`
			: group.source.slice(0, 100),
	}

	const withTimeout = async <T>(promise: Promise<T>): Promise<T> =>
		Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				setTimeout(() => {
					reject(new Error('Timed out'))
				}, settings.timeoutMs)
			}),
		])

	// Data URLs carry their file, percent-encoded, and in base64 after that when
	// they say so, as browsers read them
	const readDataUrl = (url: string): ImageFile => {
		const comma = url.indexOf(',')
		const metadata = url.slice('data:'.length, comma)
		// One character per byte
		const data = url
			.slice(comma + 1)
			.replaceAll(/%(?<hex>[\da-f]{2})/giv, (_match, hex: string) =>
				String.fromCodePoint(Number.parseInt(hex, 16)),
			)
		const bytes = metadata.toLowerCase().endsWith(';base64')
			? // eslint-disable-next-line no-restricted-globals -- The page can't import uint8array-extras, and the ES2025 types lack Uint8Array.fromBase64
				atob(data)
			: data
		return {
			header: Uint8Array.from(bytes.slice(0, 16), (character) => character.codePointAt(0) ?? 0),
			size: bytes.length,
			type: metadata.split(';', 1)[0] ?? '',
		}
	}

	// Reads the file of the image, which tells its format, and the size of JPEG
	// files, which Chrome embeds as they are
	const readFile = async (): Promise<ImageFile | undefined> => {
		try {
			// Data URLs, such as those that canvases become during the crawl, need
			// no request, which the content security policy of the page could block
			if (group.source.startsWith('data:')) {
				return readDataUrl(group.source)
			}

			// Sniffing the format this way downloads each image again, since the
			// crawl turns off the cache. The request accepts the formats of image
			// requests, so that servers that negotiate formats send the one that
			// the page shows.
			const response = await fetch(group.source, {
				headers: { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
				signal: AbortSignal.timeout(settings.timeoutMs),
			})
			if (!response.ok) {
				return undefined
			}

			const blob = await withTimeout(response.blob())
			return {
				header: new Uint8Array(await blob.slice(0, 16).arrayBuffer()),
				size: blob.size,
				type: blob.type,
			}
		} catch {
			// Cross-origin images without CORS, files that the content security
			// policy keeps the page from requesting, failed requests, revoked blob
			// URLs, and malformed data URLs stay as they are
			return undefined
		}
	}

	// The share of its pixels that the largest printed use needs. Object-fit
	// draws the image into the content box, which transforms and zoom scale.
	const getPrintScale = (decodedWidth: number, decodedHeight: number): number => {
		// The printed size on pages sized in CSS is unknown
		if (settings.cssPageSize) {
			return 1
		}

		let scale = 0
		for (const { content, naturalHeight, naturalWidth, objectFit, transformScale } of group.uses) {
			const fill = { width: content.width / decodedWidth, height: content.height / decodedHeight }
			const contain = Math.min(fill.width, fill.height)
			const cover = Math.max(fill.width, fill.height)
			const none = { width: naturalWidth / decodedWidth, height: naturalHeight / decodedHeight }
			const drawnByFit: Record<string, Size | undefined> = {
				contain: { width: contain, height: contain },
				cover: { width: cover, height: cover },
				none,
				'scale-down': {
					width: Math.min(none.width, contain),
					height: Math.min(none.height, contain),
				},
			}
			const drawn = drawnByFit[objectFit] ?? fill
			scale = Math.max(
				scale,
				Math.max(drawn.width, drawn.height) * transformScale * settings.density,
			)
		}

		return Math.min(1, scale)
	}

	// The pixels of the bitmap drawn at a size, unless they can't be read, as
	// those of cross-origin images without CORS can't
	const draw = (
		bitmap: ImageBitmap,
		width: number,
		height: number,
	): undefined | { canvas: HTMLCanvasElement; pixels: Uint8ClampedArray } => {
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext('2d')
		if (context === null) {
			return undefined
		}

		context.imageSmoothingQuality = 'high'
		context.drawImage(bitmap, 0, 0, width, height)
		try {
			return { canvas, pixels: context.getImageData(0, 0, width, height).data }
		} catch {
			return undefined
		}
	}

	// The red, green, and blue values of opaque pixels, since JPEG has no alpha
	// and Chrome embeds the pixels of other formats as RGB
	const getOpaqueRgb = (data: Uint8ClampedArray): Uint8Array<ArrayBuffer> | undefined => {
		const rgb = new Uint8Array((data.length / 4) * 3)
		for (let source = 0, target = 0; source < data.length; source += 4, target += 3) {
			if (data[source + 3] !== 255) {
				return undefined
			}

			rgb[target] = data[source] ?? 0
			rgb[target + 1] = data[source + 1] ?? 0
			rgb[target + 2] = data[source + 2] ?? 0
		}

		return rgb
	}

	const getDeflatedSize = async (rgb: Uint8Array<ArrayBuffer>): Promise<number> => {
		const deflated = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))
		const deflatedData = await new Response(deflated).arrayBuffer()
		return deflatedData.byteLength
	}

	// A smaller encoding of the image than Chrome would embed, if any, as a data
	// URL, which needs no request and loads under any content security policy
	// that allows images from data URLs. Chrome encodes for toBlob() and
	// convertToBlob() in idle time, which can keep each image waiting a second,
	// while toDataURL() encodes at once.
	const chooseReplacement = async (
		bitmap: ImageBitmap,
		file: ImageFile,
		printed: { canvas: HTMLCanvasElement; rgb: Uint8Array<ArrayBuffer>; scale: number },
	): Promise<string | undefined> => {
		const jpeg = printed.canvas.toDataURL('image/jpeg', settings.jpegQuality)
		outcome.jpegBytes = readDataUrl(jpeg).size
		// Chrome embeds JPEG data as it is, so only a smaller one helps
		const isJpeg = file.header[0] === 0xff && file.header[1] === 0xd8 && file.header[2] === 0xff
		if (isJpeg) {
			return printed.scale < 1 && outcome.jpegBytes < file.size ? jpeg : undefined
		}

		// And every other format as deflated pixels
		outcome.deflatedBytes = await getDeflatedSize(printed.rgb)
		if (outcome.jpegBytes <= outcome.deflatedBytes * settings.jpegMaxSizeRatio) {
			return jpeg
		}

		// Other images stay lossless, and downsample only when they have more
		// pixels than print needs
		if (printed.scale === 1 || bitmap.width * bitmap.height > settings.maxCanvasPixels) {
			return undefined
		}

		// And when their fewer pixels deflate clearly smaller, which resampling
		// can prevent by smoothing the sharp edges of a crisp graphic into more
		// colors
		const original = draw(bitmap, bitmap.width, bitmap.height)
		const originalRgb = original === undefined ? undefined : getOpaqueRgb(original.pixels)
		if (originalRgb === undefined) {
			return undefined
		}

		outcome.originalDeflatedBytes = await getDeflatedSize(originalRgb)
		return outcome.deflatedBytes <= outcome.originalDeflatedBytes * settings.downsampleMaxSizeRatio
			? printed.canvas.toDataURL('image/png')
			: undefined
	}

	// Points every use to the replacement, keeping its box, and keeps a way back
	const replaceSources = (url: string): void => {
		for (const use of group.uses) {
			const { element } = use
			// Every source of a picture and the image itself point to the
			// replacement rather than going away, since selectors match them, such
			// as the spacing rules between siblings
			const sources =
				element.parentElement instanceof HTMLPictureElement
					? [...element.parentElement.children].filter(
							(child) => child instanceof HTMLSourceElement && child.hasAttribute('srcset'),
						)
					: []
			const originals = [
				...sources.map((source) => [source, 'srcset', source.getAttribute('srcset')] as const),
				[element, 'src', element.getAttribute('src')] as const,
				[element, 'srcset', element.getAttribute('srcset')] as const,
				[element, 'style', element.getAttribute('style')] as const,
			]
			use.restore = () => {
				for (const [target, name, value] of originals) {
					if (value === null) {
						target.removeAttribute(name)
						continue
					}

					target.setAttribute(name, value)
				}
			}

			for (const target of [...sources, element]) {
				if (target.hasAttribute('srcset')) {
					target.setAttribute('srcset', url)
				}
			}

			// Chrome defers only the first load of a lazy image, so the replacement
			// loads even far from the viewport
			element.setAttribute('src', url)

			// A box measured at another width than the CSS page size would be wrong
			// in print, so the replacement keeps the pixels, and so the natural size,
			// of sources of density 1 instead
			if (settings.cssPageSize) {
				continue
			}

			element.style.setProperty('box-sizing', 'content-box', 'important')
			element.style.setProperty('width', `${use.content.width}px`, 'important')
			element.style.setProperty('height', `${use.content.height}px`, 'important')
		}
	}

	const restoreSources = async (): Promise<void> => {
		for (const use of group.uses) {
			use.restore?.()
			use.restore = undefined
		}

		await Promise.allSettled(group.uses.map(async ({ element }) => withTimeout(element.decode())))
	}

	// Every image replaced so far, this one included, keeps its place, and the
	// document its height, or this replacement moved something
	const isLayoutUnchanged = (): boolean =>
		document.documentElement.scrollHeight === plan.documentHeight &&
		plan.groups
			.flatMap(({ uses }) => uses)
			.filter(({ restore }) => restore !== undefined)
			.every(({ element, rect }) => {
				const current = element.getBoundingClientRect()
				return (
					current.top + window.scrollY === rect.top &&
					current.left + window.scrollX === rect.left &&
					current.width === rect.width &&
					current.height === rect.height
				)
			})

	const file = await readFile()
	const [firstUse] = group.uses
	if (file === undefined || firstUse === undefined) {
		return outcome
	}

	outcome.originalBytes = file.size
	if (
		file.type.includes('svg') ||
		new TextDecoder().decode(file.header).trimStart().startsWith('<')
	) {
		outcome.kind = 'vector'
		return outcome
	}

	let bitmap: ImageBitmap
	try {
		// The pixels that the page shows, in their orientation and colors, which
		// another download of the file might not hold
		bitmap = await withTimeout(createImageBitmap(firstUse.element))
	} catch {
		return outcome
	}

	try {
		outcome.decodedHeight = bitmap.height
		outcome.decodedWidth = bitmap.width

		// On pages sized in CSS, the replacement keeps the pixels of the image, and
		// so its natural size only for sources of density 1. A page of another
		// width than the measured layout could show the difference.
		const keepsNaturalSize = group.uses.every(
			({ naturalWidth, naturalHeight }) =>
				naturalWidth === bitmap.width && naturalHeight === bitmap.height,
		)
		if (!keepsNaturalSize && settings.cssPageSize) {
			outcome.kind = 'layout'
			return outcome
		}

		const scale = getPrintScale(bitmap.width, bitmap.height)
		outcome.encodedWidth = Math.max(1, Math.round(bitmap.width * scale))
		outcome.encodedHeight = Math.max(1, Math.round(bitmap.height * scale))
		if (outcome.encodedWidth * outcome.encodedHeight > settings.maxCanvasPixels) {
			outcome.kind = 'kept'
			return outcome
		}

		// Object-fit none and scale-down draw an image at its natural size, which
		// a replacement of other pixels would change
		const keepsDrawnSize = group.uses.every(
			({ naturalHeight, naturalWidth, objectFit }) =>
				(objectFit !== 'none' && objectFit !== 'scale-down') ||
				(naturalWidth === outcome.encodedWidth && naturalHeight === outcome.encodedHeight),
		)
		if (!keepsDrawnSize) {
			outcome.kind = 'layout'
			return outcome
		}

		const drawn = draw(bitmap, outcome.encodedWidth, outcome.encodedHeight)
		if (drawn === undefined) {
			return outcome
		}

		const rgb = getOpaqueRgb(drawn.pixels)
		if (rgb === undefined) {
			outcome.kind = 'transparent'
			return outcome
		}

		const replacement = await chooseReplacement(bitmap, file, { canvas: drawn.canvas, rgb, scale })
		if (replacement === undefined) {
			outcome.kind = 'kept'
			return outcome
		}

		replaceSources(replacement)
		try {
			await Promise.all(group.uses.map(async ({ element }) => withTimeout(element.decode())))
		} catch {
			await restoreSources()
			return outcome
		}

		if (!isLayoutUnchanged()) {
			await restoreSources()
			outcome.kind = 'layout'
			return outcome
		}

		outcome.kind = replacement.startsWith('data:image/jpeg') ? 'jpeg' : 'lossless'
		outcome.replacementBytes = readDataUrl(replacement).size
		return outcome
	} finally {
		bitmap.close()
	}
}

function formatKilobytes(bytes: number): string {
	return `${Math.round(bytes / 1000).toLocaleString('en-US')} kB`
}

function describeOutcome(outcome: ImageOutcome): string {
	const size = `${outcome.decodedWidth}x${outcome.decodedHeight}`
	const resized =
		(outcome.kind !== 'jpeg' && outcome.kind !== 'lossless') ||
		outcome.encodedWidth === outcome.decodedWidth
			? size
			: `${size} to ${outcome.encodedWidth}x${outcome.encodedHeight}`
	const sizes = [
		['file', outcome.originalBytes],
		['original lossless', outcome.originalDeflatedBytes],
		['lossless', outcome.deflatedBytes],
		['JPEG', outcome.jpegBytes],
		['replacement', outcome.replacementBytes],
	] as const
	const bytes = sizes
		.filter(([, count]) => count > 0)
		.map(([label, count]) => `${label} ${formatKilobytes(count)}`)
	const details = [outcome.kind, ...(outcome.decodedWidth > 0 ? [resized] : []), ...bytes]
	return `Image ${outcome.source}: ${details.join(', ')}`
}

/**
 * Re-encodes the raster images of the document for print, since Chrome embeds
 * every format but JPEG as lossless pixels: photos become JPEG at no more than
 * 192 ppi at the size they print at, and graphics with more pixels than that
 * downsample to 192 ppi without loss when that deflates them to at most three
 * quarters of their size. Leaves images alone that JPEG can't represent or that
 * can't be read, such as SVGs, images with transparency, and cross-origin
 * images without CORS, and those that content-visibility: auto keeps from
 * rendering. Runs after every step that measures the layout, and keeps the
 * content box of every image, so the layout doesn't change. The printed size on
 * pages sized in CSS is unknown, so their images keep their pixels and only
 * change format.
 */
async function compressImages(page: Page, options: ResolvedOptions): Promise<void> {
	if (options.cssPageSize) {
		await page.emulateMediaType('print')
	} else {
		await emulatePrintLayout(page, getPrintLayout(options))
	}

	const settings: CompressionSettings = {
		cssPageSize: options.cssPageSize,
		density: PRINT_DENSITY,
		downsampleMaxSizeRatio: DOWNSAMPLE_MAX_SIZE_RATIO,
		jpegMaxSizeRatio: JPEG_MAX_SIZE_RATIO,
		jpegQuality: JPEG_QUALITY,
		maxCanvasPixels: MAX_CANVAS_PIXELS,
		timeoutMs: Math.min(IMAGE_TIMEOUT_MS, options.timeout / 6),
	}

	const [planError, plan] = await errorCatcher<JSHandle<ImagePlan>>(
		page.evaluateHandle(planImages, settings),
	)
	if (planError) {
		throw new ParsingError(
			"Couldn't find the images to re-encode for the `compress` option. Turn it off to save the PDF without re-encoding its images. The program aborts.",
			{ originalErrorMessage: planError.message },
		)
	}

	try {
		const { groupCount, skippedCount } = await plan.evaluate(({ groups, skippedCount }) => ({
			groupCount: groups.length,
			skippedCount,
		}))
		const counts = { jpeg: 0, lossless: 0 }
		for (let index = 0; index < groupCount; index++) {
			// Each image changes on its own, so one that fails leaves the others
			const [error, outcome] = await errorCatcher(
				page.evaluate(compressImageGroup, plan, index, settings),
			)
			if (error) {
				log.warn(`Couldn't re-encode an image, so it prints as it is: ${error.message}`)
				continue
			}

			log.debug(describeOutcome(outcome))
			if (outcome.kind === 'jpeg' || outcome.kind === 'lossless') {
				counts[outcome.kind] += 1
			}
		}

		if (groupCount > 0) {
			log.info(
				`Re-encoded ${counts.jpeg + counts.lossless} of ${groupCount} image(s) for print: ${counts.jpeg} as JPEG and ${counts.lossless} downsampled without loss.`,
			)
		}

		if (skippedCount > 0) {
			log.info(
				`${skippedCount} image(s) under content-visibility: auto don't render until printed, so they print as they are.`,
			)
		}
	} finally {
		await plan.dispose()
	}
}

export default compressImages
