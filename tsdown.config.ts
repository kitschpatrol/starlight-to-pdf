import { defineConfig } from 'tsdown'

export default defineConfig({
	attw: {
		profile: 'esm-only',
	},
	// Only dist is build-owned; remove stale entries and shared chunks on rebuild.
	clean: true,
	deps: {
		// Puppeteer must resolve at runtime from the host project.
		neverBundle: ['puppeteer', 'puppeteer-autoscroll-down'],
	},
	dts: true,
	entry: {
		'bin/cli': 'src/bin/cli.ts',
		'lib/index': 'src/lib/index.ts',
	},
	fixedExtension: false,
	format: 'esm',
	// Keep the library and shared implementation readable for debugging.
	minify: false,
	outDir: 'dist',
	platform: 'node',
	publint: true,
	tsconfig: 'tsconfig.build.json',
})
