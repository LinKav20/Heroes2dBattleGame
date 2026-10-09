import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT_DIR, workspacePackages } from './workspace.js';

const require = createRequire(import.meta.url);
const failures = [];

for (const { dir, manifest } of workspacePackages().filter(({ folder }) => folder !== 'apps')) {
  const entry = manifest.exports?.['.']?.default;

  if (typeof entry !== 'string') continue;

  const file = join(ROOT_DIR, dir, entry);

  try {
    const imported = await import(pathToFileURL(file).href);
    const required = require(file);

    if (Object.keys(imported).join() !== Object.keys(required).join()) {
      failures.push(`${dir}: import and require give different exports`);
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
