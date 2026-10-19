import { ContentError } from '../content/index.ts';
import type {
  Evaluation,
  MechanicContext,
  MechanicExtension,
  StepContext,
  StepDraft,
  TurnOrderVariant,
} from '../extensions/index.ts';
import type { SideId } from '../ids/index.ts';
import {
  battleUnit,
  findSide,
  isFormulaReason,
  standsOnField,
  type BattleState,
  type TurnHolder,
} from '../model/index.ts';
import { BATTLE_MOMENTS, type Registry } from '../names/index.ts';
import { checkOwnDrafts } from '../operations/index.ts';
import { mechanicContext, turnOrderOf } from './mechanics.ts';
import type { HookMoment } from './params.ts';

/**
 * A side or a unit that gets the next turn, with the side whose turn it is.
 */
export interface NextTurn {
  /** The side or the unit. */
  readonly holder: TurnHolder;
  /** The side of the holder. */
  readonly side: SideId;
}

type Hook = (
  variant: TurnOrderVariant,
  context: MechanicContext,
  holder: TurnHolder | undefined,
) => readonly StepDraft[] | undefined;

/**
 * Returns the value of an evaluation that a variant of a mechanic or a step of the course of the battle made, which
 * cannot fail: a rejection is an error of the content if a formula gave it and of the package otherwise.
 *
 * @throws {ContentError} If the evaluation rejects with a reason of a formula.
 * @throws {TypeError} If the evaluation rejects with another reason or asks for a roll.
 */
export function settledValue<Value>(evaluation: Evaluation<Value>, source: string): Value {
  if (evaluation.kind === 'value') return evaluation.value;

  if (evaluation.kind === 'need') throw new TypeError(`${JSON.stringify(source)} asks for a roll where it cannot.`);

  const message = `${JSON.stringify(source)} cannot go on: ${JSON.stringify(evaluation.reason)}.`;

  throw typeof evaluation.reason === 'string' && isFormulaReason(evaluation.reason)
    ? new ContentError(message)
    : new TypeError(message);
}

/**
 * Returns who gets the next turn of the round by the order of turns of the ruleset, or nothing if the round is over.
 *
 * @throws {ContentError} If the ruleset chooses no order of turns, or the order of turns rejects with a reason of a
 * formula.
 * @throws {TypeError} If no package declares the order of turns, or it rejects with another reason, gives a turn to a
 * side when the ruleset gives turns to units or the other way round, or to a unit that is not on the field.
 */
export function nextTurnOf(context: StepContext, mechanics: Registry<MechanicExtension>): NextTurn | undefined {
  const { state } = context;
  const { params, variant } = turnOrderOf(mechanics, state.ruleset);
  const answer = variant.next(mechanicContext(context, params));

  const shape: unknown = answer.kind;

  if (shape !== 'value' && shape !== 'reject') {
    throw new TypeError(`${JSON.stringify(variant.name)} gives an unknown answer to who goes next.`);
  }

  const holder = settledValue(answer, variant.name);

  return holder === undefined ? undefined : { holder, side: sideOfHolder(state, variant, holder) };
}

/**
 * Tells whether the order of turns has a hook for a moment.
 */
export function hasHook(variant: TurnOrderVariant, moment: HookMoment): boolean {
  return variant[HOOK_NAMES[moment]] !== undefined;
}

/**
 * Returns the steps of the hook of the order of turns for a moment.
 *
 * @throws {TypeError} If the hook adds a step that only the kernel adds.
 */
export function hookSteps(
  variant: TurnOrderVariant,
  context: MechanicContext,
  moment: HookMoment,
  holder: TurnHolder | undefined,
): readonly StepDraft[] {
  const steps = HOOKS[moment](variant, context, holder) ?? [];

  checkOwnDrafts(variant.name, steps);

  return steps;
}

const HOOK_NAMES = Object.freeze({
  [BATTLE_MOMENTS.battleStart]: 'battleStart',
  [BATTLE_MOMENTS.roundEnd]: 'roundEnd',
  [BATTLE_MOMENTS.roundStart]: 'roundStart',
  [BATTLE_MOMENTS.turnEnd]: 'turnEnd',
  [BATTLE_MOMENTS.turnStart]: 'turnStart',
} as const satisfies Record<HookMoment, keyof typeof BATTLE_MOMENTS>);

const HOOKS: Readonly<Record<HookMoment, Hook>> = Object.freeze({
  [BATTLE_MOMENTS.battleStart]: (variant, context) => variant.battleStart?.(context),
  [BATTLE_MOMENTS.roundEnd]: (variant, context) => variant.roundEnd?.(context),
  [BATTLE_MOMENTS.roundStart]: (variant, context) => variant.roundStart?.(context),
  [BATTLE_MOMENTS.turnEnd]: (variant, context, holder) =>
    (holder === undefined ? undefined : variant.turnEnd?.(context, holder)),
  [BATTLE_MOMENTS.turnStart]: (variant, context, holder) =>
    (holder === undefined ? undefined : variant.turnStart?.(context, holder)),
});

function sideOfHolder(state: BattleState, variant: TurnOrderVariant, holder: TurnHolder): SideId {
  const label = JSON.stringify(variant.name);

  if (holder.kind === 'side') {
    if (state.ruleset.turnOwner !== 'side') throw new TypeError(`${label} gives a turn to a side, not to a unit.`);

    if (findSide(state, holder.side) === undefined) {
      throw new TypeError(`${label} gives a turn to the side ${JSON.stringify(holder.side)}, which is not there.`);
    }

    return holder.side;
  }

  if (state.ruleset.turnOwner !== 'unit') throw new TypeError(`${label} gives a turn to a unit, not to a side.`);

  const unit = battleUnit(state, holder.unit);

  if (!standsOnField(unit)) {
    throw new TypeError(`${label} gives a turn to the unit ${JSON.stringify(unit.id)}, which is not on the field.`);
  }

  return unit.side;
}
