import { defineConfig } from 'tsdown'

export default defineConfig({
	deps: {
		alwaysBundle: /.+/v,
		// Puppeteer must resolve at runtime from the host project
		neverBundle: ['puppeteer', 'puppeteer-autoscroll-down'],
	},
	dts: false,
	fixedExtension: false,
	minify: true,
	platform: 'node',
	publint: true,
})
