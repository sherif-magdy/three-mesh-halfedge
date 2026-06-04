import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'examples/**/*.ts'],
    languageOptions: {
      parser: tsparser,
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'array-bracket-spacing': ['error'],
      'space-in-parens': ['error'],
      'indent': ['error', 2, {
        'FunctionDeclaration': { 'parameters': 2 },
        'FunctionExpression': { 'parameters': 2 },
      }],
    },
  },
];
