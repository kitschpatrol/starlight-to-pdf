import { describe, expect, it } from 'vitest'
import { mergeStylesheets } from '../src/lib/get-all-content'

describe('mergeStylesheets', () => {
	it('should take the first page stylesheets in order', () => {
		expect(mergeStylesheets([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
	})

	it('should skip stylesheets shared with previous pages', () => {
		expect(mergeStylesheets(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
	})

	it('should insert new stylesheets after the stylesheet preceding them on their page', () => {
		expect(
			mergeStylesheets(
				['common', 'theme', 'picture'],
				['common', 'theme', 'diagram', 'grid', 'picture'],
			),
		).toEqual(['common', 'theme', 'diagram', 'grid', 'picture'])
	})

	it('should insert a new leading stylesheet before the known ones', () => {
		expect(mergeStylesheets(['a', 'b'], ['x', 'b'])).toEqual(['x', 'a', 'b'])
	})

	it('should append new stylesheets after the last known one when page orders conflict', () => {
		expect(mergeStylesheets(['a', 'b'], ['b', 'a', 'x'])).toEqual(['a', 'b', 'x'])
	})

	it('should not mutate the accumulated stylesheets', () => {
		const accumulated = ['a']
		mergeStylesheets(accumulated, ['b'])
		expect(accumulated).toEqual(['a'])
	})
})
