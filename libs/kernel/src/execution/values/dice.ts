import { REJECTION_REASONS, type RejectionReason } from '../../model/index.ts';
import { rngRange, type RngState } from '../../rng/index.ts';

/**
 * Dice the generator rolled and its state after them.
 */
export interface RolledDice {
  /** The value of every die. */
  readonly dice: readonly number[];
  /** The sum of the dice. */
  readonly result: number;
  /** The generator after the roll. */
  readonly rng: RngState;
}

/**
 * Why the generator could not roll the dice.
 */
export interface FailedRoll {
  /** The reason of the kernel for the rejection of the command. */
  readonly reason: RejectionReason;
}

/**
 * Tells whether a number of dice and a number of sides describe a roll: both are whole numbers from 1.
 */
export function isDiceRoll(count: number, sides: number): boolean {
  return Number.isSafeInteger(count) && count >= 1 && Number.isSafeInteger(sides) && sides >= 1;
}

/**
 * Rolls dice with the generator one by one, each from 1 to the number of sides.
 */
export function rollDice(rng: RngState | undefined, count: number, sides: number): FailedRoll | RolledDice {
  if (rng === undefined) return { reason: REJECTION_REASONS.noGenerator };

  if (!isDiceRoll(count, sides)) return { reason: REJECTION_REASONS.invalidRoll };

  const dice: number[] = [];
  let current = rng;

  for (let index = 0; index < count; index += 1) {
    const draw = rngRange(current, 1, sides);

    if (!draw.ok) {
      return { reason: draw.reason === 'exhausted' ? REJECTION_REASONS.rngExhausted : REJECTION_REASONS.invalidRoll };
    }

    dice.push(draw.value);
    current = draw.rng;
  }

  const result = dice.reduce((sum, value) => sum + value, 0);

  return Number.isSafeInteger(result) ? { dice, result, rng: current } : { reason: REJECTION_REASONS.invalidRoll };
}
