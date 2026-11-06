import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig({
	ignores: ['**/changelog.md'],
	md: {
		overridesEmbeddedScripts: {
			'import/no-unresolved': 'off',
		},
	},
	type: 'lib',
})
