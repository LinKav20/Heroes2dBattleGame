import type { StepNeed } from '../../extensions/index.ts';
import { VISIBLE_TO_ALL, type VisibleTo } from '../../ids/index.ts';
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
      return { id, kind: 'choice', name: need.name, options: need.options, ...owner };
    }

    case 'roll': {
      const visibility = need.visibleTo === undefined ? {} : { visibleTo: need.visibleTo };

      return { count: need.count, id, kind: 'roll', name: need.name, sides: need.sides, ...visibility, ...owner };
    }

    case 'target': {
      return { count: need.count, id, kind: 'target', name: need.name, targets: need.targets, ...owner };
    }

    default: {
      throw new TypeError('A step needs an unknown kind of value.');
    }
  }
}

/**
 * Returns who sees an input request and the closing of it: the side of the request, or every side if it has none.
 */
export function requestAudience(request: InputRequest): VisibleTo {
  return request.side === undefined ? VISIBLE_TO_ALL : [request.side];
}
