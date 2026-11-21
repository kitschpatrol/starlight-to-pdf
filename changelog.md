# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are drafted with LLM assistance via [Chagent](https://github.com/kitschpatrol/chagent).

## [2.0.0-beta.6] - 2026-11-20

### Added

- Turn web and email addresses in the cover subtitle, cover author, and back-page text into clickable links with `linkifyjs`. Bare domains link over HTTPS, and links are underlined in the surrounding text color.
- Compress PDFs losslessly by default with `@neslinesli93/qpdf-wasm`, which works with Homebrew installs that skip install scripts. Compressed files use PDF 1.5 and preserve page appearance, tags, bookmarks, links, and metadata. Log the size savings and keep the original if compression fails or saves no space.
- Add `--compress` and the library’s `compress` option to shrink PDFs further. Re-encode eligible photos as JPEG, targeting up to 192 ppi at print size, and downsample graphics with lossless encoding when that saves at least 25%. Preserve SVGs and transparent images, and restore the original image if its replacement shifts the layout.

### Changed

- Widen the default margins to `1in 1in 1in 1in`, giving running headers and footers more room.
- Set the generated cover’s title block and details in up to three quarters of the printable width, and move the title down by two lines. Balance the title and subtitle across lines, keep long title words together, and scale the subtitle down with the title on narrow pages.

### Fixed

- Let long cover and back-page text flow onto additional pages to prevent it from overlapping following content.
- Fix same-site links in PDFs made from a local preview by using the published origin from each page’s canonical URL, with `og:url` as a fallback. Resolve relative links against their source page so links from nested pages keep the correct path.

### Documentation

- Expand the README’s comparison with upstream to cover print pagination, table of contents page numbers and columns, linked media, direct PDF link destinations, and the default margins and outline.
- Explain automatic cover and back-page links in the README, CLI help, and library option descriptions. Note in the README that filenames with a domain suffix, such as `README.md`, can also become links.
- Document default lossless PDF compression and optional image re-encoding in the README and option help. Explain in the README which images are eligible and how `--css-page-size` affects downsampling.
- Explain how Astro’s `site` setting supplies the canonical URL used to point PDF links at the published site.
- Clarify the local preview example for Astro adapters such as `@astrojs/cloudflare` that can report the requested port after binding to another one. Show how to pass an unused port explicitly.

### Maintenance

- Add browser and CLI regression tests for PDF and image compression, including preserved PDF structure and link destinations. Check image orientation and color from full-resolution pixels with both default and software canvases for Linux and Windows CI.
- Check at compile time that the CLI forwards every library option.

## [2.0.0-beta.5] - 2026-11-20

### Added

- Add an optional cover page with `--cover`, showing the document title, subtitle, author, revision, and date. The cover title scales down on narrow pages, and the date defaults to today in the site's language.
- Add a back page when `--about`, `--contact`, or `--notice` is supplied. It includes the document title, revision, and date and limits the line length of the small print.
- Set the PDF metadata title from the site's title by default and allow an override with `--title` or the library's `title` option.
- Show right-aligned page numbers in the table of contents for entries that link within the PDF.
- Link videos, audio, and embedded YouTube and Vimeo players to their sections on the website, using canonical URLs when available. Videos and players link from their previews, native videos show a frame or poster with a vector play badge, and audio links from a caption. Turn this off with `--no-media-links` or `mediaLinks: false`.

### Changed

- **Breaking:** Replace Puppeteer HTML template paths with boolean `--header` and `--footer` flags and boolean `header` and `footer` library options. The built-in header shows document and page titles in the site's font. The footer shows the revision, date, and page numbers, plus the document title when used on its own.
- Widen the default margins to `2cm 1.5cm 2cm 1.5cm` to center the content and make room for running headers and footers.
- Set the table of contents in up to two columns with a wide gutter, semibold page entries, and indented section links. Keep each page entry with its sections and give the contents a top-level heading in the PDF outline.
- Enable PDF outline bookmarks by default. Turn them off with `--no-pdf-outline` or `pdfOutline: false`.
- Balance wrapped headings and reduce lone words on the last line of paragraphs, lists, captions, and quotes. Site styles can override these defaults.
- Distinguish failures to write the PDF from failures to render it in error messages.

