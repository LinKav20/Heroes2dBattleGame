import type { InputRequest, InputValue, StepInput, Target } from '../../model/index.ts';

/**
 * Checks an answer against the open request and returns the value the waiting step receives, or nothing if the
 * answer does not fit: another kind, a die out of its range, an option not offered, or targets that were not offered,
 * repeat or are too many or too few.
 */
export function readAnswer(request: InputRequest, value: InputValue): StepInput | undefined {
  if (request.kind === 'roll' && value.kind === 'roll') {
    const fits = value.dice.length === request.dice
      && value.dice.every((die) => Number.isSafeInteger(die) && die >= 1 && die <= request.sides);

    return fits ? { dice: value.dice, kind: 'roll', result: value.dice.reduce((sum, die) => sum + die, 0) } : undefined;
  }

  if (request.kind === 'choice' && value.kind === 'choice') {
    return request.options.includes(value.option) ? value : undefined;
  }

  if (request.kind === 'target' && value.kind === 'target') {
    const chosen = value.targets.map(targetKey);
    const offered = new Set(request.targets.map(targetKey));
    const fits = chosen.length === request.count
      && new Set(chosen).size === chosen.length
      && chosen.every((key) => offered.has(key));

    return fits ? value : undefined;
  }

  return undefined;
}

function targetKey(target: Target): string {
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
      return 'unknown';
    }
  }
}
