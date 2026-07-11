#!/usr/bin/env node

import { log, setDefaultLogOptions } from 'lognow'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import type { StarlightToPdfOptions } from './lib/types'
import { bin, version } from '../package.json' with { type: 'json' }
import {
	parseBaseUrl,
	parseMargins,
	parsePaperFormat,
	resolveExcludeUrls,
	resolveLastUrl,
	validateFileExtension,
	validateFilename,
	validateMilliseconds,
	validatePath,
	validateSpacing,
} from './lib/cli-helpers'
import { DEFAULT_MARGINS, SCROLL_DELAY_MS, TIMEOUT_MS, WAIT_UNTIL_OPTIONS } from './lib/constants'
import { ParsingError, ValidationError } from './lib/errors'
import { starlightToPdf } from './lib/starlight-to-pdf'

const cliCommandName = Object.keys(bin).at(0) ?? 'starlight-to-pdf'

function handleError(error: unknown): never {
	if (error instanceof ValidationError || error instanceof ParsingError) {
		log.error(`${error.name}: ${error.message}`)
		if (error.additionalInfo?.originalErrorMessage !== undefined) {
			log.error(error.additionalInfo.originalErrorMessage)
		}
	} else {
		log.withError(error).error('Unknown error occurred.')
	}

	log.error('Program exits.')
	process.exit(1)
}

const yargsInstance = yargs(hideBin(process.argv))

