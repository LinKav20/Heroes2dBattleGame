import {
  ContentError,
  DONE,
  KERNEL_MECHANICS,
  standsOnField,
  VISIBLE_TO_NONE,
  type BattleState,
  type ContentName,
  type JsonObject,
  type MechanicContext,
  type StepContext,
  type StepDraft,
  type StepKind,
  type StepResult,
  type TurnHolder,
  type TurnOrderVariant,
  type Unit,
} from '@heroes2dgame/kernel';
import { initiativeData, initiativeSchema, type InitiativeData } from './events.ts';
import { attributeOf, firstOf, freshUnits, holderOf, rollNeed, stepKind } from './helpers.ts';
import { RULES_STDLIB_NAMES } from './names.ts';
import { DIE_SCHEMA, FULL_NAME_SCHEMA } from './schemas.ts';

/**
 * The parameters of the order of turns by a roll of initiative: the random value and the sides of its die, the
 * attribute added to the roll, and the attribute that decides between equal initiatives.
 */
export interface InitiativeParams extends JsonObject {
  /** The full name of the random value, for example `core:initiative`. */
  readonly roll: ContentName;
  /** How many sides the die has, for example 20. */
  readonly sides: number;
  /** The attribute added to the roll, if any, for example `core:initiative-bonus`. */
  readonly bonus?: ContentName;
  /** The attribute that decides between equal initiatives, the higher first, for example `core:dexterity`. */
  readonly tie?: ContentName;
}

/**
 * The order of turns by a roll of initiative. At the start of the battle every unit on the field rolls its
 * initiative, a die and the attribute `bonus`, and a unit that comes on the field later rolls at the start of the next
 * round; until then it goes after every unit that has rolled. A rolled initiative never changes. The higher
 * initiative goes first, then the higher attribute `tie` at the moment, then the order of the scenario. Units do not
 * wait. The variant keeps the rolls in its data, seen only by an actor with full visibility.
 */
export const INITIATIVE_ORDER: TurnOrderVariant<InitiativeParams> = Object.freeze({
  battleStart: (context: MechanicContext<InitiativeParams>) => rollDrafts(context.state),
  data: { schema: initiativeSchema(), version: 1 },
  kind: 'mechanic',
  mechanic: KERNEL_MECHANICS.turnOrder,
  name: RULES_STDLIB_NAMES.initiative,
  next: (context: MechanicContext<InitiativeParams>) => ({ kind: 'value', value: nextByInitiative(context) }),
  roundStart: (context: MechanicContext<InitiativeParams>) => rollDrafts(context.state),
  schema: {
    additionalProperties: false,
    properties: {
      bonus: FULL_NAME_SCHEMA,
      roll: FULL_NAME_SCHEMA,
      sides: DIE_SCHEMA,
      tie: FULL_NAME_SCHEMA,
    },
    required: ['roll', 'sides'],
    type: 'object',
  },
  turnOwner: 'unit',
} satisfies TurnOrderVariant<InitiativeParams>);

/**
 * The step of the order of turns by a roll of initiative: the roll of the units on the field that have not rolled.
 */
export const INITIATIVE_STEPS: readonly StepKind[] = Object.freeze([
  stepKind(RULES_STDLIB_NAMES.initiativeRoll, rollInitiative),
]);

function nextByInitiative(context: MechanicContext<InitiativeParams>): TurnHolder | undefined {
  const { expressions, params, state } = context;
  const { rolls } = initiativeData(state);
  const best = firstOf(freshUnits(state), (unit) => {
    const rolled = Object.hasOwn(rolls, unit.id) ? rolls[unit.id] : undefined;
    const tie = params.tie === undefined
      ? 0
      : attributeOf(expressions, unit, params.tie, RULES_STDLIB_NAMES.initiative);

    return [rolled === undefined ? 1 : 0, -(rolled ?? 0), -tie, state.units.indexOf(unit)];
  });

  return best === undefined ? undefined : holderOf(best);
}

function rollDrafts(state: BattleState): StepDraft[] {
  return unrolled(state).length === 0 ? [] : [{ params: {}, type: RULES_STDLIB_NAMES.initiativeRoll }];
}

function rollInitiative({ inputs, mechanic, state }: StepContext): StepResult {
  const chosen = mechanic(KERNEL_MECHANICS.turnOrder);
  const missing = unrolled(state);

  if (chosen?.variant.name !== RULES_STDLIB_NAMES.initiative) {
    throw new TypeError(`The step ${RULES_STDLIB_NAMES.initiativeRoll} needs the order of turns by initiative.`);
  }

  if (missing.length === 0) return DONE;

  const params = chosen.context.params as InitiativeParams;
  const next = missing[inputs.length];

  if (next !== undefined) return { kind: 'need', need: rollNeed(next, params.roll, params.sides) };

  const rolled = missing.map((unit, index): readonly [string, number] => {
    const input = inputs[index];
    const result = input?.kind === 'roll' ? input.result : 0;
    const bonus = params.bonus === undefined
      ? 0
      : attributeOf(chosen.context.expressions, unit, params.bonus, RULES_STDLIB_NAMES.initiativeRoll);

    if (!Number.isSafeInteger(result + bonus)) {
      throw new ContentError(`The initiative of ${JSON.stringify(unit.id)} with ${String(params.bonus)} is not safe.`);
    }

    return [unit.id, result + bonus];
  });
  const rolls = Object.fromEntries([...Object.entries(initiativeData(state).rolls), ...rolled]);
  const data: InitiativeData = { rolls };

  return {
    events: [{ payload: data, type: RULES_STDLIB_NAMES.initiativeRolled, visibleTo: VISIBLE_TO_NONE }],
    kind: 'done',
  };
}

function unrolled(state: BattleState): readonly Unit[] {
  const { rolls } = initiativeData(state);

  return state.units.filter((unit) => standsOnField(unit) && !Object.hasOwn(rolls, unit.id));
}
