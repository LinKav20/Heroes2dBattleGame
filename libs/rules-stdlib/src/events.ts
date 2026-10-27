import {
  NAME_SCHEMA,
  type BattleState,
  type DataView,
  type ExtensionEventKind,
  type JsonObject,
  type JsonValue,
  type SideId,
  type UnitId,
} from '@heroes2dgame/kernel';
import { eventKind } from './helpers.ts';
import { RULES_STDLIB_NAMES } from './names.ts';

/**
 * What the order of turns by speed keeps in the state of a battle under `rules-stdlib:speed`: the unit that gets one
 * more turn next for good morale, the units that got one in this round, and the side of the last turn of the last
 * round. `rules-stdlib:speed-changed` writes it, and only an actor with full visibility sees the event.
 */
export interface SpeedData extends JsonObject {
  /** The unit that gets one more turn next, if any. */
  readonly extra?: UnitId;
  /** The units that got one more turn in this round, in the order they got it. */
  readonly granted: readonly UnitId[];
  /** The side that had the last turn of the last round, if any. */
  readonly last?: SideId;
}

/**
 * What the order of turns by a roll of initiative keeps in the state of a battle under `rules-stdlib:initiative`:
 * the initiative of every unit that has rolled it. `rules-stdlib:initiative-rolled` writes it, and only an actor with
 * full visibility sees the event.
 */
export interface InitiativeData extends JsonObject {
  /** The initiative by the unit. */
  readonly rolls: Readonly<Record<UnitId, number>>;
}

/**
 * The payload of `rules-stdlib:attacked`: a unit struck another one in melee, with a shot or as a strike back, for
 * so much damage, with good or bad luck if it had any. The event is about the target; a reaction learns the attacker
 * and the kind of strike with `kernel:event-names` and `kernel:event-is`.
 */
export interface AttackedPayload extends JsonObject {
  /** The unit that struck. */
  readonly attacker: UnitId;
  /** The unit it struck. */
  readonly target: UnitId;
  /** How it struck. */
  readonly kind: 'melee' | 'retaliation' | 'shot';
  /** The damage of the strike, from 1. */
  readonly damage: number;
  /** Whether luck raised or lowered the damage, if it did. */
  readonly luck?: 'bad' | 'good';
}

/**
 * The payload of `rules-stdlib:morale-rolled`: morale succeeded for a unit, good or bad.
 */
export interface MoraleRolledPayload extends JsonObject {
  /** The unit. */
  readonly unit: UnitId;
  /** Whether the morale was good or bad. */
  readonly kind: 'bad' | 'good';
}

/**
 * The kinds of events of the package.
 */
export const RULES_STDLIB_EVENTS: readonly ExtensionEventKind[] = Object.freeze([
  eventKind<AttackedPayload>(RULES_STDLIB_NAMES.attacked, {
    additionalProperties: false,
    properties: {
      attacker: NAME_SCHEMA,
      damage: { minimum: 1, type: 'integer' },
      kind: { enum: ['melee', 'retaliation', 'shot'] },
      luck: { enum: ['bad', 'good'] },
      target: NAME_SCHEMA,
    },
    required: ['attacker', 'damage', 'kind', 'target'],
    type: 'object',
  }, (state) => state, ({ target }) => ({ kind: 'unit', unit: target })),
  eventKind<MoraleRolledPayload>(RULES_STDLIB_NAMES.moraleRolled, {
    additionalProperties: false,
    properties: { kind: { enum: ['bad', 'good'] }, unit: NAME_SCHEMA },
    required: ['kind', 'unit'],
    type: 'object',
  }, (state) => state, ({ unit }) => ({ kind: 'unit', unit })),
  eventKind<SpeedData>(RULES_STDLIB_NAMES.speedChanged, speedSchema(), (state, data) =>
    withData(state, RULES_STDLIB_NAMES.speed, data)),
  eventKind<InitiativeData>(RULES_STDLIB_NAMES.initiativeRolled, initiativeSchema(), (state, data) =>
    withData(state, RULES_STDLIB_NAMES.initiative, data)),
]);

/**
 * Returns the JSON Schema of {@link SpeedData}.
 */
export function speedSchema(): JsonObject {
  return {
    additionalProperties: false,
    properties: { extra: NAME_SCHEMA, granted: { items: NAME_SCHEMA, type: 'array' }, last: NAME_SCHEMA },
    required: ['granted'],
    type: 'object',
  };
}

/**
 * Returns the JSON Schema of {@link InitiativeData}.
 */
export function initiativeSchema(): JsonObject {
  return {
    additionalProperties: false,
    properties: { rolls: { additionalProperties: { type: 'integer' }, type: 'object' } },
    required: ['rolls'],
    type: 'object',
  };
}

/**
 * Returns what the order of turns by speed keeps in a state, or nothing kept yet.
 */
export function speedData(state: BattleState): SpeedData {
  return (dataOf(state, RULES_STDLIB_NAMES.speed) as SpeedData | undefined) ?? { granted: [] };
}

/**
 * Returns what the order of turns by a roll of initiative keeps in a state, or no rolls yet.
 */
export function initiativeData(state: BattleState): InitiativeData {
  return (dataOf(state, RULES_STDLIB_NAMES.initiative) as InitiativeData | undefined) ?? { rolls: {} };
}

/**
 * Returns the data of the order of turns by speed as an actor sees it who sees only what some sides see: without the
 * units the actor does not see.
 */
export function projectedSpeed(data: JsonValue, view: DataView): JsonValue {
  const { extra, granted, last } = data as SpeedData;

  return {
    granted: granted.filter((unit) => view.seesUnit(unit)),
    ...(extra !== undefined && view.seesUnit(extra) ? { extra } : {}),
    ...(last === undefined ? {} : { last }),
  };
}

/**
 * Returns the data of the order of turns by initiative as an actor sees it who sees only what some sides see: the
 * rolls of the units the actor sees.
 */
export function projectedInitiative(data: JsonValue, view: DataView): JsonValue {
  const { rolls } = data as InitiativeData;

  return { rolls: Object.fromEntries(Object.entries(rolls).filter(([unit]) => view.seesUnit(unit))) };
}

function dataOf(state: BattleState, name: string): JsonValue | undefined {
  return Object.hasOwn(state.extensions, name) ? state.extensions[name] : undefined;
}

function withData(state: BattleState, name: string, data: JsonObject): BattleState {
  return { ...state, extensions: { ...state.extensions, [name]: data } };
}
