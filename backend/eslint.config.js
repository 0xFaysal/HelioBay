import tseslint from 'typescript-eslint';
export default tseslint.config({ ignores: ['dist/**', 'src/generated/**', 'node_modules/**', '.npm-cache/**'] }, ...tseslint.configs.recommended, { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-namespace': 'off' } });
