import type { Unit } from '../model/index.ts';

/**
 * The health of a unit: how many creatures are left and the health of the one that takes damage first.
 */
export interface UnitHealth {
  /** How many creatures are left. */
  readonly count: number;
  /** The health of the creature that takes damage first. */
  readonly health: number;
}

/**
 * Returns the health of a unit after damage. The creature that takes damage first loses its health, and the rest of the
 * damage goes to the others, each of which has `maxHealth`; a creature dies when its health reaches 0, and the next one
 * takes damage first. A unit whose creatures all die has none left and no health.
 */
export function damaged(unit: Unit, maxHealth: number, amount: number): UnitHealth {
  if (amount < unit.health) return { count: unit.count, health: unit.health - amount };

  const others = BigInt(unit.count - 1) * BigInt(maxHealth);
  const left = others - BigInt(amount - unit.health);

  if (left <= 0n) return { count: 0, health: 0 };

  const count = (left + BigInt(maxHealth) - 1n) / BigInt(maxHealth);

  return { count: Number(count), health: Number(left - (count - 1n) * BigInt(maxHealth)) };
}

/**
 * Returns the health of a unit after healing: only the creature that takes damage first is healed, up to `maxHealth`,
 * and its health never goes down. Dead creatures stay dead.
 */
export function healed(unit: Unit, maxHealth: number, amount: number): UnitHealth {
  const health = Math.max(unit.health, Math.min(maxHealth, unit.health + amount));

  return { count: unit.count, health };
}
