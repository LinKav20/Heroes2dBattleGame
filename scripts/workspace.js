import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT_DIR = join(import.meta.dirname, '..');
export const PACKAGE_FOLDERS = ['libs', 'adapters', 'apps', 'packs'];

export function workspacePackages() {
  return PACKAGE_FOLDERS
    .filter((folder) => existsSync(join(ROOT_DIR, folder)))
    .flatMap((folder) => readdirSync(join(ROOT_DIR, folder)).sort().map((name) => ({ folder, name })))
    .filter(({ folder, name }) => existsSync(join(ROOT_DIR, folder, name, 'package.json')))
    .map(({ folder, name }) => ({
      folder,
      name,
      dir: `${folder}/${name}`,
      manifest: JSON.parse(readFileSync(join(ROOT_DIR, folder, name, 'package.json'), 'utf8')),
    }));
}

export function deterministicPackageDirs() {
  return workspacePackages()
    .filter(({ manifest }) => manifest.heroes2dgame?.deterministic === true)
    .map(({ dir }) => dir);
}
