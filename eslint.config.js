import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

// First-time lint rollout on a previously-unlinted codebase: every
// "recommended" rule is demoted to "warn" so real issues surface without
// failing CI on pre-existing code. Ratchet individual rules up to "error"
// as they're cleaned up — never the other way around.
function asWarnings(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, entry]) => {
      const [, ...rest] = Array.isArray(entry) ? entry : [entry];
      return [name, ['warn', ...rest]];
    }),
  );
}

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.claude/**', 'e2e/**', 'coverage/**', 'functions/**'],
  },
  { rules: asWarnings(js.configs.recommended.rules) },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        HeadersInit: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      ...asWarnings(tsPlugin.configs.recommended.rules),
      ...asWarnings(reactHooksPlugin.configs.recommended.rules),
      // TypeScript already enforces these at compile time; the base/plugin
      // JS versions produce false positives on type-only constructs.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
      // The codebase leans on `any` in a number of existing spots; ratchet
      // this down over time rather than failing the whole build today.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Dynamic require() inside vi.mock(...) factories is an established
    // pattern here for lazily requiring React inside a mocked module.
    files: ['src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.rules'],
    plugins: { '@firebase/security-rules': firebaseRulesPlugin },
    languageOptions: {
      parser: firebaseRulesPlugin.parser,
    },
    rules: {
      '@firebase/security-rules/no-open-reads': 'warn',
      '@firebase/security-rules/no-open-writes': 'error',
      '@firebase/security-rules/no-redundant-matches': 'error',
    },
  },
];
