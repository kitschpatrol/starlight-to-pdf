# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
