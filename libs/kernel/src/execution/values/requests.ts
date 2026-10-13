import { VISIBLE_TO_ALL, type SideId, type VisibleTo } from '../../ids/index.ts';
import type { StepNeed } from '../../kinds/index.ts';
import type { InputRequest } from '../../model/index.ts';

/**
 * Turns a value a step needs into an input request with the given identifier.
 */
export function requestFor(need: StepNeed, id: number): InputRequest {
  const owner = {
    ...(need.side === undefined ? {} : { side: need.side }),
    ...(need.unit === undefined ? {} : { unit: need.unit }),
  };

  switch (need.kind) {
    case 'choice': {
      return { id, kind: 'choice', options: need.options, ...owner };
    }

    case 'roll': {
      return { dice: need.dice, id, kind: 'roll', sides: need.sides, value: need.value, ...owner };
    }

    case 'target': {
      return { count: need.count, id, kind: 'target', targets: need.targets, ...owner };
    }

    default: {
      throw new TypeError('A step needs an unknown kind of value.');
    }
  }
}

/**
 * Returns who sees an input request and its answer: the side of the request, or every side if it has none.
 */
export function requestAudience(side: SideId | undefined): VisibleTo {
  return side === undefined ? VISIBLE_TO_ALL : [side];
}
