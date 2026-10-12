import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT_DIR, workspacePackages } from './workspace.js';

const failures = [];

for (const { dir, manifest } of workspacePackages().filter(({ folder }) => folder !== 'apps')) {
  if (manifest.exports?.['.'] === undefined) continue;

  try {
    const requireFromPackage = createRequire(join(ROOT_DIR, dir, 'package.json'));
    const file = requireFromPackage.resolve(manifest.name);
    const imported = await import(pathToFileURL(file).href);
    const required = requireFromPackage(manifest.name);

    if (imported !== required) {
      failures.push(`${dir}: import and require load two different module instances`);
    }
  } catch (error) {
    failures.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Built packages load with import and require on Node.js ${process.versions.node}.`);
}
