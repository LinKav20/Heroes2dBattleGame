import { execFileSync } from 'node:child_process';
import { workspacePackages } from './workspace.js';

const packages = workspacePackages();
const previousVersions = new Map(packages.map(({ dir, manifest }) => [manifest.name, previousVersion(dir)]));
const problems = [];

for (const { manifest } of packages) {
  const before = previousVersions.get(manifest.name);

  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    const peerBefore = previousVersions.get(peer);
    const peerAfter = packages.find((candidate) => candidate.manifest.name === peer)?.manifest.version;
    const range = manifest.peerDependencies?.[peer] ?? '';
    const known = peerBefore !== undefined && peerAfter !== undefined;
    const leavesRange = known && !withinRange(range, peerAfter, peerBefore);
    const level = before === undefined ? 'new' : bumpLevel(before, manifest.version);

    if (leavesRange && (level === 'patch' || level === 'none')) {
      problems.push(
        `${manifest.name} ${before} -> ${manifest.version}: `
        + `${peer} ${peerBefore} -> ${peerAfter} left its ${range} range, so the bump must be minor or major`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Every package whose peer left its range got a minor or major bump.');
}

function previousVersion(dir) {
  try {
    const text = execFileSync('git', ['show', `HEAD:${dir}/package.json`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return JSON.parse(text).version;
  } catch {
    return undefined;
  }
}

function versionParts(version) {
  return version.split('-')[0].split('.').map(Number);
}

function withinRange(range, version, base) {
  const kind = range.replace(/^workspace:/, '');

  if (kind === '*') return true;
  if (kind === '~') return sameParts(version, base, 2);
  if (kind !== '^') return version === base;

  return withinCaret(version, base);
}

function sameParts(version, base, count) {
  return versionParts(version).slice(0, count).join('.') === versionParts(base).slice(0, count).join('.');
}

function withinCaret(version, base) {
  const [major, minor, patch] = versionParts(version);
  const [baseMajor, baseMinor, basePatch] = versionParts(base);

  if (baseMajor > 0) return major === baseMajor;
  if (baseMinor > 0) return major === 0 && minor === baseMinor;

  return major === 0 && minor === 0 && patch === basePatch;
}

function bumpLevel(before, after) {
  const [major, minor] = versionParts(after);
  const [beforeMajor, beforeMinor] = versionParts(before);

  if (major !== beforeMajor) return 'major';
  if (minor !== beforeMinor) return 'minor';

  return before === after ? 'none' : 'patch';
}
