import { workspacePackages } from './workspace.js';

const unreleasable = workspacePackages()
  .filter(({ folder, manifest }) => folder !== 'apps' && manifest.private !== true && manifest.version === '0.0.0')
  .map(({ manifest }) => manifest.name);

if (unreleasable.length > 0) {
  console.error(`Version 0.0.0 is never published. Add a changeset and release again: ${unreleasable.join(', ')}`);
  process.exitCode = 1;
}
