import { execFile } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const cliPath = path.resolve(import.meta.dirname, '../dist/index.js')

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
		const { code, stderr } = await run('https://example.com', '--format', 'A9')
		expect(code).toBe(1)
		expect(stderr).toContain('format')
	})
})
