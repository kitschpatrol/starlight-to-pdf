import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setLogger } from '../src/lib/log'
import pointLinksAtSite from '../src/lib/point-links-at-site'

const PAGE_URL = 'http://localhost:4321/docs/guides/page/'

const CONTENT = `
	<div><h1 id="_top">Page <a id="in-heading" href="/docs/">in Docs</a></h1></div>
	<div class="sl-markdown-content">
		<a id="relative" href="../other/">Other</a>
		<a id="absolute-path" href="/docs/setup/#install">Setup</a>
		<a id="same-origin" href="http://localhost:4321/docs/files/manual.pdf?v=2">Manual</a>
		<a id="fragment" href="#section">Section</a>
		<a id="external" href="https://other.example/page">Other site</a>
		<a id="email" href="mailto:info@example.com">Email</a>
		<div id="host"></div>
	</div>
	<a id="outside" href="/docs/outside/">Outside</a>
	<script>
		const link = document.createElement('a')
		link.id = 'shadow'
		link.setAttribute('href', '/docs/shadow/')
		document.querySelector('#host').attachShadow({ mode: 'open' }).append(link)
	</script>`

let browser: Browser

beforeAll(async () => {
	setLogger()
	// The fixtures are local markup, and Linux CI runners restrict the sandbox
	browser = await puppeteer.launch({ args: ['--no-sandbox'] })
}, 60_000)

afterAll(async () => {
	await browser.close()
})

/** Opens the content at the URL of a page on a local server. */
async function openFixture(head: string): Promise<Page> {
	const page = await browser.newPage()
	await page.setRequestInterception(true)
	page.on('request', (request) => {
		void request.respond({
			body:
				request.url() === PAGE_URL
					? `<!doctype html><html><head>${head}</head><body>${CONTENT}</body></html>`
					: '',
			contentType: 'text/html',
		})
	})
	await page.goto(PAGE_URL)
	return page
}

/** Lists the link targets as written, including the link in the shadow root. */
async function getHrefs(page: Page): Promise<string[]> {
	const hrefs = await page.$$eval('a', (links) =>
		links.map((link) => `${link.id}: ${link.getAttribute('href')}`),
	)
	const shadowHref = await page.$eval('#host >>> a', (link) => link.getAttribute('href'))
	return [...hrefs, `shadow: ${shadowHref}`]
}

describe('pointLinksAtSite', () => {
	it('should point links to the server of the page at the canonical site', async () => {
		const page = await openFixture(
			'<link rel="canonical" href="https://published.example/docs/guides/page/">',
		)

		await pointLinksAtSite(page)

		expect(await getHrefs(page)).toEqual([
			'in-heading: https://published.example/docs/',
			'relative: https://published.example/docs/guides/other/',
			'absolute-path: https://published.example/docs/setup/#install',
			'same-origin: https://published.example/docs/files/manual.pdf?v=2',
			'fragment: #section',
			'external: https://other.example/page',
			'email: mailto:info@example.com',
			// Not part of the content
			'outside: /docs/outside/',
			'shadow: https://published.example/docs/shadow/',
		])
	})

	it('should resolve links against the page when it names no canonical site', async () => {
		const page = await openFixture('')

		await pointLinksAtSite(page)

		expect(await getHrefs(page)).toEqual([
			'in-heading: http://localhost:4321/docs/',
			// The assembled document would resolve it against its base URL instead
			'relative: http://localhost:4321/docs/guides/other/',
			'absolute-path: http://localhost:4321/docs/setup/#install',
			'same-origin: http://localhost:4321/docs/files/manual.pdf?v=2',
			'fragment: #section',
			'external: https://other.example/page',
			'email: mailto:info@example.com',
			'outside: /docs/outside/',
			'shadow: http://localhost:4321/docs/shadow/',
		])
	})
})