### Fixed

- Include stylesheets from every crawled page so components on later pages retain their styles. Deduplicate shared stylesheets, wait for linked stylesheets to load, and report failed loads.
- Preserve web component content and styles from open shadow roots in the PDF.
- Expand collapsed `<details>` elements before printing, including every panel in an exclusive accordion.
- Capture readable canvases as images, including those in open shadow roots, and render the crawl at twice the pixel density for clearer charts. Warn about unreadable canvases only when they would print blank.
- Hide fixed-position elements in docs content so floating panels and toolbars do not repeat over every PDF page.
- Scale oversized graphics to fit on one page when using a fixed paper format. Leave room for figure captions and immediately preceding headings where they fit.
- Keep headings with the content that follows, including responsive images, even with `--no-starlight-print-css`.
- Restore space below docs page titles and let long titles span the full printable width.
- Keep bordered or shadowed cards and callouts on one page when they fit, including those in open shadow roots.
- Avoid page breaks inside grid items that span multiple rows, including row subgrids, to prevent overlapping content.
- Wrap table cells between words when the table fits the print width.
- Keep table rows together across page breaks.
- Include overflowing content in dynamic page height measurements so it stays on its intended page.
- Escape HTML characters in the table of contents title and entries so headings such as `Use <Card>` print as text.
- Point internal PDF links directly to their target page and position so they survive compression tools that strip named destinations.

### Documentation

- Update the CLI help and README for covers, back pages, and running headers and footers. Document the new CSS selectors and show how to use a custom cover with `--preceding-html`.
- Explain how the tool assembles pages and adapts them for print, and document `--page-wait-until networkidle0` for content rendered by client-side scripts.
- Show how to set the print font size in site CSS or in a custom stylesheet passed with `--styles`.
- Refresh the Spectrum conversion example and sample PDF to demonstrate the cover, back page, running header and footer, and numbered table of contents.
- Remove the unused custom cover, GitHub Actions deployment example, and alternate Spectrum PDF.
- Update the contribution guide to identify `ksc`, `mdat`, and `chagent` and simplify the pull request guidance.

### Maintenance

- Raise the runtime `lognow` requirement from `^0.8.7` to `^0.8.9`.
- Refresh pnpm and development dependencies, including shared-config, Puppeteer 25.18.1 with Chrome 157, tsdown, Vitest, brewpub, and the mdat CLI help plugin. Update pnpm's minimum release age exceptions.
- Refresh the GitHub Actions used for CI, repository metadata sync, and automated dependency updates.
- Generate the changelog with `chagent` before the release commit and update the GitHub release-notes action to v3.
- Add `pnpm run example` and run it before the release commit to regenerate the Spectrum sample PDF.
- Share print layout calculations across dynamic page sizing and content fitting, using Puppeteer's paper dimensions.
- Add browser tests for stylesheet capture and injection, including relative URL resolution, failed loads, and disabled Starlight print CSS.

## [2.0.0-beta.4] - 2026-11-02

### Maintenance

- Raise the runtime `lognow` requirement from `^0.8.4` to `^0.8.7`.
- Refresh pnpm and development dependencies, including shared-config, Puppeteer, tsdown, and Vitest; adopt pnpm-managed contributor skills and update ESLint peer compatibility.
- Build before lint/fix commands and standardize published package contents on the `dist` directory.
- Refresh CI and release actions and change automated dependency-update pull requests to a monthly schedule.
- Exclude loopback URLs and tolerate empty inputs in automated link checks.

## [2.0.0-beta.3] - 2026-10-06

### Changed

- **Breaking:** Require Node.js `^24.16.0 || >=26.3.0`, dropping support for Node.js 25 and Node.js 26 versions below 26.3.0.

### Documentation

- Reorganize CLI and library installation guidance, explicitly list Puppeteer peer dependencies, and update documented Node.js requirements.

### Maintenance

- Refresh development dependencies and pnpm, update shared configuration, and replace the checked-in contributor skill with automatic synchronization during preparation.
- Add scheduled dependency-update pull-request automation and correct error capture in the website link-check workflow.
- Pass an npm one-time password from 1Password to the publish command in the release script.

