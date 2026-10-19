import {
  allDifferent,
  copyTarget,
  targetKey,
  type InputRequest,
  type InputValue,
  type StepInput,
} from '../../model/index.ts';

/**
 * Checks an answer against the open request and returns the value the waiting step receives, or nothing if the
 * answer does not fit: another kind, a wrong number of dice or a die out of its range, an option not offered, or
 * targets that were not offered, repeat or are too many or too few.
 *
 * The value is built anew from the fields the kernel knows, so extra fields of the answer reach neither the state nor
 * the journal.
 */
export function readAnswer(request: InputRequest, value: InputValue): StepInput | undefined {
  if (request.kind === 'roll' && value.kind === 'roll') {
    const fits = value.dice.length === request.count
      && value.dice.every((die) => Number.isSafeInteger(die) && die >= 1 && die <= request.sides);
    const dice = [...value.dice];

    return fits
      ? { dice, kind: 'roll', name: request.name, result: dice.reduce((sum, die) => sum + die, 0) }
      : undefined;
  }

  if (request.kind === 'choice' && value.kind === 'choice') {
    return request.options.includes(value.option) ? { kind: 'choice', option: value.option } : undefined;
  }

  if (request.kind === 'target' && value.kind === 'target') {
    const offered = new Set(request.targets.map(targetKey));
    const fits = value.targets.length === request.count
      && allDifferent(value.targets)
      && value.targets.every((target) => offered.has(targetKey(target)));

    return fits ? { kind: 'target', targets: value.targets.map(copyTarget) } : undefined;
  }

  return undefined;
}
