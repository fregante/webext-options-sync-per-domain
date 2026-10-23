import globals from 'globals';

/**
@type {import('xo').FlatXoConfig}
*/
const xoConfig = [
	{
		ignores: ['readme.md'],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.webextensions,
			},
		},
		rules: {
			'@typescript-eslint/strict-void-return': 'off',
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'import-x/no-unassigned-import': 'off',
			'unicorn/consistent-class-member-order': 'off',
		},
	},
];

export default xoConfig;
