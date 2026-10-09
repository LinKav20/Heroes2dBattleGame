import { builtinModules } from 'node:module';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import perfectionist from 'eslint-plugin-perfectionist';
import tseslint from 'typescript-eslint';
import { localPlugin } from './scripts/eslint-rules.js';
import { deterministicPackageDirs } from './scripts/workspace.js';

const DETERMINISTIC_SOURCES = deterministicPackageDirs().map((dir) => `${dir}/src/**/*.ts`);

const TIME = 'Deterministic code does not know about time.';
const RANDOM = 'Random values come only from the generator in the battle state.';
const RUNTIME = 'Deterministic code does not depend on the runtime.';
const LOCALE = 'Locale-dependent results differ between runtimes.';
const FLOAT = 'Engines may compute this differently in the last bits; use integer arithmetic.';
const GARBAGE_COLLECTOR = 'Results depend on the garbage collector.';

const TRANSCENDENTAL_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot',
];
const LOCALE_METHODS = [
  'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toLocaleUpperCase', 'toLocaleLowerCase', 'localeCompare',
];

const ORDER_SELECTORS = [
  {
    selector: 'Program > :matches(VariableDeclaration, FunctionDeclaration, ClassDeclaration, '
      + 'ExportNamedDeclaration[declaration.type=/^(VariableDeclaration|FunctionDeclaration|ClassDeclaration)$/]) '
      + '~ :matches(TSInterfaceDeclaration, TSTypeAliasDeclaration, TSEnumDeclaration, '
      + 'ExportNamedDeclaration[declaration.type=/^TS(Interface|TypeAlias|Enum)Declaration$/])',
    message: 'Declaration order: types and interfaces come before values.',
  },
  {
    selector: "Program > ExportNamedDeclaration[declaration.type='FunctionDeclaration'] "
      + "~ ExportNamedDeclaration[declaration.type='VariableDeclaration']",
    message: 'Declaration order: exported constants come before exported functions.',
  },
  {
    selector: 'Program > :matches(VariableDeclaration, FunctionDeclaration) '
      + '~ ExportNamedDeclaration[declaration.type=/^(VariableDeclaration|FunctionDeclaration)$/]',
    message: 'Declaration order: exported declarations come before private ones.',
  },
  {
    selector: 'Program > FunctionDeclaration ~ VariableDeclaration',
    message: 'Declaration order: private constants come before private functions.',
  },
];

const DETERMINISM_SELECTORS = [
  { selector: "BinaryExpression[operator='**']", message: FLOAT },
  { selector: "AssignmentExpression[operator='**=']", message: FLOAT },
  { selector: 'MemberExpression[object.name="Math"][computed=true]', message: 'Use dot access on Math so the bans apply.' },
  { selector: ':function[async=true]', message: 'Deterministic code is synchronous.' },
  { selector: 'ImportExpression', message: RUNTIME },
  {
    selector: 'ForInStatement',
    message: 'for...in visits inherited keys and puts integer-like keys first; iterate an array or a Map.',
  },
];

export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**', 'docs/**', 'coverage/**'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    arrowParens: true,
    braceStyle: '1tbs',
    commaDangle: 'always-multiline',
  }),
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    plugins: { perfectionist, local: localPlugin },
    rules: {
      'local/comments': 'error',
      'perfectionist/sort-modules': ['error', {
        type: 'unsorted',
        groups: [
          ['export-interface', 'export-type', 'export-enum'],
          ['interface', 'type', 'enum'],
          ['export-class', 'export-function'],
          ['class', 'function'],
        ],
      }],
      'no-restricted-syntax': ['error', ...ORDER_SELECTORS],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: ['const', 'let'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
        { blankLine: 'always', prev: '*', next: ['block-like', 'multiline-expression', 'return'] },
        { blankLine: 'always', prev: ['block-like', 'multiline-expression'], next: '*' },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
      ],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
      '@stylistic/padded-blocks': ['error', 'never'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/lines-between-class-members': ['error', 'always'],
      '@stylistic/max-len': ['error', {
        code: 120,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
      'no-restricted-exports': ['error', {
        restrictDefaultExports: { direct: true, named: true, defaultFrom: true, namedFrom: true, namespaceFrom: true },
      }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }],
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: false } },
        { selector: 'variableLike', format: ['camelCase'], leadingUnderscore: 'forbid', trailingUnderscore: 'forbid' },
        { selector: 'variable', modifiers: ['const', 'global'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'function', format: ['camelCase'] },
      ],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'curly': ['error', 'multi-line'],
      'one-var': ['error', 'never'],
      'no-var': 'error',
      'prefer-const': 'error',
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['**/*.config.{js,cjs,mjs,ts}'],
    rules: { 'no-restricted-exports': 'off' },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: DETERMINISTIC_SOURCES,
    ignores: ['**/tests/**'],
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-restricted-globals': ['error', {
        checkGlobalObject: true,
        globalObjects: ['globalThis', 'self', 'window', 'global'],
        globals: [
          ...['globalThis', 'self', 'global', 'window', 'document', 'navigator', 'process', 'Buffer', 'fetch',
            'structuredClone', 'eval', 'Function', 'Reflect', 'Atomics', 'SharedArrayBuffer']
            .map((name) => ({ name, message: RUNTIME })),
          ...['Date', 'performance', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask']
            .map((name) => ({ name, message: TIME })),
          { name: 'crypto', message: RANDOM },
          { name: 'Intl', message: LOCALE },
          { name: 'WeakRef', message: GARBAGE_COLLECTOR },
          { name: 'FinalizationRegistry', message: GARBAGE_COLLECTOR },
        ],
      }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: RANDOM },
        ...TRANSCENDENTAL_MATH.map((property) => ({ object: 'Math', property, message: FLOAT })),
        ...LOCALE_METHODS.map((property) => ({ property, message: LOCALE })),
      ],
      'no-restricted-syntax': ['error', ...ORDER_SELECTORS, ...DETERMINISM_SELECTORS],
      'no-restricted-imports': ['error', {
        paths: builtinModules.map((name) => ({ name, message: RUNTIME })),
        patterns: [{ group: ['node:*'], message: RUNTIME }],
      }],
      '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: false }],
      'no-param-reassign': ['error', { props: true }],
    },
  },
);
