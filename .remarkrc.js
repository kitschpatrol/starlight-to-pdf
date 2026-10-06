import { remarkConfig } from '@kitschpatrol/remark-config'

export default remarkConfig({
	rules: [
		// Installation and Usage both use CLI and Library subsections.
		['remark-lint-no-duplicate-headings', false],
	],
})
