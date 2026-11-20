<!-- title -->

# @kitschpatrol/starlight-to-pdf

<!-- /title -->

<!-- badges -->

[![NPM Package @kitschpatrol/starlight-to-pdf](https://img.shields.io/npm/v/@kitschpatrol/starlight-to-pdf.svg)](https://www.npmjs.com/package/@kitschpatrol/starlight-to-pdf)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/mit)
[![CI](https://github.com/kitschpatrol/starlight-to-pdf/actions/workflows/ci.yml/badge.svg)](https://github.com/kitschpatrol/starlight-to-pdf/actions/workflows/ci.yml)
[![Homebrew](https://img.shields.io/badge/Homebrew-kitschpatrol%2Ftap%2Fstarlight--to--pdf-FBB040?logo=homebrew&logoColor=white)](https://github.com/kitschpatrol/homebrew-tap/blob/HEAD/Formula/starlight-to-pdf.rb)

<!-- /badges -->

<!-- short-description -->

**CLI tool and TypeScript library to convert Starlight documentation websites into PDF files.**

<!-- /short-description -->

## Overview

`@kitschpatrol/starlight-to-pdf` crawls a documentation website built with [Starlight](https://starlight.astro.build) and renders it into a single PDF file, complete with a generated table of contents with page numbers, optional cover and back pages, a running header and footer with page numbers, a PDF outline, and customizable margins and styles.

This is a fork of [Linkerin/starlight-to-pdf](https://github.com/Linkerin/starlight-to-pdf) by Alexei Gusev, which adds a few new features and reworks the project structure a bit to address some matters of preference.

Stylistic and functional changes include:

- Expose a TypeScript API alongside the CLI
- Automatically detect and correctly crawl sites that use the [starlight-sidebar-topics](https://github.com/HiDeoo/starlight-sidebar-topics) plugin
- Add `--browser-no-sandbox` flag for compatibility with certain environments
- Add experimental `--dynamic-page-height` flag that lets page content drive the final page height
- Carry every page's styles into the PDF, adapt diagrams, canvases, tables, and grids for print, and keep headings and cards from splitting across pages
- Add cover and back pages, and replace the Puppeteer header and footer templates with a running header and footer in the site's font
- Number the pages of the table of contents and set it in up to two columns
- Link videos, audio, and embedded video players, which can't play on paper, to their section on the website (`--media-links`)
- Point internal links straight at their page, so they keep working after PDF tools such as compressors drop named destinations
- Change `--contents-links` default to `internal`
- Change `--format` default to `letter`
- Change `--margins` default to `2cm 1.5cm 2cm 1.5cm`, which leaves room for the header and footer
- Turn on `--pdf-outline` by default
- Fix `--exclude` and `--last` matching on sites built without trailing slashes
- Relax path validation so Windows-style absolute paths are accepted
- Reject path separators in `--filename` and negative `--timeout` values
- Stop crawling with a warning if pagination links form a loop
- Drop the `--url` and `-u` argument flags in favor of a strict positional
- Use Node + PNPM instead of Bun

## Getting started

<!-- dependencies -->

### Dependencies

- [Node.js](https://nodejs.org/) 24.16.0 or newer (specifically `^24.16.0 || >=26.3.0`)
- [puppeteer](https://www.npmjs.com/package/puppeteer) `^25.3.0` _(peer dependency)_
- [puppeteer-autoscroll-down](https://www.npmjs.com/package/puppeteer-autoscroll-down) `^2.0.1` _(peer dependency)_

<!-- /dependencies -->

The tool also needs Chrome or Chromium. [Puppeteer](https://pptr.dev) downloads a compatible Chrome for Testing build by default. To use an existing browser instead, pass its path via the `--browser-executable` flag.

And, of course, you'll need an Astro Starlight project served either locally or remotely that you want to PDF-ify.

### Installation

Pick the option that matches how you plan to use it.

#### CLI

Run it once without installing:

```sh
npx @kitschpatrol/starlight-to-pdf https://starlight.astro.build
```

Or install it globally with Homebrew:

```sh
brew install kitschpatrol/tap/starlight-to-pdf
```

Or install it globally with npm:

```sh
npm install --global @kitschpatrol/starlight-to-pdf
```

#### Library

Add it to your project, along with the `puppeteer` and `puppeteer-autoscroll-down` peer dependencies, to import the TypeScript API. This also puts the `starlight-to-pdf` CLI on your project's path:

```sh
npm install @kitschpatrol/starlight-to-pdf puppeteer puppeteer-autoscroll-down
```

## Usage

Pass the URL of a Starlight site as the only required argument:

```sh
starlight-to-pdf https://starlight.astro.build
```

The resulting PDF is saved to the current working directory, named after the site's hostname. Sites using the starlight-sidebar-topics plugin are detected automatically, and every topic is included.

### CLI

<!-- cli-help({ heading: false, headingLevel: 3 }) -->

#### Command: `starlight-to-pdf`

Convert a Starlight documentation website to a PDF file.

Usage:

```txt
starlight-to-pdf <url>
```

| Positional Argument | Description                                                               | Type     |
| ------------------- | ------------------------------------------------------------------------- | -------- |
| `url`               | The URL of the Starlight powered documentation website to convert to PDF. | `string` |

| Option                  | Description                                                                                                                                                                                                                                                            | Type                                                                                         | Default               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| `--about`               | Adds a back page with this text, such as a description of the project. Blank lines separate paragraphs.                                                                                                                                                                | `string`                                                                                     |                       |
| `--author`              | Author shown on the cover page, such as a person or an organization.                                                                                                                                                                                                   | `string`                                                                                     |                       |
| `--browser-executable`  | Specifies a path to a browser executable to use instead of the default one (e.g. --browser-executable /usr/bin/chromium-browser).                                                                                                                                      | `string`                                                                                     |                       |
| `--browser-no-sandbox`  | Adds the `--no-sandbox` and `--disable-setuid-sandbox` flags when launching the browser. Useful when running in environments where sandboxing is not available (e.g., certain CI/CD pipelines or Docker containers).                                                   | `boolean`                                                                                    | `false`               |
| `--contact`             | Adds a back page with these contact details. Blank lines separate paragraphs, and line breaks are kept.                                                                                                                                                                | `string`                                                                                     |                       |
| `--contents`            | Generate a table of contents with page numbers in the PDF. Use --no-contents to disable it.                                                                                                                                                                            | `boolean`                                                                                    | `true`                |
| `--contents-links`      | Specifies the type of links in the generated table of contents. Use 'internal' for links that navigate within the PDF file or 'external' for links that point to the documentation website, which leaves out the page numbers.                                         | `"external"` `"internal"`                                                                    | `"internal"`          |
| `--contents-name`       | Customizes the generated table of contents name in the PDF.                                                                                                                                                                                                            | `string`                                                                                     |                       |
| `--cover`               | Adds a cover page with the title, subtitle, author, revision, and date.                                                                                                                                                                                                | `boolean`                                                                                    | `false`               |
| `--css-page-size`       | Allows setting the PDF page size using CSS `@page`. If the predefined sizes in the '--format' option don't meet your needs, enable this option and specify the desired page size in custom CSS provided via the '--styles' flag (e.g., `@page { size: 8.5in 14in; }`). | `boolean`                                                                                    | `false`               |
| `--date`                | Date shown on the cover and back pages and in the footer. Defaults to today's date, formatted for the language of the site. Pass an empty string to leave it out.                                                                                                      | `string`                                                                                     |                       |
| `--dynamic-page-height` | Experimental: sizes each PDF page individually so every docs page fits on a single page without breaks — constant width taken from '--format', height as tall as the content requires. Cannot be combined with '--css-page-size'.                                      | `boolean`                                                                                    | `false`               |
| `--exclude`<br>`-e`     | A string containing links separated by space that shouldn't be added to the resulting PDF file (e.g. --exclude '/docs/contacts /docs/demo'). You may also provide multiple values: -e /docs/contacts -e /docs/demo.                                                    | `array`                                                                                      |                       |
| `--filename`<br>`-f`    | The output filename for the PDF. Default is the hostname of the provided URL.                                                                                                                                                                                          | `string`                                                                                     |                       |
| `--following-html`      | Path to an HTML file which content will be inserted at the end of the PDF file. Its behavior is similar to the '--preceding-html' option.                                                                                                                              | `string`                                                                                     |                       |
| `--footer`              | Adds a footer with the revision, date, and page numbers to every page except the cover and back pages, and the title without a header. Needs bottom margins to print in.                                                                                               | `boolean`                                                                                    | `false`               |
| `--format`              | The paper format for the PDF file. Refer to Puppeteer's paper formats for more details.                                                                                                                                                                                | `"a0"` `"a1"` `"a2"` `"a3"` `"a4"` `"a5"` `"a6"` `"ledger"` `"legal"` `"letter"` `"tabloid"` | `"letter"`            |
| `--header`              | Adds a header with the title of the document and of the current docs page to every page except the cover and back pages. Needs top margins to print in.                                                                                                                | `boolean`                                                                                    | `false`               |
| `--last`<br>`-l`        | Sets the last link to parse (e.g. --last /docs/demo). Further parsing stops once this link is reached and parsed.                                                                                                                                                      | `string`                                                                                     |                       |
| `--margins`             | Sets margins for the PDF file. Provide a string with 4 values separated by space, reflecting the top, right, bottom and left margins respectively.                                                                                                                     | `string`                                                                                     | "2cm 1.5cm 2cm 1.5cm" |
| `--media-links`         | Links videos, audio, and embedded video players, which cannot play on paper, to their section on the website, and shows a play badge on each video. Use --no-media-links to disable it.                                                                                | `boolean`                                                                                    | `true`                |
| `--notice`              | Adds a back page with this notice, such as a confidentiality or copyright notice. Blank lines separate paragraphs.                                                                                                                                                     | `string`                                                                                     |                       |
| `--paddings`            | Sets padding for the PDF content. Provide as a string with 4 values separated by space, reflecting the top, right, bottom and left paddings respectively. Paddings are disabled by default.                                                                            | `string`                                                                                     |                       |
| `--page-wait-until`     | Specifies the event that indicates a successful page load.                                                                                                                                                                                                             | `"load"` `"domcontentloaded"` `"networkidle0"` `"networkidle2"`                              | `"domcontentloaded"`  |
| `--path`<br>`-p`        | Sets the directory path for the output PDF. Default is the current working directory.                                                                                                                                                                                  | `string`                                                                                     |                       |
| `--pdf-outline`         | Adds an outline of the headings to the PDF file, which PDF viewers show as bookmarks. Use --no-pdf-outline to disable it.                                                                                                                                              | `boolean`                                                                                    | `true`                |
| `--preceding-html`      | Path to an HTML file which content will be inserted at the beginning of the PDF file. This option may be useful for adding a cover page.                                                                                                                               | `string`                                                                                     |                       |
| `--print-bg`            | Enables printing of background graphics. It's a `printBackground` property in Puppeteer's PDFOptions.                                                                                                                                                                  | `boolean`                                                                                    | `false`               |
| `--revision`            | Revision shown on the cover and back pages and in the footer, such as 'Version 1.2.0'.                                                                                                                                                                                 | `string`                                                                                     |                       |
| `--scroll-delay`        | Specifies the delay (in milliseconds) between each viewport scroll to allow lazy-loaded content to fully render.                                                                                                                                                       | `number`                                                                                     | `100`                 |
| `--starlight-print-css` | Applies the default `@media print` CSS styles from Starlight. Use --no-starlight-print-css to retain the website's original colors when printing.                                                                                                                      | `boolean`                                                                                    | `true`                |
| `--styles`              | Path to a CSS file for custom PDF styles. The styles are injected into the `<style>` tag inside the `<body>` element. Also check the readme for a list of special CSS classes used by the tool.                                                                        | `string`                                                                                     |                       |
| `--subtitle`            | Subtitle shown on the cover page.                                                                                                                                                                                                                                      | `string`                                                                                     |                       |
| `--timeout`             | Timeout for both the page actions and `protocolTimeout` in milliseconds. You may need to increase this value for parsing large websites.                                                                                                                               | `number`                                                                                     | `180000`              |
| `--title`               | Title of the document, shown on the cover and back pages and in the header, and stored as the PDF title. Defaults to the title of the site.                                                                                                                            | `string`                                                                                     |                       |
| `--verbose`             | Run with verbose logging.                                                                                                                                                                                                                                              | `boolean`                                                                                    | `false`               |
| `--help`<br>`-h`        | Show help                                                                                                                                                                                                                                                              | `boolean`                                                                                    |                       |
| `--version`<br>`-v`     | Show version number                                                                                                                                                                                                                                                    | `boolean`                                                                                    |                       |

<!-- /cli-help -->

### Examples

A conversion exercising most of the options:

```sh
starlight-to-pdf spectrum.snipshot.dev -p ./output --filename spectrum-docs --contents-name "Table of contents" --exclude '/demo /contacts' --cover --subtitle 'Library documentation' --header --footer --notice 'Spectrum is released under the MIT License.' --print-bg
```

Resulting PDF file: [spectrum-docs.pdf](./assets/spectrum-docs.pdf)

#### Special CSS classes

Custom styles passed via the `--styles` flag can target classes the tool assigns while assembling the document:

- `.s2pdf-back-page` - The back page.
- `.s2pdf-container` - The wrapper around all the website parsed content _(excluding the table of contents)_.
- `.s2pdf-contents` - The wrapper around the generated table of contents heading and list.
- `.s2pdf-contents-page` - The page number of an entry in the table of contents.
- `.s2pdf-contents-title` - The title of an entry in the table of contents.
- `.s2pdf-cover` - The cover page. Pages with other elements that have this class print without header and footer, too.
- `.s2pdf-heading` - The element that contains `<h1>` headings of each page.
- `.s2pdf-media` - The link that wraps each video and embedded video player.
- `.s2pdf-media-badge` - The play badge over each video.
- `.s2pdf-media-link` - The caption below each audio element, with a link to it on the website.
- `.s2pdf-pagebreak` - Each page text content with a defined CSS `break-after: page` property.

#### Cover, back page, header, and footer

`--cover` adds a cover page with the title, subtitle, author, revision, and date of the document. The title defaults to the title of the site, and the date to today's date in the language of the site, so `--title` and `--date` are only needed to change them. Setting any of `--about`, `--contact`, or `--notice` adds a back page with that text, such as a description of the project, contact details, and a confidentiality notice. Blank lines separate paragraphs.

`--header` prints the title of the document and of the current docs page at the top of every page, such as "Spectrum API Docs · Getting started", and `--footer` prints the revision, the date, and page numbers at the bottom. Without a header, the footer prints the title of the document too. They print in the font of the site, inside the page margins, which leave room for them by default.

The cover and back pages print without header and footer. To print your own cover from `--preceding-html` without them, give it the `s2pdf-cover` and `s2pdf-pagebreak` classes.

### Library

The package also exports its functionality as a TypeScript API.

#### API

Call `starlightToPdf`:

```ts
import { starlightToPdf } from '@kitschpatrol/starlight-to-pdf'

const result = await starlightToPdf({
  filename: 'starlight-docs',
  format: 'a4',
  url: 'https://starlight.astro.build',
})

console.log(`Wrote ${result.pages} pages to ${result.path} in ${result.timeSeconds}s`)
```

Only `url` is required. The options mirror the CLI flags in camelCase and share their defaults, which are also exported as `DEFAULT_STARLIGHT_TO_PDF_OPTIONS`. See the `StarlightToPdfOptions` type for details. Invalid option values throw a `ValidationError`, and crawling or rendering failures throw a `ParsingError` — both are exported.

#### Generating a PDF during local development

To generate a PDF file during local development, you can write a short script that combines Astro's [programmatic API](https://docs.astro.build/en/reference/programmatic-reference/) with a call to `starlightToPdf`:

```ts
// ./scripts/pdf.ts
import { starlightToPdf } from '@kitschpatrol/starlight-to-pdf'
import { build, preview } from 'astro'

// Build Starlight site
await build({})

// Start Astro Preview server
const server = await preview({})

// Export to PDF
const result = await starlightToPdf({
  filename: 'starlight-docs',
  url: `http://${server.host}:${server.port}`,
})

console.log(`Wrote ${result.pages} pages to ${result.path} in ${result.timeSeconds}s`)

// Clean up server
await server.stop()
```

You can then add a command like the following to your Starlight project's `package.json`:

```jsonc
{
  "scripts": {
    "pdf": "tsx ./scripts/pdf.ts",
  },
}
```

#### Logging

By default, the library logs progress to the console via [lognow](https://github.com/kitschpatrol/lognow). Use `setLogger` to redirect logging to your own logger — it accepts any Console-like object or [LogLayer](https://loglayer.dev) instance:

```ts
import { setLogger } from '@kitschpatrol/starlight-to-pdf'

// Redirect library logging to your own logger
setLogger(console)

// Or call with no arguments to silence library logging entirely
setLogger()
```

## Background

### Implementation notes

- The crawler loads the given URL and searches for the first page with a pagination link or a topics navigation, then either follows the `rel="next"` chain (plain Starlight sites) or visits each topic and collects the links of its sidebar in order (starlight-sidebar-topics sites).
- Topic entries that link to other domains are skipped, and all flags work as usual.
- The parsed pages are assembled into a single document for printing. It includes the stylesheets of every page, since Astro bundles CSS per page, and the content of open shadow roots, such as those of web components.
- Before printing, the tool adapts the document for paper: collapsed `<details>` elements are expanded, canvases, such as charts, are captured as images at twice their pixel density (WebGL canvases can't be read and print blank), fixed-position elements in the docs content are hidden, and headings, table rows, and grid items that span several rows are kept from splitting across pages. With a page size from `--format`, table cells wrap only between words where the table fits the page, images and diagrams taller than a page are scaled down to fit on one page, together with their caption and the headings right before them, and boxes with a border or shadow that fit on a page, such as cards and callouts, are kept on one page.
- Text prints at the size the site sets for print. Starlight's 16px for screens reads large on paper, so set a print size in the site's styles, such as `@media print { :root { font-size: 11pt; } }`, or pass `:root { font-size: 11pt; }` in a file with `--styles`. Starlight sizes headings and spacing relative to the root font size, so they scale along.
- Videos, audio, and embedded YouTube and Vimeo players can't play on paper, so each links to its section on the website. Videos and players link from their frame, and videos print their current frame, or else their poster, with a play badge over it. Audio prints no player, so it gets a caption with the link instead. The links use the canonical URL of each page, so they point to the published site even when the PDF is made from a local server. `--no-media-links` turns this off.
- Chrome doesn't render page numbers of link targets in CSS, so the tool renders the PDF twice to number the table of contents: the first rendering tells which page each entry starts on, and the second prints the numbers. Each number has a fixed width, so filling them in moves nothing to another page.
- Chrome writes internal links, such as those of the table of contents, as links to named destinations, which PDF tools such as compressors can remove from the document. The tool points these links straight at their page instead, so they keep working in every PDF viewer.
- Content rendered by client-side scripts, such as a component that fetches data, might not be ready when a page's `domcontentloaded` event fires. Pass `--page-wait-until networkidle0` to wait for it.
- Relative to upstream, this fork migrates the runtime from [Bun](https://bun.sh) to [Node.js](https://nodejs.org), the CLI to [yargs](https://yargs.js.org), logging to [lognow](https://github.com/kitschpatrol/lognow), bundling to [tsdown](https://tsdown.dev), and linting and formatting to [@kitschpatrol/shared-config](https://github.com/kitschpatrol/shared-config). It also drops the progress spinner in favor of plain log output, as suggested in [Linkerin/starlight-to-pdf#13](https://github.com/Linkerin/starlight-to-pdf/issues/13).
- The original author wrote about the design of the tool in [Transforming Starlight into PDF: experience and insights](https://dev.to/linkerin/transforming-starlight-into-pdf-experience-and-insights-j1d).

### Similar projects

- [Linkerin/starlight-to-pdf](https://github.com/Linkerin/starlight-to-pdf) - The upstream project this fork is based on.
- [docs-to-pdf](https://github.com/jean-humann/docs-to-pdf) - A similar tool oriented toward Docusaurus sites.
- [percollate](https://github.com/danburzo/percollate) - A general-purpose web page to PDF converter.

## Maintainers

[@kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

[Alexei Gusev](https://github.com/Linkerin) designed and built the original [starlight-to-pdf](https://github.com/Linkerin/starlight-to-pdf), which was the foundation of this fork; his copyright is preserved in [license.txt](./license.txt) alongside the fork's. The example assets and workflow documentation are his work as well.

Thanks to [HiDeoo](https://github.com/HiDeoo) for the [starlight-sidebar-topics](https://github.com/HiDeoo/starlight-sidebar-topics) plugin and its documentation site, which doubled as a test fixture for this fork's topics support.

Thanks to [Zach Hall](https://github.com/zshall) for the `--browser-no-sandbox` flag, contributed to the upstream project in [Linkerin/starlight-to-pdf#12](https://github.com/Linkerin/starlight-to-pdf/pull/12) and integrated here.

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/starlight-to-pdf/issues) are welcome and appreciated.

Please open an issue to discuss changes before submitting a pull request. Unsolicited PRs are unlikely to be merged.

This repository uses [ksc](https://github.com/kitschpatrol/shared-config) to handle linting and formatting with the usual tools, plus [mdat](https://github.com/kitschpatrol/mdat) for readme placeholder expansion, and [chagent](https://github.com/kitschpatrol/chagent) to maintain the [changelog](changelog.md).

<!-- /contributing -->

## License

Original work: [MIT](license.txt) © Alexei Gusev

Fork modifications: [MIT](license.txt) © [Eric Mika](https://ericmika.com)
