import { MAX_DICE_PER_ROLL, MAX_DIE_SIDES } from '../../expressions/index.ts';
import type { StepNeed } from '../../extensions/index.ts';
import { sideSees } from '../../ids/index.ts';
import { allDifferent, findUnit, type BattleState } from '../../model/index.ts';

/**
 * Checks that a value a step needs can be given: a roll has from 1 to {@link MAX_DICE_PER_ROLL} dice of 1 to
 * {@link MAX_DIE_SIDES} sides, a choice has different options, and a choice of targets has different targets and
 * a count from 1 to their number.
 *
 * @throws {TypeError} If the need cannot be met; it is an error of the extension that declares the step.
 */
export function checkNeed(step: string, need: StepNeed): void {
  const problem = needProblem(need);

  if (problem !== undefined) throw new TypeError(`The step ${JSON.stringify(step)} needs ${problem}.`);
}

/**
 * Checks that a choice of targets offers only units that the side that chooses sees, or, without a side, units marked
 * as seen by all, so the request never names a unit hidden from whoever sees it: a request without a side reaches
 * every actor, an actor who sees what no side sees included, and a unit marked with a list of sides is hidden from
 * such an actor even if the list names every side.
 *
 * @throws {TypeError} If a target is a unit that is not in the battle or that the choosing sides do not see; it is an
 * error of the extension that declares the step.
 */
export function checkSeenTargets(step: string, need: StepNeed, state: BattleState): void {
  if (need.kind !== 'target') return;

  const unseen = need.targets.find((target) => target.kind === 'unit'
    && !sideSees(need.side, findUnit(state, target.unit)?.visibleTo ?? []));

  if (unseen?.kind === 'unit') {
    throw new TypeError(
      `The step ${JSON.stringify(step)} offers the unit ${JSON.stringify(unseen.unit)}, `
      + 'which the choosing sides do not see.',
    );
  }
}

function needProblem(need: StepNeed): string | undefined {
  switch (need.kind) {
    case 'roll': {
      return isWholeIn(need.count, MAX_DICE_PER_ROLL) && isWholeIn(need.sides, MAX_DIE_SIDES)
        ? undefined
        : `a roll of ${String(need.count)} dice with ${String(need.sides)} sides`;
    }

    case 'choice': {
      return need.options.length > 0 && new Set(need.options).size === need.options.length
        ? undefined
        : 'a choice without options or with repeated options';
    }

    case 'target': {
      return need.targets.length > 0 && allDifferent(need.targets) && isWholeIn(need.count, need.targets.length)
        ? undefined
        : `a choice of ${String(need.count)} targets from ${String(need.targets.length)} different ones`;
    }

    default: {
      return 'an unknown kind of value';
    }
  }
}

function isWholeIn(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= max;
}
