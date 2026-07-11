import { defineConfig } from 'tsdown'

export default defineConfig([
	// CLI tool
	{
		deps: {
			// Puppeteer must resolve at runtime from the host project
			neverBundle: ['puppeteer', 'puppeteer-autoscroll-down'],
		},
		dts: false,
		entry: 'src/bin/cli.ts',
		fixedExtension: false,
		minify: true,
		outDir: 'dist/bin',
		platform: 'node',
	},
	// Library
	{
		attw: {
			profile: 'esm-only',
		},
		entry: 'src/lib/index.ts',
		fixedExtension: false,
		outDir: 'dist/lib',
		platform: 'node',
		publint: true,
		tsconfig: 'tsconfig.build.json',
	},
])
