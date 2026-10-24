import { ContentError, type Ability, type AreaRule, type TargetRule } from '../content/index.ts';
import type { SideHolder, UnitHolder } from '../model/index.ts';

/**
 * Checks the parts of the definition of an ability that matter when a unit or a side uses it: the cost and the
 * cooldown are whole numbers from 0, the limits of uses are whole numbers from 1, a side spends neither actions nor
 * resources and has neither a range, nor sight, nor a line or a cone, an ability without targets has no rules for
 * them, an ability with targets chooses from 1 of them, `sight` and `dead` are true or false, only an ability that
 * targets a unit takes dead targets, and only an ability that targets an area has an area, of a whole number of cells
 * from 0, and it chooses one cell.
 *
 * @throws {ContentError} If the definition breaks any of these rules.
 */
export function checkAbility(ability: Ability, user: SideHolder | UnitHolder): void {
  const problem = abilityProblem(ability, user);

  if (problem !== undefined) {
    throw new ContentError(`The ability ${JSON.stringify(ability.name)} ${problem}.`, { definition: ability.name });
  }
}

/**
 * Tells whether an area goes from the user: a line or a cone.
 */
export function isDirected(area: AreaRule | undefined): boolean {
  return area !== undefined && area.shape !== 'radius';
}

const TARGETLESS_UNUSED: ReadonlyArray<keyof TargetRule> = ['area', 'count', 'dead', 'filter', 'range', 'sight'];

const FLAGS = ['sight', 'dead'] as const;

function abilityProblem(ability: Ability, user: SideHolder | UnitHolder): string | undefined {
  const { cooldown, cost, limits, target } = ability;
  const costs = [...Object.values(cost.actions), ...Object.values(cost.resources)];

  if (!costs.every((value) => isWholeFrom(value, 0))) return 'needs whole numbers from 0 in its cost';

  if (user.kind === 'side' && costs.some((value) => value > 0)) {
    return 'belongs to a side, which spends neither actions nor resources';
  }

  if (!isWholeFrom(cooldown, 0)) return 'needs a whole number from 0 in cooldown';

  const counts = [limits.perTurn, limits.perRound, limits.perBattle];

  if (!counts.every((limit) => limit === undefined || isWholeFrom(limit, 1))) {
    return 'needs whole numbers from 1 in its limits';
  }

  if (target.kind === 'none' || target.kind === 'self') {
    const unused = TARGETLESS_UNUSED.filter((part) => target[part] !== undefined);

    return unused.length === 0 ? undefined : `has no targets, but has ${unused.join(', ')} in target`;
  }

  if (target.area !== undefined && target.kind !== 'area') return 'has an area, but its target is not an area';

  const notFlag = FLAGS.find((flag) => !isFlag(target[flag]));

  if (notFlag !== undefined) return `needs true or false in ${notFlag}`;

  if (target.dead === true && target.kind !== 'unit') return 'takes dead targets, but its target is not a unit';

  if (target.kind === 'area' && !(target.area !== undefined && isWholeFrom(target.area.size, 0))) {
    return 'targets an area, but has no area of a whole number of cells from 0';
  }

  if (target.range !== undefined && !isWholeFrom(target.range, 0)) return 'needs a whole number from 0 in range';

  if (user.kind === 'side' && (target.range !== undefined || target.sight === true || isDirected(target.area))) {
    return 'belongs to a side, which has no cells to count a range, to see from or to start a line or a cone from';
  }

  if (target.count !== undefined && !isWholeFrom(target.count, 1)) return 'needs a whole number from 1 in count';

  return target.kind === 'area' && (target.count ?? 1) > 1 ? 'targets an area, which takes one cell' : undefined;
}

function isFlag(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isWholeFrom(value: number, least: number): boolean {
  return Number.isSafeInteger(value) && value >= least;
}
