<!-- title -->

# @kitschpatrol/starlight-to-pdf

<!-- /title -->

<!-- badges -->

[![NPM Package @kitschpatrol/starlight-to-pdf](https://img.shields.io/npm/v/@kitschpatrol/starlight-to-pdf.svg)](https://npmjs.com/package/@kitschpatrol/starlight-to-pdf)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/mit/)
[![CI](https://github.com/kitschpatrol/starlight-to-pdf/actions/workflows/ci.yml/badge.svg)](https://github.com/kitschpatrol/starlight-to-pdf/actions/workflows/ci.yml)

<!-- /badges -->

<!-- short-description -->

**A command-line tool to convert Starlight documentation websites into PDF files.**

<!-- /short-description -->

## Overview

`starlight-to-pdf` crawls a documentation website built with [Starlight](https://starlight.astro.build) and renders it into a single PDF file, complete with a generated table of contents, an optional PDF outline, and customizable margins, styles, and print headers and footers.

This is a fork of [Linkerin/starlight-to-pdf](https://github.com/Linkerin/starlight-to-pdf) by Alexei Gusev, which adds support for sites that use the [starlight-sidebar-topics](https://github.com/HiDeoo/starlight-sidebar-topics) plugin, updates dependencies, and reworks the project structure a bit to address some matters of preference.

On topic-organized sites, the pagination links the original crawler follows are scoped to a single topic, so only one topic ends up in the PDF. This fork detects the plugin's topics navigation and instead visits every topic, collecting its pages in sidebar order. No extra flags are needed.

Sites without the plugin are crawled exactly as before, by following pagination links.

## Getting started

### Dependencies

- [Node.js](https://nodejs.org) 24.16 or newer.
- Chrome or Chromium. [Puppeteer](https://pptr.dev), installed alongside the tool, downloads a compatible Chrome for Testing build by default. To use an existing browser instead, pass its path via the `--browser-executable` flag.
- An Astro Starlight project served either locally or remotely that you want to PDF-ify.

### Installation

Install globally:

```sh
npm install --global @kitschpatrol/starlight-to-pdf
```

Or run it directly without installing:

```sh
npx @kitschpatrol/starlight-to-pdf https://starlight.astro.build
```

## Usage

Pass the URL of a Starlight site as the only required argument:

```sh
starlight-to-pdf https://starlight.astro.build
```

The resulting PDF is saved to the current working directory, named after the site's hostname. Sites using the starlight-sidebar-topics plugin are detected automatically, and every topic is included.

### CLI

<!-- cli-help -->

#### Command: `starlight-to-pdf`

Convert a Starlight documentation website to a PDF file.

Usage:

```txt
starlight-to-pdf <url>
```

| Positional Argument | Description                                                               | Type     |
| ------------------- | ------------------------------------------------------------------------- | -------- |
| `url`               | The URL of the Starlight powered documentation website to convert to PDF. | `string` |

| Option                  | Description                                                                                                                                                                                                                                                            | Type                                                            | Default              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| `--browser-executable`  | Specifies a path to a browser executable to use instead of the default one (e.g. --browser-executable /usr/bin/chromium-browser).                                                                                                                                      | `string`                                                        |                      |
| `--contents`            | Generate a table of contents in the PDF. Use --no-contents to disable it.                                                                                                                                                                                              | `boolean`                                                       | `true`               |
| `--contents-links`      | Specifies the type of links in the generated table of contents. Use 'internal' for links that navigate within the PDF file or 'external' for links that point to the documentation website.                                                                            | `"external"` `"internal"`                                       | `"external"`         |
| `--contents-name`       | Customizes the generated table of contents name in the PDF.                                                                                                                                                                                                            | `string`                                                        |                      |
| `--css-page-size`       | Allows setting the PDF page size using CSS `@page`. If the predefined sizes in the '--format' option don't meet your needs, enable this option and specify the desired page size in custom CSS provided via the '--styles' flag (e.g., `@page { size: 8.5in 14in; }`). | `boolean`                                                       | `false`              |
| `--exclude`<br>`-e`     | A string containing links separated by space that shouldn't be added to the resulting PDF file (e.g. --exclude '/docs/contacts /docs/demo'). You may also provide multiple values: -e /docs/contacts -e /docs/demo.                                                    | `array`                                                         |                      |
| `--filename`<br>`-f`    | The output filename for the PDF. Default is the hostname of the provided URL.                                                                                                                                                                                          | `string`                                                        |                      |
| `--following-html`      | Path to an HTML file which content will be inserted at the end of the PDF file. Its behavior is similar to the '--preceding-html' option.                                                                                                                              | `string`                                                        |                      |
| `--footer`              | Path to the HTML file for the PDF print footer. For more details, check the PDF header and footer section in the readme and Puppeteer's PDFOptions.                                                                                                                    | `string`                                                        |                      |
| `--format`              | The paper format (e.g., A4, Letter) for the PDF file. Refer to Puppeteer's paper formats for more details.                                                                                                                                                             | `string`                                                        | `"A4"`               |
| `--header`              | Path to the HTML file for the PDF print header. For more details, check the PDF header and footer section in the readme and Puppeteer's PDFOptions.                                                                                                                    | `string`                                                        |                      |
| `--last`<br>`-l`        | Sets the last link to parse (e.g. --last /docs/demo). Further parsing stops once this link is reached and parsed.                                                                                                                                                      | `string`                                                        |                      |
| `--margins`             | Sets margins for the PDF file. Provide a string with 4 values separated by space, reflecting the top, right, bottom and left margins respectively.                                                                                                                     | `string`                                                        | "1cm 1cm 1cm 1.5cm"  |
| `--paddings`            | Sets padding for the PDF content. Provide as a string with 4 values separated by space, reflecting the top, right, bottom and left paddings respectively. Paddings are disabled by default.                                                                            | `string`                                                        |                      |
| `--page-wait-until`     | Specifies the event that indicates a successful page load.                                                                                                                                                                                                             | `"load"` `"domcontentloaded"` `"networkidle0"` `"networkidle2"` | `"domcontentloaded"` |
| `--path`<br>`-p`        | Sets the directory path for the output PDF. Default is the current working directory.                                                                                                                                                                                  | `string`                                                        |                      |
| `--pdf-outline`         | Enables a side outline in the PDF file. It's an `outline` property in Puppeteer's PDFOptions.                                                                                                                                                                          | `boolean`                                                       | `false`              |
| `--preceding-html`      | Path to an HTML file which content will be inserted at the beginning of the PDF file. This option may be useful for adding a cover page.                                                                                                                               | `string`                                                        |                      |
| `--print-bg`            | Enables printing of background graphics. It's a `printBackground` property in Puppeteer's PDFOptions.                                                                                                                                                                  | `boolean`                                                       | `false`              |
| `--scroll-delay`        | Specifies the delay (in milliseconds) between each viewport scroll to allow lazy-loaded content to fully render.                                                                                                                                                       | `number`                                                        | `100`                |
| `--starlight-print-css` | Applies the default `@media print` CSS styles from Starlight. Use --no-starlight-print-css to retain the website's original colors when printing.                                                                                                                      | `boolean`                                                       | `true`               |
| `--styles`              | Path to a CSS file for custom PDF styles. The styles are injected into the `<style>` tag inside the `<body>` element. Also check the readme for a list of special CSS classes used by the tool.                                                                        | `string`                                                        |                      |
| `--timeout`             | Timeout for both the page actions and `protocolTimeout` in milliseconds. You may need to increase this value for parsing large websites.                                                                                                                               | `number`                                                        | `180000`             |
| `--verbose`             | Run with verbose logging.                                                                                                                                                                                                                                              | `boolean`                                                       | `false`              |
| `--help`<br>`-h`        | Show help                                                                                                                                                                                                                                                              | `boolean`                                                       |                      |
| `--version`<br>`-v`     | Show version number                                                                                                                                                                                                                                                    | `boolean`                                                       |                      |

<!-- /cli-help -->

### Examples

A conversion exercising most of the options:

```sh
starlight-to-pdf spectrum.snipshot.dev -p ./output --filename spectrum-docs --contents-name "Table of contents" --margins '0 0 0 0' --paddings '2cm 1cm 2cm 1.5cm' --exclude '/demo /contacts' --header ./assets/header-template.html --footer ./assets/footer-template.html --print-bg --pdf-outline
```

Resulting PDF file: [spectrum-docs.pdf](./assets/spectrum-docs.pdf)

#### Special CSS classes

Custom styles passed via the `--styles` flag can target classes the tool assigns while assembling the document:

- `.s2pdf-container` - The wrapper around all the website parsed content _(excluding the table of contents)_.
- `.s2pdf-contents` - The `<ul>` element containing the generated table of contents.
- `.s2pdf-heading` - The element that contains `<h1>` headings of each page.
- `.s2pdf-pagebreak` - Each page text content with a defined CSS `break-after: page` property.

#### PDF header and footer

You can provide an HTML template for the print header and footer of the generated PDF file. Inside the templates you may also include HTML elements with the following classes and values will be automatically injected into them:

- `.date` - formatted print date;
- `.pageNumber` - current page number;
- `.totalPages` - total number of pages in the document.

> Note that Puppeteer's template classes `.title` and `.url` are useless for the tool, as the PDF file is generated on one web page and these values will be the same on all document pages. However, you may still use them in your template, if necessary.

Some things to keep in mind:

- The template must be a valid HTML structure.
- You should define `font-size` property as Puppeteer's default value is `0`.
- Use inline `<style>` tag to define your styles. Website styles are **not available** inside the templates.
- Images should be encoded as base64 strings.
- Use `--margins` and `--paddings` options to achieve the desired layout.

Check [header-template.html](./assets/header-template.html) and [footer-template.html](./assets/footer-template.html) as valid examples.\
You may also check [the resulting PDF file](./assets/spectrum-docs.pdf).

#### Generating a PDF during local development

To generate a PDF file during local development, add a command like the following to your Starlight project's `package.json`:

```jsonc
{
  "scripts": {
    "pdf": "npm run build && (npm run preview > /dev/null & sleep 5); lsof -ti:4321 > preview.pid; npx starlight-to-pdf http://localhost:4321 -p ./public/_pdf --filename docs --pdf-outline; kill $(cat preview.pid) && rm preview.pid && echo 'PDF script finished'",
  },
}
```

This script will generate the PDF and save it in the `public/_pdf` folder. If your preview server uses a non-default port, or your project requires a custom build command, update the script accordingly.

## Background

### Implementation notes

- The crawler loads the given URL and searches for the first page with a pagination link or a topics navigation, then either follows the `rel="next"` chain (plain Starlight sites) or visits each topic and collects the links of its sidebar in order (starlight-sidebar-topics sites).
- Topic entries that link to other domains are skipped, and all flags work as usual.
- Each page's rendered content is extracted with [Puppeteer](https://pptr.dev) and concatenated into a single document, along with a generated table of contents, before being printed to PDF.
- Relative to upstream, this fork migrates the CLI to [yargs](https://yargs.js.org), logging to [lognow](https://github.com/kitschpatrol/lognow), bundling to [tsdown](https://tsdown.dev), and linting and formatting to [@kitschpatrol/shared-config](https://github.com/kitschpatrol/shared-config). It requires Node.js 24 or newer.
- The original author wrote about the design of the tool in [Transforming Starlight into PDF: experience and insights](https://dev.to/linkerin/transforming-starlight-into-pdf-experience-and-insights-j1d).

### Similar projects

- [Linkerin/starlight-to-pdf](https://github.com/Linkerin/starlight-to-pdf) - The upstream project this fork is based on.
- [docs-to-pdf](https://github.com/jean-humann/docs-to-pdf) - A similar tool oriented toward Docusaurus sites.
- [percollate](https://github.com/danburzo/percollate) - A general-purpose web page to PDF converter.

## Maintainers

[@kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

[Alexei Gusev](https://github.com/Linkerin) designed and built the original [starlight-to-pdf](https://github.com/Linkerin/starlight-to-pdf), which remains the foundation of this fork; his copyright is preserved in [license.txt](./license.txt) alongside the fork's. The example assets and workflow documentation are his work as well.

Thanks to [HiDeoo](https://github.com/HiDeoo) for the [starlight-sidebar-topics](https://github.com/HiDeoo/starlight-sidebar-topics) plugin and its documentation site, which doubled as a test fixture for this fork's topics support.

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/starlight-to-pdf/issues) are welcome and appreciated.

Please open an issue to discuss changes before submitting a pull request. Unsolicited PRs (especially AI-generated ones) are unlikely to be merged.

This repository uses [@kitschpatrol/shared-config](https://github.com/kitschpatrol/shared-config) (via its `ksc` CLI) for linting and formatting, plus [MDAT](https://github.com/kitschpatrol/mdat) for readme placeholder expansion.

<!-- /contributing -->

## License

Original work: [MIT](license.txt) © Alexei Gusev

Fork modifications: [MIT](license.txt) © [Eric Mika](https://ericmika.com)