await yargsInstance
	.scriptName(cliCommandName)
	.parserConfiguration({ 'greedy-arrays': false })
	.command(
		'$0 <url>',
		'Convert a Starlight documentation website to a PDF file.',
		(command) =>
			command
				.positional('url', {
					coerce: parseBaseUrl,
					describe: 'The URL of the Starlight powered documentation website to convert to PDF.',
					type: 'string',
				})
				.option('browser-executable', {
					coerce: (value: string) => validatePath(value, 'browser-executable'),
					describe:
						'Specifies a path to a browser executable to use instead of the default one (e.g. --browser-executable /usr/bin/chromium-browser).',
					type: 'string',
				})
				.option('browser-no-sandbox', {
					default: false,
					describe:
						'Adds the `--no-sandbox` and `--disable-setuid-sandbox` flags when launching the browser. Useful when running in environments where sandboxing is not available (e.g., certain CI/CD pipelines or Docker containers).',
					type: 'boolean',
				})
				.option('contents', {
					default: true,
					describe: 'Generate a table of contents in the PDF. Use --no-contents to disable it.',
					type: 'boolean',
				})
				.option('contents-links', {
					choices: ['external', 'internal'] as const,
					default: 'internal' as const,
					describe:
						"Specifies the type of links in the generated table of contents. Use 'internal' for links that navigate within the PDF file or 'external' for links that point to the documentation website.",
				})
				.option('contents-name', {
					describe: 'Customizes the generated table of contents name in the PDF.',
					type: 'string',
				})
				.option('css-page-size', {
					default: false,
					describe:
						"Allows setting the PDF page size using CSS `@page`. If the predefined sizes in the '--format' option don't meet your needs, enable this option and specify the desired page size in custom CSS provided via the '--styles' flag (e.g., `@page { size: 8.5in 14in; }`).",
					type: 'boolean',
				})
				.option('exclude', {
					alias: 'e',
					array: true,
					describe:
						"A string containing links separated by space that shouldn't be added to the resulting PDF file (e.g. --exclude '/docs/contacts /docs/demo'). You may also provide multiple values: -e /docs/contacts -e /docs/demo.",
					type: 'string',
				})
				.option('filename', {
					alias: 'f',
					coerce: validateFilename,
					describe: 'The output filename for the PDF. Default is the hostname of the provided URL.',
					type: 'string',
				})
				.option('following-html', {
					coerce: (value: string) => validateFileExtension(value, 'html', 'following-html'),
					describe:
						"Path to an HTML file which content will be inserted at the end of the PDF file. Its behavior is similar to the '--preceding-html' option.",
					type: 'string',
				})
				.option('footer', {
					coerce: (value: string) => validateFileExtension(value, 'html', 'footer'),
					describe:
						"Path to the HTML file for the PDF print footer. For more details, check the PDF header and footer section in the readme and Puppeteer's PDFOptions.",
					type: 'string',
				})
				.option('format', {
					coerce: parsePaperFormat,
					default: 'A4',
					describe:
						"The paper format (e.g., A4, Letter) for the PDF file. Refer to Puppeteer's paper formats for more details.",
					type: 'string',
				})
				.option('header', {
					coerce: (value: string) => validateFileExtension(value, 'html', 'header'),
					describe:
						"Path to the HTML file for the PDF print header. For more details, check the PDF header and footer section in the readme and Puppeteer's PDFOptions.",
					type: 'string',
				})
				.option('last', {
					alias: 'l',
					describe:
						'Sets the last link to parse (e.g. --last /docs/demo). Further parsing stops once this link is reached and parsed.',
					type: 'string',
				})
				.option('margins', {
					coerce: parseMargins,
					default: DEFAULT_MARGINS,
					describe:
						'Sets margins for the PDF file. Provide a string with 4 values separated by space, reflecting the top, right, bottom and left margins respectively.',
					type: 'string',
				})
				.option('paddings', {
					coerce: (value: string) => validateSpacing(value, 'paddings'),
					describe:
						'Sets padding for the PDF content. Provide as a string with 4 values separated by space, reflecting the top, right, bottom and left paddings respectively. Paddings are disabled by default.',
					type: 'string',
				})
				.option('page-wait-until', {
					choices: WAIT_UNTIL_OPTIONS,
					default: 'domcontentloaded' as const,
					describe: 'Specifies the event that indicates a successful page load.',
				})
				.option('path', {
					alias: 'p',
					coerce: (value: string) => validatePath(value, 'path'),
					describe:
						'Sets the directory path for the output PDF. Default is the current working directory.',
					type: 'string',
				})
				.option('pdf-outline', {
					default: false,
					describe:
						"Enables a side outline in the PDF file. It's an `outline` property in Puppeteer's PDFOptions.",
					type: 'boolean',
				})
				.option('preceding-html', {
					coerce: (value: string) => validateFileExtension(value, 'html', 'preceding-html'),
					describe:
						'Path to an HTML file which content will be inserted at the beginning of the PDF file. This option may be useful for adding a cover page.',
					type: 'string',
				})
				.option('print-bg', {
					default: false,
					describe:
						"Enables printing of background graphics. It's a `printBackground` property in Puppeteer's PDFOptions.",
					type: 'boolean',
				})
				.option('scroll-delay', {
					coerce: (value: number) =>
						validateMilliseconds(value, 'scroll-delay', { isNonNegative: true }),
					default: SCROLL_DELAY_MS,
					describe:
						'Specifies the delay (in milliseconds) between each viewport scroll to allow lazy-loaded content to fully render.',
					type: 'number',
				})
				.option('starlight-print-css', {
					default: true,
					describe:
						"Applies the default `@media print` CSS styles from Starlight. Use --no-starlight-print-css to retain the website's original colors when printing.",
					type: 'boolean',
				})
				.option('styles', {
					coerce: (value: string) => validateFileExtension(value, 'css', 'styles'),
					describe:
						'Path to a CSS file for custom PDF styles. The styles are injected into the `<style>` tag inside the `<body>` element. Also check the readme for a list of special CSS classes used by the tool.',
					type: 'string',
				})
				.option('timeout', {
					coerce: (value: number) =>
						validateMilliseconds(value, 'timeout', { isNonNegative: false }),
					default: TIMEOUT_MS,
					describe:
						'Timeout for both the page actions and `protocolTimeout` in milliseconds. You may need to increase this value for parsing large websites.',
					type: 'number',
				})
				.option('verbose', {
					default: false,
					describe: 'Run with verbose logging.',
					type: 'boolean',
				}),
		async (argv) => {
			try {
				const { url } = argv
				if (url === undefined) {
					throw new ValidationError('URL for parsing is required.')
				}

				const options: StarlightToPdfOptions = {
					browserExecutable: argv.browserExecutable,
					browserNoSandbox: argv.browserNoSandbox,
					contents: argv.contents,
					contentsLinks: argv.contentsLinks,
					contentsName: argv.contentsName,
					cssPageSize: argv.cssPageSize,
					exclude:
						argv.exclude === undefined ? undefined : resolveExcludeUrls(argv.exclude, url.origin),
					filename: argv.filename,
					followingHtml: argv.followingHtml,
					footer: argv.footer,
					format: argv.format,
					header: argv.header,
					last: argv.last === undefined ? undefined : resolveLastUrl(argv.last, url.origin),
					margins: argv.margins,
					paddings: argv.paddings,
					pageWaitUntil: argv.pageWaitUntil,
					path: argv.path,
					pdfOutline: argv.pdfOutline,
					precedingHtml: argv.precedingHtml,
					printBg: argv.printBg,
					scrollDelay: argv.scrollDelay,
					starlightPrintCss: argv.starlightPrintCss,
					styles: argv.styles,
					timeout: argv.timeout,
					url,
				}

				await starlightToPdf(options)
			} catch (error) {
				handleError(error)
			}
		},
	)
	.middleware((argv) => {
		// Set log level globally based on verbose flag
		setDefaultLogOptions({ verbose: Boolean(argv.verbose) })
	})
	.alias('h', 'help')
	.version(version)
	.alias('v', 'version')
	.help()
	.strict()
	.wrap(process.stdout.isTTY ? Math.min(120, yargsInstance.terminalWidth()) : 0)
	.parse()
