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

export function workspaceImports(dir) {
  const sourceDir = join(ROOT_DIR, dir, 'src');

  if (!existsSync(sourceDir)) return [];

  const sources = readdirSync(sourceDir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.split(/[\\/]/).includes('tests'));
  const names = sources.flatMap((file) => [
    ...readFileSync(join(sourceDir, file), 'utf8').matchAll(/from\s+'(@heroes2dgame\/[a-z0-9-]+)/g),
  ].map((match) => match[1]));

  return [...new Set(names)].sort();
}
