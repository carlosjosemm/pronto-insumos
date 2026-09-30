import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const adminFiles = ['api/**/*.ts', 'src/admin/**/*.{ts,tsx}']

/**
 * Inline plugin enforcing self-contained comments: every comment and JSDoc
 * must carry its full explanation inline, because a reader with only the
 * source file open must understand the rule without opening any other file.
 *
 * Flagged pointer shapes:
 * - any markdown-file reference (the rule matches the file-extension pattern)
 * - task numbers — a task label followed by digits says nothing to a reader
 * - section-sign references into an external doc's numbering
 * - the roadmap filename even when written without its extension
 */
const selfContainedComments = {
  rules: {
    'no-external-doc-pointers': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow comments that defer their explanation to external docs or task numbers'
        },
        schema: [],
        messages: {
          externalPointer:
            'Comment defers to external documentation ("{{match}}"). Inline the needed explanation; comments must be self-contained.'
        }
      },
      create(context) {
        const pointerPatterns = [/\.md\b/i, /\b(?:task|todo)\s*\d+(?:\.\d+)?\b/i, /§/, /\bPRODUCTION_READINESS_TODO\b/i]
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              for (const pattern of pointerPatterns) {
                const match = comment.value.match(pattern)
                if (match) {
                  context.report({
                    loc: comment.loc,
                    messageId: 'externalPointer',
                    data: { match: match[0].trim() }
                  })
                  break
                }
              }
            }
          }
        }
      }
    }
  }
}

/**
 * PRONTO storefront lint rules.
 *
 * Layout: the storefront app (src/** except src/admin) plus root scripts are
 * linted with the full TypeScript rule set. The administrative backoffice
 * (src/admin/**) and the Vercel serverless functions (api/**) carry their own
 * runtime contracts, so they are parsed and linted only with the
 * self-contained-comments rule; a full lint pass there is a separate effort.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'public/**', 'node_modules/**', '.vercel/**']
  },
  // Pin project resolution to this repo for every linted file type: without
  // it, an IDE with several candidate TSConfigRootDirs on disk (e.g. scratch
  // dirs under /tmp) reports "No tsconfigRootDir was set" parsing errors.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  { ...js.configs.recommended, ignores: adminFiles },
  ...tseslint.configs.recommended.map((config) => ({ ...config, ignores: adminFiles })),
  {
    files: ['**/*.{ts,tsx}'],
    ignores: adminFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Pin project resolution to this repo: without it, an IDE with several
      // candidate TSConfigRootDirs on disk (e.g. scratch dirs under /tmp)
      // reports "No tsconfigRootDir was set" parsing errors.
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      },
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
  },
  {
    plugins: {
      'self-contained-comments': selfContainedComments
    },
    rules: {
      'self-contained-comments/no-external-doc-pointers': 'error'
    }
  },
  {
    files: adminFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      },
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  }
)
