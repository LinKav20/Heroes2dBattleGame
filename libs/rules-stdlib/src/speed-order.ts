import {
  allSpent,
  DONE,
  findUnit,
  KERNEL_MECHANICS,
  NAME_SCHEMA,
  settledValue,
  standsOnField,
  turnCheckDraft,
  turnRecordsOf,
  VISIBLE_TO_NONE,
  type BattleState,
  type CommandPlan,
  type ContentName,
  type EventDraft,
  type JsonObject,
  type MechanicContext,
  type SideId,
  type StepContext,
  type StepDraft,
  type StepKind,
  type StepDone,
  type StepResult,
  type Tag,
  type TurnHolder,
  type TurnOrderVariant,
  type Unit,
  type UnitId,
} from '@heroes2dgame/kernel';
import { chanceHit, chanceNeed, chosenChance } from './chances.ts';
import { speedData, speedSchema, type SpeedData } from './events.ts';
import { attributeOf, firstOf, freshUnits, hasAnyTag, holderOf, stepKind } from './helpers.ts';
import { RULES_STDLIB_MECHANICS, RULES_STDLIB_NAMES, RULES_STDLIB_REASONS } from './names.ts';
import { FULL_NAME_SCHEMA } from './schemas.ts';

/**
 * The parameters of the order of turns by speed: the attribute of speed, and the tag of units that go before all the
 * others, such as siege machines.
 */
export interface SpeedParams extends JsonObject {
  /** The attribute of speed, for example `core:speed`. */
  readonly speed: ContentName;
  /** Units with this tag, or a tag below it, go first, for example `Creature.Siege`. */
  readonly first?: Tag;
}

interface MoraleCheckParams {
  readonly unit: UnitId;
  readonly moment: 'end' | 'start';
}

/**
 * The order of turns by speed with waiting. Units with the tag `first` go first; then the units that have not had a
 * turn in the round go from the fastest to the slowest; then the units that waited go from the slowest to the
 * fastest. Of units of equal speed, a unit of the side that did not have the last turn goes first: in the first round
 * the first side of the scenario, then in the order of the scenario. A unit waits once a round, and only before it
 * spends any action of its turn.
 *
 * If the ruleset chooses morale, the variant rolls bad morale at the start of a fresh turn of a unit that can act, and
 * a success ends the turn, which counts as a turn the unit had. It rolls good morale at the end of a turn that the
 * unit neither put off nor skipped, and a success gives the unit one more turn right away, at most once a round. A
 * success of morale gives `rules-stdlib:morale-rolled`, seen by the sides that see the unit. The variant keeps the
 * unit that gets the turn next, the units that got one this round and the side of the last turn of the last round in
 * its data, seen only by an actor with full visibility, and starts the units anew at the end of the round.
 */
export const SPEED_ORDER: TurnOrderVariant<SpeedParams> = Object.freeze({
  data: { schema: speedSchema(), version: 1 },
  kind: 'mechanic',
  mechanic: KERNEL_MECHANICS.turnOrder,
  name: RULES_STDLIB_NAMES.speed,
  next: (context: MechanicContext<SpeedParams>) => ({ kind: 'value', value: nextBySpeed(context) }),
  roundEnd: () => [{ params: {}, type: RULES_STDLIB_NAMES.speedRound }],
  schema: {
    additionalProperties: false,
    properties: { first: NAME_SCHEMA, speed: FULL_NAME_SCHEMA },
    required: ['speed'],
    type: 'object',
  },
  turnEnd: (context: MechanicContext<SpeedParams>, holder: TurnHolder) => moraleDrafts(context, holder, 'end'),
  turnOwner: 'unit',
  turnStart: (context: MechanicContext<SpeedParams>, holder: TurnHolder) => moraleDrafts(context, holder, 'start'),
  wait: waitPlan,
} satisfies TurnOrderVariant<SpeedParams>);

/**
 * The steps of the order of turns by speed: the check of morale at the start and at the end of a turn, and the end
 * of a round.
 */
export const SPEED_STEPS: readonly StepKind[] = Object.freeze([
  stepKind<MoraleCheckParams>(RULES_STDLIB_NAMES.moraleCheck, checkMorale),
  stepKind(RULES_STDLIB_NAMES.speedRound, endSpeedRound),
]);

function nextBySpeed(context: MechanicContext<SpeedParams>): TurnHolder | undefined {
  const { expressions, params, state } = context;
  const data = speedData(state);
  const extra = data.extra === undefined ? undefined : findUnit(state, data.extra);

  if (extra !== undefined && standsOnField(extra)) return holderOf(extra);

  const last = lastSide(state) ?? data.last;
  const source = RULES_STDLIB_NAMES.speed;
  const best = firstOf(freshUnits(state), (unit) => [
    params.first !== undefined && hasAnyTag(expressions, unit, [params.first], source) ? 0 : 1,
    -attributeOf(expressions, unit, params.speed, source),
    ...tieOrder(state, unit, last),
  ]) ?? firstOf(state.units.filter((unit) => standsOnField(unit) && isWaiting(state, unit)), (unit) => [
    attributeOf(expressions, unit, params.speed, source),
    ...tieOrder(state, unit, last),
  ]);

  return best === undefined ? undefined : holderOf(best);
}

