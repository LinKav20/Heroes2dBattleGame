import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT_DIR, workspacePackages } from './workspace.js';

const LICENSE = 'PolyForm-Noncommercial-1.0.0';
const NODE_ENGINES = '>=22.12';
const NAME_PREFIXES = { libs: '', adapters: 'adapter-', packs: 'pack-' };
const TSCONFIGS = ['tsconfig.json', 'tsconfig.lib.json', 'tsconfig.test.json', 'tsconfig.build.json'];
const SCRIPTS = ['build', 'typecheck', 'clean', 'prepack'];
const EXPORT_CONDITIONS = ['@heroes2dgame/source', 'types', 'default'];

const rootManifest = readJson('package.json');
const expectedLicenseText = readFileSync(join(ROOT_DIR, 'LICENSE.md'), 'utf8')
  .replace(
    'Everything in this repository, including the packages and the documentation, is\nlicensed under the',
    'This package is licensed under the',
  )
  .replace(
    'See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)',
    'See COMMERCIAL-LICENSE.md in the project repository',
  );

const problems = workspacePackages().flatMap((pkg) => checkPackage(pkg).map((problem) => `${pkg.dir}: ${problem}`));

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All packages follow the package rules.');
}

function checkPackage({ folder, name, dir, manifest }) {
  if (folder === 'apps') return manifest.private === true ? [] : ['applications must be "private": true'];

  const problems = [];

  const expect = (condition, problem) => {
    if (!condition) problems.push(problem);
  };

  const entry = manifest.exports?.['.'] ?? {};
  const licenseFile = join(ROOT_DIR, dir, 'LICENSE.md');

  expect(manifest.name === `@heroes2dgame/${NAME_PREFIXES[folder]}${name}`, `name must be @heroes2dgame/${NAME_PREFIXES[folder]}${name}`);
  expect(manifest.license === LICENSE, `license must be ${LICENSE}`);
  expect(existsSync(licenseFile) && readFileSync(licenseFile, 'utf8') === expectedLicenseText, 'LICENSE.md must match the package license text');
  expect(manifest.private === true || existsSync(join(ROOT_DIR, dir, 'README.md')), 'published packages need README.md');
  expect(manifest.files?.includes('LICENSE.md') && manifest.files.includes('dist'), 'files must include dist and LICENSE.md');
  expect(manifest.type === 'module', 'type must be module');
  expect(manifest.sideEffects === false, 'sideEffects must be false');
  expect(JSON.stringify(Object.keys(entry)) === JSON.stringify(EXPORT_CONDITIONS), `exports["."] must have the conditions ${EXPORT_CONDITIONS.join(', ')} in this order`);
  expect(manifest.exports?.['./package.json'] === './package.json', 'exports must include ./package.json');
  expect(manifest.publishConfig?.access === 'public', 'publishConfig.access must be public');
  expect(manifest.engines?.node === NODE_ENGINES, `engines.node must be ${NODE_ENGINES}`);
  expect(manifest.repository?.url === rootManifest.repository.url, 'repository.url must match the root package.json');
  expect(manifest.repository?.directory === dir, `repository.directory must be ${dir}`);
  expect(SCRIPTS.every((script) => typeof manifest.scripts?.[script] === 'string'), `scripts must include ${SCRIPTS.join(', ')}`);
  expect(TSCONFIGS.every((file) => existsSync(join(ROOT_DIR, dir, file))), `the package needs ${TSCONFIGS.join(', ')}`);

  return problems;
}

function readJson(file) {
  return JSON.parse(readFileSync(join(ROOT_DIR, file), 'utf8'));
}
