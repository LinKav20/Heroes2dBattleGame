const { deterministicPackageDirs, PACKAGE_FOLDERS } = require('./scripts/workspace.js');

const FOLDERS = `(${PACKAGE_FOLDERS.join('|')})`;
const ANY_PACKAGE = `^${FOLDERS}/`;
const OWN_PACKAGE = `^${FOLDERS}/([^/]+)/`;
const DETERMINISTIC_PACKAGES = `^(${deterministicPackageDirs().map((dir) => dir.replaceAll('.', '\\.')).join('|')})/`;
const DETERMINISTIC = `${DETERMINISTIC_PACKAGES}src/`;
const KERNEL_LAYERS = [
  'shared', 'crypto', 'json', 'rng', 'names', 'ids', 'content', 'model', 'extensions', 'geometry', 'expressions',
  'events', 'operations', 'effects', 'abilities', 'battle', 'execution', 'projection', 'kernel',
];
const KERNEL_LAYER_RULES = KERNEL_LAYERS.slice(0, -1).map((layer, index) => ({
  name: `kernel-${layer}-imports-only-lower-layers`,
  comment: 'Folders of the kernel form layers: a folder imports only the folders listed before it.',
  severity: 'error',
  from: { path: `^libs/kernel/src/${layer}/`, pathNot: '/tests/' },
  to: { path: `^libs/kernel/src/(${KERNEL_LAYERS.slice(index + 1).join('|')})/` },
}));

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    ...KERNEL_LAYER_RULES,
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
      from: { path: '^libs/hex/', pathNot: '/tests/' },
      to: { path: ANY_PACKAGE, pathNot: '^libs/hex/' },
    },
    {
      name: 'kernel-is-standalone',
      comment: 'The kernel depends on nothing, not even hex: it gets the field shape through the topology interface.',
      severity: 'error',
      from: { path: '^libs/kernel/', pathNot: '/tests/' },
      to: { path: ANY_PACKAGE, pathNot: '^libs/kernel/' },
    },
    {
      name: 'deterministic-packages-have-no-npm-deps',
      comment: 'Packages marked deterministic in package.json pull in no third-party packages and no Node.js modules.',
      severity: 'error',
      from: { path: DETERMINISTIC, pathNot: '/tests/' },
      to: {
        dependencyTypes: [
          'npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg', 'npm-unknown', 'core',
        ],
        pathNot: ANY_PACKAGE,
      },
    },
    {
      name: 'deterministic-packages-use-only-deterministic-packages',
      comment: 'Code of a deterministic package imports only packages that are deterministic too.',
      severity: 'error',
      from: { path: DETERMINISTIC, pathNot: '/tests/' },
      to: { path: ANY_PACKAGE, pathNot: DETERMINISTIC_PACKAGES },
    },
    {
      name: 'rules-stdlib-depends-only-on-kernel-and-hex',
      comment: 'rules-stdlib builds its extensions from the kernel interfaces and the hex geometry, and nothing else.',
      severity: 'error',
      from: { path: '^libs/rules-stdlib/', pathNot: '/tests/' },
      to: { path: ANY_PACKAGE, pathNot: ['^libs/rules-stdlib/', '^libs/kernel/', '^libs/hex/'] },
    },
    {
      name: 'only-tests-use-testkit',
      comment: 'testkit is a test helper: only tests depend on it.',
      severity: 'error',
      from: { path: ANY_PACKAGE, pathNot: ['/tests/', '^libs/testkit/'] },
      to: { path: '^libs/testkit/' },
    },
    {
      name: 'protocol-depends-only-on-kernel',
      comment: 'protocol describes the types of the kernel with schemas and depends on nothing else.',
      severity: 'error',
      from: { path: '^libs/protocol/', pathNot: '/tests/' },
      to: { path: ANY_PACKAGE, pathNot: ['^libs/protocol/', '^libs/kernel/'] },
    },
    {
      name: 'server-has-no-user-interface',
      comment: 'The battle server does not depend on user interface and rendering libraries.',
      severity: 'error',
      from: { path: '^apps/server/' },
      to: { path: ['(^|/)node_modules/(react|react-dom|pixi\\.js)/', '^libs/presentation/'], reachable: true },
    },
    {
      name: 'rules-and-content-have-no-presentation',
      comment: 'The kernel and content loading do not import the presentation layer.',
      severity: 'error',
      from: { path: '^libs/(kernel|content)/', pathNot: '/tests/' },
      to: { path: '^libs/presentation/' },
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
      to: { dependencyTypes: ['npm-dev'], pathNot: ANY_PACKAGE },
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
      to: { path: '^apps/', pathNot: '^$1/$2/' },
    },
    {
      name: 'only-public-entry-across-packages',
      comment: 'Another package is used only through its exports entry point.',
      severity: 'error',
      from: { path: OWN_PACKAGE },
      to: { path: ANY_PACKAGE, pathNot: ['^$1/$2/', `^${FOLDERS}/[^/]+/src/index\\.ts$`] },
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
      from: { path: `^${FOLDERS}/([^/]+)/src/index\\.ts$` },
      to: { path: '^$1/$2/src/', pathNot: ['/tests/', '\\.d\\.ts$'], reachable: false },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: `^${FOLDERS}/[^/]+/dist/` },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['@heroes2dgame/source', 'import', 'types', 'default'],
    },
  },
};
