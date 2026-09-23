import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * PRONTO storefront lint rules.
 *
 * Scope note: the administrative backoffice (`src/admin/**`) and the Vercel
 * serverless functions (`api/**`) are deliberately outside this configuration.
 * They carry their own runtime contracts and are linted in a dedicated pass so
 * this config stays reviewable. Widen `ignores` once that lands.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'public/**', 'node_modules/**', 'src/admin/**', 'api/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  }
)
