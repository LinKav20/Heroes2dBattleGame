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

  const max = BigInt(maxHealth);

  return fromTotal(BigInt(unit.count - 1) * max - BigInt(amount - unit.health), max);
}

/**
 * Returns the health of a unit after healing: only the creature that takes damage first is healed, up to `maxHealth`,
 * and its health never goes down. Dead creatures stay dead.
 */
export function healed(unit: Unit, maxHealth: number, amount: number): UnitHealth {
  const health = Math.max(unit.health, Math.min(maxHealth, unit.health + amount));

  return { count: unit.count, health };
}

/**
 * Returns the health of a unit after healing that revives: the creature that takes damage first is healed up to
 * `maxHealth`, and the rest of the healing brings dead creatures back, never more than the unit started with. Every
 * creature that comes back takes up to `maxHealth`, so the last one gets what is left of the healing and takes damage
 * first. If the creature that takes damage first has more than `maxHealth`, it keeps its health, and only the whole
 * creatures the healing pays for come back.
 */
export function revived(unit: Unit, maxHealth: number, amount: number): UnitHealth {
  const max = BigInt(maxHealth);
  const gain = BigInt(amount);

  if (unit.count > 0 && unit.health > maxHealth) {
    const whole = smaller(gain / max, BigInt(unit.startCount - unit.count));

    return { count: unit.count + Number(whole), health: unit.health };
  }

  const now = unit.count === 0 ? 0n : BigInt(unit.count - 1) * max + BigInt(unit.health);
  const total = smaller(now + gain, BigInt(unit.startCount) * max);

  return total <= now ? { count: unit.count, health: unit.health } : fromTotal(total, max);
}

function fromTotal(total: bigint, max: bigint): UnitHealth {
  if (total <= 0n) return { count: 0, health: 0 };

  const count = (total + max - 1n) / max;

  return { count: Number(count), health: Number(total - (count - 1n) * max) };
}

function smaller(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
