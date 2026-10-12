import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT_DIR } from './workspace.js';

const CHANGESET_DIR = join(ROOT_DIR, '.changeset');
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n?---/;

const empty = existsSync(CHANGESET_DIR)
  ? readdirSync(CHANGESET_DIR)
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .filter((file) => (FRONT_MATTER.exec(readFileSync(join(CHANGESET_DIR, file), 'utf8'))?.[1] ?? '').trim() === '')
  : [];

if (empty.length > 0) {
  console.error(`Empty changesets block releases. Describe the change as a patch instead: ${empty.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Every changeset names the packages it changes.');
}