## [2.0.0-beta.2] - 2026-09-21

### Added

- Offer Homebrew installation with `brew install kitschpatrol/tap/starlight-to-pdf`, integrating formula updates into releases through brewpub.

### Documentation

- Document Homebrew and project-local installation and clarify positional-only URL usage.

### Maintenance

- Update runtime requirements to `lognow ^0.8.4` and `yargs ^18.2.0`.
- Refresh development dependencies and contributor configuration, including pnpm 12, Vitest 5, shared-config, tsdown, and VS Code lint/fix tasks.
- Unify CLI and library builds, clean stale artifacts, and emit unminified ESM with declaration generation and package validation.
- Add automated repository and website link checks on pushes, pull requests, and a weekly schedule.
- Refresh and pin GitHub Actions, and simplify release automation to validate tags against the repository's default branch.

## [2.0.0-beta.1] - 2026-07-11

### Added

- Provide the `starlight-to-pdf <url>` CLI for Node.js 24.16+, converting local or remote Starlight documentation into a single PDF, with help and version commands.
- Save PDFs as `<hostname>.pdf` in the current directory by default, with configurable filenames/directories, automatic directory creation, and Windows-style path support.
- Automatically detect `starlight-sidebar-topics` sites and collect pages across topics in sidebar order, deduplicating URLs and skipping other domains.
- Control crawling with repeated or space-separated `--exclude` values and `--last`, with trailing-slash normalization and pagination-loop detection.
- Generate an optional, customizable table of contents with internal PDF links by default or external website links, plus an optional PDF outline.
- Support lowercase paper-format choices with `letter` as the default, configurable margins and padding, and custom page sizes through CSS `@page`.
- Customize PDF appearance with CSS files, background printing, and `--no-starlight-print-css` to retain the website's original colors.
- Accept HTML print-header and footer templates with automatic dates and page numbering.
- Insert custom HTML before or after the documentation using `--preceding-html` and `--following-html`, including cover pages.
- Offer experimental `--dynamic-page-height` sizing that fits each documentation page to its content at the selected paper width; reject combination with `--css-page-size`.
- Support custom browser executables and `--browser-no-sandbox` for environments without browser sandbox support.
- Configure page-load events, timeouts, and scroll delays for lazy-loaded content, with automatic retries for failed navigation.
- Expose a typed ESM `starlightToPdf` API requiring only `url`, with shared defaults, option constants, and exported error classes; return the PDF path, documentation page count, and elapsed time.
- Provide plain progress logging with CLI `--verbose` and a `setLogger` API for Console-like or LogLayer loggers; call `setLogger()` to silence library output.

### Documentation

- Document npm/npx installation, Puppeteer peer requirements, CLI options, CSS hooks, and HTML/PDF examples.
- Provide TypeScript API and logging examples, including PDF generation through Astro's programmatic build and preview APIs.
- Include an example GitHub Actions workflow for generating documentation PDFs and deploying the site to Netlify.

### Maintenance

- Establish pnpm/tsdown builds, shared linting and formatting, Vitest coverage for CLI/options/page sizing, and cross-platform CI and release automation.

[2.0.0-beta.1]: https://github.com/kitschpatrol/starlight-to-pdf/releases/tag/v2.0.0-beta.1
[2.0.0-beta.2]: https://github.com/kitschpatrol/starlight-to-pdf/compare/v2.0.0-beta.1...v2.0.0-beta.2
[2.0.0-beta.3]: https://github.com/kitschpatrol/starlight-to-pdf/compare/v2.0.0-beta.2...v2.0.0-beta.3
[2.0.0-beta.4]: https://github.com/kitschpatrol/starlight-to-pdf/compare/v2.0.0-beta.3...v2.0.0-beta.4
[2.0.0-beta.5]: https://github.com/kitschpatrol/starlight-to-pdf/compare/v2.0.0-beta.4...v2.0.0-beta.5
[2.0.0-beta.6]: https://github.com/kitschpatrol/starlight-to-pdf/compare/v2.0.0-beta.5...v2.0.0-beta.6
