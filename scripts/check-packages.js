import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT_DIR, workspacePackages } from './workspace.js';

const LICENSE = 'PolyForm-Noncommercial-1.0.0';
const NODE_ENGINES = '>=22.12';
const KERNEL = '@heroes2dgame/kernel';
const NAME_PREFIXES = { libs: '', adapters: 'adapter-', packs: 'pack-' };
const REQUIRED_DETERMINISTIC = ['libs/hex', 'libs/kernel'];
const KERNEL_FORBIDDEN_IN = ['dependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies'];
const PUBLISHED_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const TSCONFIGS = ['tsconfig.json', 'tsconfig.lib.json', 'tsconfig.test.json', 'tsconfig.build.json'];
const CODE_FILES = ['dist', 'src', '!src/**/tests', '!src/**/*.test.ts', 'LICENSE.md', 'CHANGELOG.md'];
const CODE_EXPORTS = {
  '.': { '@heroes2dgame/source': './src/index.ts', types: './dist/index.d.ts', default: './dist/index.js' },
  './package.json': './package.json',
};
const CODE_SCRIPTS = {
  build: 'pnpm run clean && tsc -p tsconfig.build.json',
  typecheck: 'tsc -p tsconfig.lib.json && tsc -p tsconfig.test.json',
  clean: 'node -e "require(\'node:fs\').rmSync(\'dist\',{recursive:true,force:true})"',
  prepack: 'pnpm run build',
};

const rootManifest = readJson('package.json');
const packages = workspacePackages();
const privateNames = new Set(
  packages.filter(({ manifest }) => manifest.private === true).map(({ manifest }) => manifest.name),
);
const expectedLicenseText = readFileSync(join(ROOT_DIR, 'LICENSE.md'), 'utf8')
  .replace(
    'Everything in this repository, including the packages and the documentation, is\nlicensed under the',
    'This package is licensed under the',
  )
  .replace(
    'See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)',
    'See COMMERCIAL-LICENSE.md in the project repository',
  );

const problems = packages.flatMap((pkg) => checkPackage(pkg).map((problem) => `${pkg.dir}: ${problem}`));

for (const dir of REQUIRED_DETERMINISTIC) {
  if (!packages.some((pkg) => pkg.dir === dir)) problems.push(`${dir}: the package must exist`);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All packages follow the package rules.');
}

function checkPackage({ folder, name, dir, manifest }) {
  if (folder === 'apps') return manifest.private === true ? [] : ['applications must be "private": true'];

  const fullName = `@heroes2dgame/${NAME_PREFIXES[folder]}${name}`;
  const deterministic = manifest.heroes2dgame?.deterministic;
  const published = manifest.private !== true;
  const requirements = [
    [manifest.name === fullName, `name must be ${fullName}`],
    [manifest.license === LICENSE, `license must be ${LICENSE}`],
    [readText(join(dir, 'LICENSE.md')) === expectedLicenseText, 'LICENSE.md must match the package license text'],
    [!published || existsSync(join(ROOT_DIR, dir, 'README.md')), 'published packages need README.md'],
    [manifest.type === 'module', 'type must be module'],
    [same(manifest.publishConfig, { access: 'public' }), 'publishConfig must be exactly { "access": "public" }'],
    [manifest.engines?.node === NODE_ENGINES, `engines.node must be ${NODE_ENGINES}`],
    [manifest.repository?.url === rootManifest.repository.url, 'repository.url must match the root package.json'],
    [manifest.repository?.directory === dir, `repository.directory must be ${dir}`],
    [manifest.homepage === rootManifest.homepage, 'homepage must match the root package.json'],
    [same(manifest.bugs, rootManifest.bugs), 'bugs must match the root package.json'],
    [manifest.author === rootManifest.author, 'author must match the root package.json'],
    [deterministic === undefined || typeof deterministic === 'boolean', 'heroes2dgame.deterministic must be a boolean'],
    [!REQUIRED_DETERMINISTIC.includes(dir) || deterministic === true, 'heroes2dgame.deterministic must be true'],
    ...KERNEL_FORBIDDEN_IN.map((field) => [
      !hasDependency(manifest[field], KERNEL),
      `${KERNEL} must be a peer dependency, not in ${field}`,
    ]),
    ...PUBLISHED_DEPENDENCY_FIELDS.map((field) => [
      !published || privateDependencies(manifest[field]).length === 0,
      `${field} of a published package must not include private packages`,
    ]),
    ...(folder === 'packs' ? packRequirements(dir, manifest) : codeRequirements(dir, manifest)),
  ];

  return requirements.filter(([satisfied]) => !satisfied).map(([, problem]) => problem);
}

function packRequirements(dir, manifest) {
  const packManifest = readText(join(dir, 'pack.json'));

  return [
    [
      packManifest === undefined || JSON.parse(packManifest).version === manifest.version,
      'the package version must match pack.json',
    ],
  ];
}

function codeRequirements(dir, manifest) {
  return [
    [manifest.sideEffects === false, 'sideEffects must be false'],
    [same(manifest.exports, CODE_EXPORTS), `exports must be exactly ${JSON.stringify(CODE_EXPORTS)}`],
    [same(manifest.files, CODE_FILES), `files must be exactly ${JSON.stringify(CODE_FILES)}`],
    [same(manifest.scripts, CODE_SCRIPTS), `scripts must be exactly ${JSON.stringify(CODE_SCRIPTS)}`],
    [existsSync(join(ROOT_DIR, dir, 'src', 'index.ts')), 'the package needs src/index.ts'],
    [
      TSCONFIGS.every((file) => existsSync(join(ROOT_DIR, dir, file))),
      `the package needs ${TSCONFIGS.join(', ')}`,
    ],
  ];
}

function privateDependencies(field) {
  return Object.keys(field ?? {}).filter((dependency) => privateNames.has(dependency));
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function hasDependency(field, name) {
  return Array.isArray(field) ? field.includes(name) : field?.[name] !== undefined;
}

function readJson(file) {
  return JSON.parse(readFileSync(join(ROOT_DIR, file), 'utf8'));
}

function readText(file) {
  const path = join(ROOT_DIR, file);

  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}
