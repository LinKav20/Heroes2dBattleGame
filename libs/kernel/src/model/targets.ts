import type { Target } from './input-requests.ts';

/**
 * Returns a key that tells targets apart: two targets with the same key are the same target.
 */
export function targetKey(target: Target): string {
  switch (target.kind) {
    case 'cell': {
      return `cell:${target.cell}`;
    }

    case 'side': {
      return `side:${target.side}`;
    }

    case 'unit': {
      return `unit:${target.unit}`;
    }

    default: {
      throw new TypeError('Unknown kind of target.');
    }
  }
}

/**
 * Returns a copy of a target with only the fields of its kind.
 */
export function copyTarget(target: Target): Target {
  switch (target.kind) {
    case 'cell': {
      return { cell: target.cell, kind: 'cell' };
    }

    case 'side': {
      return { kind: 'side', side: target.side };
    }

    case 'unit': {
      return { kind: 'unit', unit: target.unit };
    }

    default: {
      throw new TypeError('Unknown kind of target.');
    }
  }
}

/**
 * Tells whether all targets in a list are different.
 */
export function allDifferent(targets: readonly Target[]): boolean {
  return new Set(targets.map(targetKey)).size === targets.length;
}
