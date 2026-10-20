import { expect } from 'vitest';
import {
  standsOnField,
  turnHolderOf,
  turnRecordsOf,
  type BattleEvent,
  type BattleOptions,
  type BattleState,
  type Command,
  type ContentRegistry,
  type ExecuteAccepted,
  type ExecuteResult,
  type GameCommand,
  type Kernel,
  type Target,
  type Unit,
} from '../../index.ts';
import { created, FRESH_KERNEL, WORLD, WORLD_KERNEL } from './world.ts';

export interface Drive {
  readonly kernel: Kernel;
  readonly content: ContentRegistry;
}

export interface Begun {
  readonly drive: Drive;
  readonly state: BattleState;
}

export const DRIVE: Drive = { content: WORLD, kernel: WORLD_KERNEL };

export function act(state: BattleState, command: Command, drive: Drive = DRIVE): ExecuteAccepted {
  const result = drive.kernel.execute(frozen(state), frozen(command), frozen(drive.content));

  if (!result.ok) throw new Error(`${JSON.stringify(command)} rejected: ${JSON.stringify(result.rejection)}`);

  checkInvariants(state, command, result, drive);

  return result;
}

export function acted(state: BattleState, commands: readonly Command[], drive: Drive = DRIVE): BattleState {
  return commands.reduce((current, command) => act(current, command, drive).state, state);
}

export function refusal(state: BattleState, command: Command, drive: Drive = DRIVE): unknown {
  const result = drive.kernel.execute(frozen(state), frozen(command), frozen(drive.content));

  if (result.ok) throw new Error(`${JSON.stringify(command)} was accepted`);

  expect(result.rejection.reason).toMatch(/^(?:kernel|acme):/u);

  return [result.rejection.reason, result.rejection.params];
}

export function checkInvariants(before: BattleState, command: Command, result: ExecuteAccepted, drive: Drive): void {
  const { kernel, content } = drive;
  const { events, state } = result;

  expect(events.reduce((current, event) => kernel.applyEvent(current, event), before)).toStrictEqual(state);
  expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);

  const copy = JSON.parse(JSON.stringify(before)) as BattleState;

  expect(JSON.stringify(again(FRESH_KERNEL.execute(copy, command, content)))).toBe(JSON.stringify(again(result)));

  events.forEach((event, index) => {
    expect(event.id).toBe(index);

    if (event.cause !== undefined) expect(event.cause).toBeLessThan(index);
  });

  expect(state.round).toBeGreaterThanOrEqual(before.round);
  expect(state.nextId).toBeGreaterThanOrEqual(before.nextId);
  expect(state.nextRequestId).toBeGreaterThanOrEqual(before.nextRequestId);
  checkUnits(state, drive);
  checkPhase(state);
}

export function frozen<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;

  Object.freeze(value);
  Object.values(value).forEach((inner: unknown) => frozen(inner));

  return value;
}

export function types(events: readonly BattleEvent[]): readonly string[] {
  return events.map(({ type }) => type);
}

export function eventsOf(events: readonly BattleEvent[], type: string): readonly unknown[] {
  return events.filter((event) => event.type === type).map(({ payload }) => payload);
}

export function unitOf(state: BattleState, id: string): Unit {
  const found = state.units.find((one) => one.id === id);

  if (found === undefined) throw new Error(`No unit ${id}`);

  return found;
}

export function holderOfTurn(state: BattleState): string | undefined {
  return state.phase.kind === 'turn' ? state.phase.unit ?? state.phase.side : undefined;
}

export function effectsOf(state: BattleState, id: string): readonly string[] {
  return unitOf(state, id).effects.map(({ effect }) => effect);
}

export function outcomeOf(state: BattleState): unknown {
  return state.phase.kind === 'ended' ? state.phase.outcome : undefined;
}

export function place(unit: string, cell: string, facing?: string): GameCommand {
  return { cell, kind: 'game', type: 'place-unit', unit, ...(facing === undefined ? {} : { facing }) };
}

export function finish(side: string): GameCommand {
  return { kind: 'game', side, type: 'finish-deployment' };
}

