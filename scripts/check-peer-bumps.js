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
    const leavesRange = peerBefore !== undefined && peerAfter !== undefined && !withinCaret(peerAfter, peerBefore);

    if (leavesRange && before !== undefined && bumpLevel(before, manifest.version) === 'patch') {
      problems.push(
        `${manifest.name} ${before} -> ${manifest.version}: ${peer} left the ^${peerBefore} range, `
        + 'so the bump must be minor or major',
      );
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
}

function previousVersion(dir) {
  try {
    return JSON.parse(execFileSync('git', ['show', `HEAD:${dir}/package.json`], { encoding: 'utf8' })).version;
  } catch {
    return undefined;
  }
}

function parse(version) {
  return version.split('-')[0].split('.').map(Number);
}

function withinCaret(version, base) {
  const [major, minor, patch] = parse(version);
  const [baseMajor, baseMinor, basePatch] = parse(base);

  if (baseMajor > 0) return major === baseMajor;
  if (baseMinor > 0) return major === 0 && minor === baseMinor;

  return major === 0 && minor === 0 && patch === basePatch;
}

function bumpLevel(before, after) {
  const [major, minor] = parse(after);
  const [beforeMajor, beforeMinor] = parse(before);

  if (major !== beforeMajor) return 'major';
  if (minor !== beforeMinor) return 'minor';

  return before === after ? 'none' : 'patch';
}
