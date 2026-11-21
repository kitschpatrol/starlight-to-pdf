import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const cliPath = path.resolve(import.meta.dirname, '../dist/bin/cli.js')

/**
 * Encodes noise over gradients as a PNG file, which looks like a photo to the
 * compression and so becomes JPEG.
 */
function createPhotoPng(width: number, height: number): Uint8Array {
	const toChunk = (type: string, data: Uint8Array): Uint8Array => {
		const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data])
		const chunk = Buffer.alloc(typeAndData.length + 8)
		chunk.writeUInt32BE(data.length, 0)
		typeAndData.copy(chunk, 4)
		chunk.writeUInt32BE(crc32(typeAndData), typeAndData.length + 4)
		return chunk
	}

	// Width, height, 8 bits per channel, and RGB
	const header = Buffer.alloc(13)
	header.writeUInt32BE(width, 0)
	header.writeUInt32BE(height, 4)
	header.writeUInt8(8, 8)
	header.writeUInt8(2, 9)

	// Each row starts with a filter byte of 0, and a fixed seed keeps the noise the same
	let seed = 1
	const rowLength = width * 3 + 1
	const pixels = Buffer.alloc(rowLength * height)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
			const noise = (seed / 2_147_483_648) * 48
			const index = y * rowLength + 1 + x * 3
			pixels[index] = 140 + (x / width) * 60 + noise
			pixels[index + 1] = 60 + (y / height) * 60 + noise
			pixels[index + 2] = 30 + noise
		}
	}

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		toChunk('IHDR', header),
		toChunk('IDAT', deflateSync(pixels)),
		toChunk('IEND', Buffer.alloc(0)),
	])
}

/** A site of two docs pages, the first linking to the next as Starlight does. */
const SITE_FILES = new Map<string, string | Uint8Array>([
	[
		'/',
		'<!doctype html><title>Docs</title><div><h1 id="_top">One</h1></div><div class="sl-markdown-content"><p>First page.</p><img src="/photo.png" style="width: 200px"></div><a rel="next" href="/two/">Two</a>',
	],
	['/photo.png', createPhotoPng(400, 300)],
	[
		'/two/',
		'<!doctype html><title>Docs</title><div><h1 id="_top">Two</h1></div><div class="sl-markdown-content"><p>Second page.</p></div>',
	],
])

async function run(...args: string[]): Promise<{ code: number; stderr: string; stdout: string }> {
	return new Promise((resolve, reject) => {
		execFile('node', [cliPath, ...args], (error, stdout, stderr) => {
			if (error && error.code === undefined) {
				reject(new Error(error.message))
				return
			}

			resolve({ code: typeof error?.code === 'number' ? error.code : 0, stderr, stdout })
		})
	})
}

const VERSION_REGEX = /\d+\.\d+\.\d+/v
describe('cli', () => {
	it('should print version with --version', async () => {
		const { code, stdout } = await run('--version')
		expect(code).toBe(0)
		expect(stdout.trim()).toMatch(VERSION_REGEX)
	})

	it('should print help with --help', async () => {
		const { code, stdout } = await run('--help')
		expect(code).toBe(0)
		expect(stdout).toContain('--help')
		expect(stdout).toContain('--pdf-outline')
		expect(stdout).toContain('--contents-links')
	})

	it('should offer further compression of images, off by default', async () => {
		const { stdout } = await run('--help')
		const compressLine = stdout
			.split('\n')
			.find((line) => line.trimStart().startsWith('--compress'))
		expect(compressLine).toContain('[boolean] [default: false]')
	})

	it('should compress every PDF and re-encode its photos with --compress', async () => {
		const server = createServer((request, response) => {
			const file = SITE_FILES.get(request.url ?? '')
			response.writeHead(file === undefined ? 404 : 200, {
				'content-type': request.url?.endsWith('.png') ? 'image/png' : 'text/html',
			})
			response.end(file ?? 'Not found')
		})
		await new Promise<void>((resolve) => {
			server.listen(0, '127.0.0.1', resolve)
		})
		const address = server.address()
		const directory = await mkdtemp(path.join(tmpdir(), 'starlight-to-pdf-cli-'))
		try {
			if (address === null || typeof address === 'string') {
				throw new Error('The fixture server has no port')
			}

			// The fixtures are local markup, and Linux CI runners restrict the sandbox
			const options = ['--browser-no-sandbox', '--path', directory]
			const url = `http://127.0.0.1:${address.port}/`
			const plain = await run(url, ...options, '--filename', 'plain')
			// Before the URL, which a flag that takes a value would swallow
			const compressed = await run('--compress', url, ...options, '--filename', 'compressed')
			expect(plain.code).toBe(0)
			expect(compressed.code).toBe(0)

			const plainPdf = await readFile(path.join(directory, 'plain.pdf'))
			const compressedPdf = await readFile(path.join(directory, 'compressed.pdf'))
			// Chrome writes PDF 1.4, and the object streams of compression take 1.5
			expect(plainPdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.5')
			expect(compressedPdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.5')
			// The photo becomes JPEG only with --compress
			expect(plainPdf.includes('/DCTDecode')).toBe(false)
			expect(compressedPdf.includes('/DCTDecode')).toBe(true)
		} finally {
			server.close()
			await rm(directory, { force: true, recursive: true })
		}
	}, 120_000)

	it('should fail without a url', async () => {
		const { code, stderr } = await run()
		expect(code).toBe(1)
		expect(stderr).toContain('Not enough non-option arguments')
	})

	it('should fail on unknown flags', async () => {
		const { code, stderr } = await run('https://example.com', '--bogus-flag')
		expect(code).toBe(1)
		expect(stderr).toContain('bogus-flag')
	})

	it('should fail on invalid margins', async () => {
		const { code, stderr } = await run('https://example.com', '--margins', '1cm 1cm')
		expect(code).toBe(1)
		expect(stderr).toContain('margins')
	})

	it('should fail on an invalid format', async () => {
		const { code, stderr } = await run('https://example.com', '--format', 'a9')
		expect(code).toBe(1)
		expect(stderr).toContain('format')
	})

	it('should fail on an uppercase format', async () => {
		const { code, stderr } = await run('https://example.com', '--format', 'A4')
		expect(code).toBe(1)
		expect(stderr).toContain('format')
	})
})