export function move(unit: string, to: string, facing?: string): GameCommand {
  return { kind: 'game', to, type: 'move', unit, ...(facing === undefined ? {} : { facing }) };
}

export function endTurn(unit: string): GameCommand {
  return { kind: 'game', type: 'end-turn', unit };
}

export function wait(unit: string): GameCommand {
  return { kind: 'game', type: 'wait', unit };
}

export function defend(unit: string): GameCommand {
  return { kind: 'game', type: 'defend', unit };
}

export function use(unit: string, ability: string, ...targets: readonly Target[]): GameCommand {
  return { ability, kind: 'game', targets, type: 'use-ability', unit };
}

export function useOfSide(side: string, ability: string, ...targets: readonly Target[]): GameCommand {
  return { ability, kind: 'game', side, targets, type: 'use-ability' };
}

export function useItem(unit: string, item: number, ...targets: readonly Target[]): GameCommand {
  return { item, kind: 'game', targets, type: 'use-item', unit };
}

export function at(unit: string): Target {
  return { kind: 'unit', unit };
}

export function cell(id: string): Target {
  return { cell: id, kind: 'cell' };
}

export function answerRoll(request: number, ...dice: readonly number[]): Command {
  return { kind: 'answer', request, value: { dice, kind: 'roll' } };
}

export function deployed(state: BattleState, drive: Drive = DRIVE): BattleState {
  return acted(state, [
    place('knight-1', '1,2'),
    place('archers-1', '0,1'),
    place('mage-1', '0,3'),
    finish('attacker'),
    place('ghosts-1', '7,0'),
    place('griffins-1', '6,4'),
    finish('defender'),
  ], drive);
}

export function begin(content: ContentRegistry, options: Partial<BattleOptions> = {}): Begun {
  const drive = { ...DRIVE, content };
  const state = act(created(content, options), { kind: 'game', type: 'start-battle' }, drive).state;

  return { drive, state };
}

function again(result: ExecuteResult): unknown {
  return result.ok ? { events: result.events, state: result.state } : result.rejection;
}

function checkUnits(state: BattleState, { content, kernel }: Drive): void {
  const field = kernel.field(state, content);
  const taken = new Map<string, string>();
  const blocked = new Set(state.field.obstacles.flatMap(({ cells }) => cells));

  for (const one of state.units) {
    expect(Number.isSafeInteger(one.count) && one.count >= 0).toBe(true);
    expect(Number.isSafeInteger(one.health) && one.health >= 0).toBe(true);
    expect(Object.values(one.resources).every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true);
    expect(Object.values(one.spentActions).every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true);

    if (one.count > 0) expect(one.health).toBeGreaterThan(0);

    if (!standsOnField(one)) continue;

    for (const cellId of field.cellsOf(one.id)) {
      expect(taken.get(cellId), `${one.id} and ${String(taken.get(cellId))} share ${cellId}`).toBeUndefined();
      expect(blocked.has(cellId)).toBe(false);
      taken.set(cellId, one.id);
    }
  }
}

function checkPhase(state: BattleState): void {
  const { phase } = state;

  if (phase.kind === 'ended') {
    expect(state.steps).toStrictEqual([]);
    expect(state.inputRequest).toBeUndefined();

    return;
  }

  if (state.inputRequest !== undefined) return;

  expect(state.steps).toStrictEqual([]);
  expect(['deployment', 'turn']).toContain(phase.kind);

  if (phase.kind !== 'turn') return;

  for (const side of state.sides) {
    expect(state.units.some((one) => one.side === side.id && one.count > 0), `${side.id} is beaten`).toBe(true);
  }

  const holder = turnHolderOf(phase);

  if (holder !== undefined && state.ruleset.mechanics['kernel:turn-order']?.variant !== 'acme:sides-twice') {
    expect(turnRecordsOf(state, holder).every(({ waited }) => waited)).toBe(true);
  }

  if (phase.unit === undefined) return;

  const unit = unitOf(state, phase.unit);

  expect(standsOnField(unit)).toBe(true);
  expect(unit.side).toBe(phase.side);
}
