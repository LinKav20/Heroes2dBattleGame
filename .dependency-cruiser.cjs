const { deterministicPackageDirs } = require('./scripts/workspace.js');

const ANY_PACKAGE = '^(libs|adapters|apps|packs)/';
const OWN_PACKAGE = '^(libs|adapters|apps|packs)/([^/]+)/';
const DETERMINISTIC = `^(${deterministicPackageDirs().map((dir) => dir.replaceAll('.', '\\.')).join('|')})/src/`;

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-unresolvable',
      comment: 'Every import must resolve: the package is declared as a dependency and the path exists.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'hex-is-standalone',
      comment: 'hex is pure geometry and depends on no other package.',
      severity: 'error',
      from: { path: '^libs/hex/' },
      to: { path: ANY_PACKAGE, pathNot: '^libs/hex/' },
    },
    {
      name: 'kernel-is-standalone',
      comment: 'The kernel depends on nothing, not even hex: it gets the field shape through the topology interface.',
      severity: 'error',
      from: { path: '^libs/kernel/' },
      to: { path: ANY_PACKAGE, pathNot: '^libs/kernel/' },
    },
    {
      name: 'deterministic-packages-have-no-npm-deps',
      comment: 'Packages marked deterministic in package.json pull in no third-party packages and no Node.js modules.',
      severity: 'error',
      from: { path: DETERMINISTIC, pathNot: '/tests/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg', 'npm-unknown', 'core'],
        pathNot: ANY_PACKAGE,
      },
    },
    {
      name: 'no-undeclared-npm-deps',
      comment: 'Code imports only packages declared in its own package.json.',
      severity: 'error',
      from: { path: ANY_PACKAGE, pathNot: '/tests/' },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-dev-deps-in-code',
      comment: 'devDependencies are not installed for consumers, so published code must not import them.',
      severity: 'error',
      from: { path: ANY_PACKAGE, pathNot: '/tests/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'], pathNot: ANY_PACKAGE },
    },
    {
      name: 'libs-do-not-import-adapters-apps-or-packs',
      severity: 'error',
      from: { path: '^libs/' },
      to: { path: '^(adapters|apps|packs)/' },
    },
    {
      name: 'adapters-do-not-import-each-other',
      severity: 'error',
      from: { path: '^adapters/([^/]+)/' },
      to: { path: '^adapters/', pathNot: '^adapters/$1/' },
    },
    {
      name: 'nobody-imports-apps',
      severity: 'error',
      from: { path: OWN_PACKAGE },
      to: { path: '^apps/', pathNot: '^apps/$2/' },
    },
    {
      name: 'only-public-entry-across-packages',
      comment: 'Another package is used only through its exports entry point.',
      severity: 'error',
      from: { path: OWN_PACKAGE },
      to: { path: ANY_PACKAGE, pathNot: ['^$1/$2/', '^(libs|adapters|apps|packs)/[^/]+/src/index\\.ts$'] },
    },
    {
      name: 'cross-package-via-package-name',
      comment: 'Another package is imported by its package name, never by a relative path.',
      severity: 'error',
      from: { path: OWN_PACKAGE },
      to: { path: ANY_PACKAGE, pathNot: '^$1/$2/', dependencyTypes: ['local'] },
    },
    {
      name: 'code-does-not-import-tests',
      comment: 'Library code does not import tests.',
      severity: 'error',
      from: { path: ANY_PACKAGE, pathNot: '/tests/' },
      to: { path: '/tests/' },
    },
    {
      name: 'no-unreachable-code',
      comment: 'Every source file is reachable from the entry point of its package.',
      severity: 'error',
      from: { path: '^(libs|adapters|apps|packs)/([^/]+)/src/index\\.ts$' },
      to: { path: '^$1/$2/src/', pathNot: ['/tests/', '\\.d\\.ts$'], reachable: false },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(libs|adapters|apps|packs)/[^/]+/dist/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['@heroes2dgame/source', 'import', 'types', 'default'],
    },
  },
};
