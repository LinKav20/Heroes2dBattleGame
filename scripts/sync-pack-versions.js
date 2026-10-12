import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT_DIR, workspacePackages } from './workspace.js';

for (const { dir, manifest } of workspacePackages().filter(({ folder }) => folder === 'packs')) {
  const file = join(ROOT_DIR, dir, 'pack.json');

  if (!existsSync(file)) continue;

  const pack = JSON.parse(readFileSync(file, 'utf8'));

  if (pack.version !== manifest.version) {
    writeFileSync(file, `${JSON.stringify({ ...pack, version: manifest.version }, null, 2)}\n`);
    console.log(`${dir}/pack.json: version ${String(pack.version)} -> ${String(manifest.version)}`);
  }
}
