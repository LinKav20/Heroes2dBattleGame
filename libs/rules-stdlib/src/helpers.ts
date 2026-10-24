import {
  hasTag,
  settledValue,
  standsOnField,
  turnRecordsOf,
  type BattleState,
  type ContentName,
  type EvaluatedValue,
  type Evaluation,
  type Expressions,
  type ExtensionEventKind,
  type FieldGeometry,
  type JsonObject,
  type RollNeed,
  type StepContext,
  type StepKind,
  type StepRejects,
  type StepResult,
  type Tag,
  type TurnHolder,
  type Unit,
  type UnitId,
  type UnitTarget,
} from '@heroes2dgame/kernel';

/**
 * Returns the value of an attribute of a unit, which cannot fail where the package reads it.
 *
 * @throws {ContentError} If a formula of a modifier rejects.
 * @throws {TypeError} If the evaluation asks for a roll or rejects with another reason.
 */
export function attributeOf(
  expressions: Expressions,
  unit: Unit,
  attribute: ContentName,
  source: string,
): number {
  return settledValue(expressions.attribute({ kind: 'unit', unit: unit.id }, attribute), source);
}

/**
 * Returns an evaluation that cannot ask for a roll where the package reads it: its value or its rejection.
 *
 * @throws {TypeError} If the evaluation asks for a roll.
 */
export function withoutRoll<Value>(evaluation: Evaluation<Value>, source: string): EvaluatedValue<Value> | StepRejects {
  if (evaluation.kind === 'need') throw new TypeError(`${JSON.stringify(source)} asks for a roll where it cannot.`);

  return evaluation;
}

/**
 * Tells whether a unit has one of the tags or a tag below one of them, or rejects if a formula of a condition of
 * activity rejects.
 *
 * @throws {TypeError} If a condition of activity asks for a roll.
 */
export function taggedWith(
  expressions: Expressions,
  unit: Unit,
  tags: readonly Tag[],
  source: string,
): EvaluatedValue<boolean> | StepRejects {
  if (tags.length === 0) return { kind: 'value', value: false };

  const own = withoutRoll(expressions.tags(unit.id), source);

  return own.kind === 'value' ? { kind: 'value', value: tags.some((tag) => hasTag(own.value, tag)) } : own;
}

/**
 * Tells whether a unit has one of the tags or a tag below one of them.
 *
 * @throws {ContentError} If a formula of a condition of activity rejects.
 */
export function hasAnyTag(expressions: Expressions, unit: Unit, tags: readonly Tag[], source: string): boolean {
  if (tags.length === 0) return false;

  const own = settledValue(expressions.tags(unit.id), source);

  return tags.some((tag) => hasTag(own, tag));
}

/**
 * Tells whether two units stand next to each other: a cell of one is at a distance of 1 from a cell of the other.
 * Units that do not stand on the field are never next to each other.
 */
export function nextTo(field: FieldGeometry, unit: UnitId, other: UnitId): boolean {
  return field.distanceBetween(field.cellsOf(unit), field.cellsOf(other)) === 1;
}

/**
 * Returns a unit as the holder of a turn.
 */
export function holderOf(unit: Unit): TurnHolder {
  return { kind: 'unit', unit: unit.id };
}

/**
 * Returns the units on the field that have not had a turn in the round, in the order of the state.
 */
export function freshUnits(state: BattleState): readonly Unit[] {
  return state.units.filter((unit) => standsOnField(unit) && turnRecordsOf(state, holderOf(unit)).length === 0);
}

/**
 * Returns a roll of a unit, seen by the sides that see the unit.
 */
export function rollNeed(unit: Unit, name: ContentName, sides: number, count = 1): RollNeed {
  return { count, kind: 'roll', name, side: unit.side, sides, unit: unit.id, visibleTo: unit.visibleTo };
}

/**
 * Returns the unit that comes first by its rank: the lowest rank, compared number by number.
 */
export function firstOf(units: readonly Unit[], rank: (unit: Unit) => readonly number[]): Unit | undefined {
  return units.map((unit) => ({ rank: rank(unit), unit }))
    .sort((left, right) => compare(left.rank, right.rank))[0]?.unit;
}

/**
 * Returns a frozen kind of step of the package in version 1 without migrations.
 */
export function stepKind<Params extends object>(
  name: string,
  run: (context: StepContext<Params>) => StepResult,
): StepKind {
  const kind: StepKind<Params> = { kind: 'step', migrations: [], name, run, version: 1 };

  return Object.freeze(kind);
}

/**
 * Returns a frozen kind of event of the package in version 1 without migrations.
 */
export function eventKind<Payload extends JsonObject>(
  name: string,
  schema: JsonObject,
  apply: (state: BattleState, payload: Payload) => BattleState,
  target?: (payload: Payload) => UnitTarget,
): ExtensionEventKind {
  const kind: ExtensionEventKind<Payload> = {
    apply,
    kind: 'event',
    migrations: [],
    name,
    schema,
    version: 1,
    ...(target === undefined ? {} : { target }),
  };

  return Object.freeze(kind);
}

function compare(left: readonly number[], right: readonly number[]): number {
  for (const [index, value] of left.entries()) {
    const other = right[index] ?? 0;

    if (value !== other) return value - other;
  }

  return 0;
}
