import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig({
	md: {
		overridesEmbeddedScripts: {
			'import/no-unresolved': 'off',
		},
	},
	type: 'lib',
})