function waitPlan({ state }: MechanicContext<SpeedParams>, unit: UnitId): CommandPlan {
  const spent = Object.values(findUnit(state, unit)?.spentActions ?? {}).some((value) => value > 0);

  if (spent || turnRecordsOf(state, { kind: 'unit', unit }).length > 0) {
    return { kind: 'reject', reason: RULES_STDLIB_REASONS.cannotWait };
  }

  return { kind: 'steps', steps: [] };
}

function moraleDrafts(context: MechanicContext, holder: TurnHolder, moment: MoraleCheckParams['moment']): StepDraft[] {
  const { state } = context;
  const morale = Object.hasOwn(state.ruleset.mechanics, RULES_STDLIB_MECHANICS.morale);
  const clears = moment === 'start' && speedData(state).extra !== undefined;

  if (holder.kind !== 'unit' || !(morale || clears)) return [];

  return [{ params: { moment, unit: holder.unit }, type: RULES_STDLIB_NAMES.moraleCheck }];
}

function checkMorale(context: StepContext<MoraleCheckParams>): StepResult {
  const { inputs, mechanic, params, state } = context;
  const data = speedData(state);
  const clears = params.moment === 'start' && data.extra !== undefined;
  const cleared = clears ? [speedChanged(kept(data.granted, data.last))] : [];
  const unit = findUnit(state, params.unit);
  const morale = chosenChance(mechanic(RULES_STDLIB_MECHANICS.morale));
  const wanted = params.moment === 'start' ? 'bad' : 'good';

  function done(...events: readonly EventDraft[]): StepDone {
    return { events: [...cleared, ...events], kind: 'done' };
  }

  if (unit === undefined || morale === undefined || !standsOnField(unit) || !moraleDue(context, unit, data)) {
    return done();
  }

  const result = morale.variant.chance(morale.context, unit);
  const [roll] = inputs;

  if (result.kind !== 'value') return result;

  const chance = result.value;

  if (chance?.kind !== wanted) return done();

  if (roll === undefined) return { kind: 'need', need: chanceNeed(chance, unit) };

  if (!chanceHit(chance, roll)) return done();

  const rolled: EventDraft = {
    payload: { kind: wanted, unit: unit.id },
    type: RULES_STDLIB_NAMES.moraleRolled,
    visibleTo: unit.visibleTo,
  };

  if (wanted === 'bad') return { ...done(rolled), steps: [turnCheckDraft({ end: true, holder: holderOf(unit) })] };

  return done(rolled, speedChanged({ ...data, extra: unit.id, granted: [...data.granted, unit.id] }));
}

function moraleDue(context: StepContext<MoraleCheckParams>, unit: Unit, data: SpeedData): boolean {
  const { expressions, params, state } = context;
  const records = turnRecordsOf(state, holderOf(unit));

  if (params.moment === 'start') {
    return records.length === 0
      && !settledValue(allSpent(state, expressions, unit), RULES_STDLIB_NAMES.moraleCheck);
  }

  const record = records.at(-1);

  return record !== undefined && !record.waited && !record.skipped && !data.granted.includes(unit.id);
}

function endSpeedRound({ state }: StepContext): StepResult {
  const data = speedData(state);
  const last = lastSide(state);

  if (data.granted.length === 0 && data.extra === undefined && data.last === last) return DONE;

  return { events: [speedChanged(kept([], last))], kind: 'done' };
}

function isWaiting(state: BattleState, unit: Unit): boolean {
  const records = turnRecordsOf(state, holderOf(unit));

  return records.length === 1 && records[0]?.waited === true;
}

function tieOrder(state: BattleState, unit: Unit, last: SideId | undefined): readonly number[] {
  return [unit.side === last ? 1 : 0, state.sides.findIndex(({ id }) => id === unit.side), state.units.indexOf(unit)];
}

function lastSide(state: BattleState): SideId | undefined {
  const holder = state.turns.at(-1)?.holder;

  return holder?.kind === 'unit' ? findUnit(state, holder.unit)?.side : holder?.side;
}

function kept(granted: readonly UnitId[], last: SideId | undefined): SpeedData {
  return { granted, ...(last === undefined ? {} : { last }) };
}

function speedChanged(data: SpeedData): EventDraft {
  return { payload: data, type: RULES_STDLIB_NAMES.speedChanged, visibleTo: VISIBLE_TO_NONE };
}
