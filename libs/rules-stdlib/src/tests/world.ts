import {
  createKernel,
  hashJson,
  standsOnField,
  type BattleEvent,
  type BattleOptions,
  type BattleState,
  type Command,
  type ContentRegistry,
  type Creature,
  type Effect,
  type ExecuteAccepted,
  type ExpressionNode,
  type Kernel,
  type Ruleset,
  type Scenario,
  type ScenarioUnit,
  type Unit,
} from '@heroes2dgame/kernel';
import { expect } from 'vitest';
import { RULES_STDLIB_EXTENSIONS, type StackParams } from '../index.ts';

export const KERNEL: Kernel = createKernel({ extensions: RULES_STDLIB_EXTENSIONS });

export const STACK_PARAMS: StackParams = {
  action: 'core:action',
  attack: 'core:attack',
  bonus: { attack: 50, attackMax: 3000, defense: 25, defenseMax: 700 },
  damage: { max: 'core:damage-max', min: 'core:damage-min', roll: 'core:damage-roll' },
  defense: 'core:defense',
  luck: { bad: 50, good: 200 },
  retaliation: { blockedBy: ['Ability.NoRetaliation'], resource: 'core:retaliations' },
  shots: {
    far: 5,
    farPercent: 50,
    meleePercent: 50,
    nearby: true,
    noPenalty: ['Ability.Sharp'],
    resource: 'core:shots',
    sight: true,
  },
};

export const RULESET: Ruleset = {
  healthAttribute: 'core:health',
  mechanics: {
    'kernel:attack': { params: STACK_PARAMS, variant: 'rules-stdlib:stacks' },
    'kernel:defense': { params: { effect: 'demo:defending' }, variant: 'rules-stdlib:brace' },
    'kernel:turn-order': { params: { first: 'Creature.Siege', speed: 'core:speed' }, variant: 'rules-stdlib:speed' },
    'rules-stdlib:luck': {
      params: { attribute: 'core:luck', bad: 12, good: 24, max: 3, roll: 'core:luck-roll' },
      variant: 'rules-stdlib:chance-luck',
    },
    'rules-stdlib:morale': {
      params: {
        attribute: 'core:morale',
        bad: 12,
        blockedBy: ['Creature.Undead'],
        good: 24,
        goodBlockedBy: ['Buff.Defending'],
        max: 3,
        roll: 'core:morale-roll',
      },
      variant: 'rules-stdlib:chance-morale',
    },
  },
  name: 'demo:stacks-speed',
  randomSources: {},
  rounding: 'down',
  turn: { actions: ['core:action'], endTurn: true, movement: { actions: {}, points: 'core:speed' } },
  turnOwner: 'unit',
};

export const SCENARIO: Scenario = {
  extensions: {},
  field: {
    hazards: [],
    obstacles: [{ cells: ['4,0'], id: 'rock-1', obstacle: 'demo:rock' }],
    params: { height: 5, width: 9 },
    topology: 'rules-stdlib:hex',
  },
  name: 'demo:field',
  outcomes: [
    { condition: noneLeft('defender'), id: 'rout', outcome: 'victory', side: 'attacker' },
    { condition: noneLeft('attacker'), id: 'wiped-out', outcome: 'victory', side: 'defender' },
    {
      condition: node('kernel:compare', { left: node('kernel:round'), operator: '>', right: 20 }),
      id: 'stalemate',
      outcome: 'draw',
    },
  ],
  ruleset: 'demo:stacks-speed',
  sides: [
    {
      abilities: [],
      deploymentZone: [],
      effects: [],
      id: 'attacker',
      units: [unit('pikemen-1', 'demo:pikeman', 10, '0,1'), unit('archers-1', 'demo:archer', 5, '0,3')],
    },
    {
      abilities: [],
      deploymentZone: [],
      effects: [],
      id: 'defender',
      units: [
        unit('skeletons-1', 'demo:skeleton', 12, '8,1', { facing: 'west' }),
        unit('griffins-1', 'demo:griffin', 2, '7,3', { facing: 'west' }),
      ],
    },
  ],
  triggers: [],
  variables: {},
};

export const CONTENT: ContentRegistry = {
  abilities: {},
  attributes: {
    ...Object.fromEntries([
      'core:action',
      'core:attack',
      'core:damage-max',
      'core:damage-min',
      'core:defense',
      'core:retaliations-max',
      'core:shots-max',
      'core:speed',
    ].map((name) => [name, { min: 0, name }])),
    'core:health': { min: 1, name: 'core:health' },
    'core:luck': { max: 3, min: -3, name: 'core:luck' },
    'core:morale': { max: 3, min: -3, name: 'core:morale' },
  },
  battlefields: {},
  contentHash: 'd'.repeat(64),
  creatures: Object.fromEntries([
    creature('demo:pikeman', { 'core:attack': 4, 'core:damage-max': 3, 'core:damage-min': 1, 'core:defense': 5 }, {
      attributes: { 'core:health': 10, 'core:retaliations-max': 1, 'core:speed': 4 },
    }),
    creature('demo:archer', { 'core:attack': 6, 'core:damage-max': 3, 'core:damage-min': 2, 'core:defense': 3 }, {
      attributes: { 'core:health': 10, 'core:retaliations-max': 1, 'core:shots-max': 12, 'core:speed': 4 },
      resources: { 'core:shots': { initial: 'full', limit: 'core:shots-max' } },
    }),
    creature('demo:skeleton', { 'core:attack': 5, 'core:damage-max': 3, 'core:damage-min': 1, 'core:defense': 4 }, {
      attributes: { 'core:health': 6, 'core:retaliations-max': 1, 'core:speed': 4 },
      tags: ['Creature.Undead'],
    }),
    creature('demo:griffin', { 'core:attack': 8, 'core:damage-max': 6, 'core:damage-min': 3, 'core:defense': 8 }, {
      attributes: { 'core:health': 25, 'core:retaliations-max': 2, 'core:speed': 6 },
      movement: 'fly',
      size: 2,
    }),
    creature('demo:ballista', { 'core:attack': 10, 'core:damage-max': 3, 'core:damage-min': 2, 'core:defense': 10 }, {
      attributes: { 'core:health': 250, 'core:shots-max': 24, 'core:speed': 0 },
      resources: { 'core:shots': { initial: 'full', limit: 'core:shots-max' } },
      tags: ['Creature.Siege'],
    }),
  ].map((one) => [one.name, one])),
  effects: Object.fromEntries([
    effect('demo:defending', {
      duration: { count: 1, kind: 'turns', tick: 'holder-turn-start' },
      grantsTags: ['Buff.Defending'],
      modifiers: [{ attribute: 'core:defense', operation: 'add', value: 2 }],
    }),
    effect('demo:bless', { modifiers: [{ attribute: 'core:morale', operation: 'add', value: 3 }] }),
    effect('demo:despair', { modifiers: [{ attribute: 'core:morale', operation: 'add', value: -3 }] }),
    effect('demo:fortune', { modifiers: [{ attribute: 'core:luck', operation: 'add', value: 3 }] }),
    effect('demo:misfortune', { modifiers: [{ attribute: 'core:luck', operation: 'add', value: -3 }] }),
    effect('demo:unanswered', { grantsTags: ['Ability.NoRetaliation'] }),
    effect('demo:stunned', { modifiers: [{ attribute: 'core:action', operation: 'add', value: -1 }] }),
    effect('demo:sharp', { grantsTags: ['Ability.Sharp'] }),
    effect('demo:fury', { modifiers: [{ attribute: 'core:attack', operation: 'add', value: 100 }] }),
    effect('demo:fortress', { modifiers: [{ attribute: 'core:defense', operation: 'add', value: 100 }] }),
    effect('demo:blunt', { modifiers: [{ attribute: 'core:damage-max', operation: 'override', value: 1 }] }),
    effect('demo:titan', {
      modifiers: [
        { attribute: 'core:damage-min', operation: 'override', value: 2 ** 52 },
        { attribute: 'core:damage-max', operation: 'override', value: 2 ** 52 },
      ],
    }),
    effect('demo:watcher', {
      triggers: [{
        condition: node('kernel:and', {
          conditions: [
            node('kernel:event-names', { of: 'self', path: ['attacker'] }),
            node('kernel:event-is', { path: ['kind'], value: 'melee' }),
          ],
        }),
        on: 'rules-stdlib:attacked',
        ops: [node('kernel:set-variable', { value: true, variable: 'struck' })],
        priority: 0,
      }],
    }),
    effect('demo:doomed', {
      triggers: [{
        condition: node('kernel:same', { left: 'self', right: 'target' }),
        on: 'rules-stdlib:morale-rolled',
        ops: [node('kernel:damage', { amount: 1000, to: 'self' })],
        priority: 0,
      }],
    }),
  ].map((one) => [one.name, one])),
  items: {},
  obstacles: { 'demo:rock': { blocksMovement: true, blocksSight: true, name: 'demo:rock', tags: [] } },
  packs: [{ name: 'demo', version: '1.0.0' }],
  rulesets: { 'demo:stacks-speed': RULESET },
  scenarios: { 'demo:field': SCENARIO },
  tags: [
    'Ability.NoRetaliation',
    'Ability.Sharp',
    'Buff.Defending',
    'Creature.Siege',
    'Creature.Undead',
  ],
};

export const EXTERNAL = {
  randomSources: {
    'core:damage-roll': 'external',
    'core:initiative': 'external',
    'core:luck-roll': 'external',
    'core:morale-roll': 'external',
  },
} as const;

export function contentWith(change: Partial<Scenario> = {}, ruleset: Partial<Ruleset> = {}): ContentRegistry {
  return {
    ...CONTENT,
    rulesets: { 'demo:stacks-speed': { ...RULESET, ...ruleset } },
    scenarios: { 'demo:field': { ...SCENARIO, ...change } },
  };
}

export function withUnits(change: Readonly<Record<string, Partial<ScenarioUnit>>>): Partial<Scenario> {
  return {
    sides: SCENARIO.sides.map((side) => ({
      ...side,
      units: side.units.map((one) => ({ ...one, ...change[one.id] })),
    })),
  };
}

export function started(content: ContentRegistry = CONTENT, options: Partial<BattleOptions> = {}): BattleState {
  const state = KERNEL.createState({ scenario: 'demo:field', seed: '5'.repeat(64), ...options }, content);

  return played(state, content, { kind: 'game', type: 'start-battle' });
}

export function play(state: BattleState, content: ContentRegistry, command: Command): ExecuteAccepted {
  const result = KERNEL.execute(frozen(state), frozen(command), frozen(content));

  if (!result.ok) throw new Error(`${JSON.stringify(command)} rejected: ${JSON.stringify(result.rejection)}`);

  checkInvariants(state, command, result, content);

  return result;
}

export function checkInvariants(
  before: BattleState,
  command: Command,
  result: ExecuteAccepted,
  content: ContentRegistry,
): void {
  const { events, state } = result;
  const copy = JSON.parse(JSON.stringify(before)) as BattleState;
  const again = FRESH_KERNEL.execute(copy, command, content);

  expect(events.reduce((current, event) => KERNEL.applyEvent(current, event), before)).toStrictEqual(state);
  expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
  expect(again.ok && hashJson([again.state, again.events])).toBe(hashJson([state, events]));

  events.forEach((event, index) => {
    expect(event.id).toBe(index);

    if (event.cause !== undefined) expect(event.cause).toBeLessThan(index);
  });

  expect(state.round).toBeGreaterThanOrEqual(before.round);
  expect(state.nextId).toBeGreaterThanOrEqual(before.nextId);
  expect(state.nextRequestId).toBeGreaterThanOrEqual(before.nextRequestId);
  checkUnits(state, content);
}

export function frozen<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;

  Object.freeze(value);
  Object.values(value).forEach((inner: unknown) => frozen(inner));

  return value;
}

export function played(state: BattleState, content: ContentRegistry, ...commands: readonly Command[]): BattleState {
  return commands.reduce((current, command) => play(current, content, command).state, state);
}

export function refusal(state: BattleState, content: ContentRegistry, command: Command): unknown {
  const result = KERNEL.execute(frozen(state), frozen(command), frozen(content));

  if (result.ok) return undefined;

  expect(result.rejection.reason).toMatch(/^(?:kernel|rules-stdlib):/u);

  return [result.rejection.reason, result.rejection.params];
}

export function holderOf(state: BattleState): string | undefined {
  return state.phase.kind === 'turn' ? state.phase.unit ?? state.phase.side : undefined;
}

export function endTurn(unit: string): Command {
  return { kind: 'game', type: 'end-turn', unit };
}

export function roll(request: number, ...dice: readonly number[]): Command {
  return { kind: 'answer', request, value: { dice, kind: 'roll' } };
}

export function attack(unit: string, target: string, from?: string): Command {
  return { kind: 'game', target, type: 'attack', unit, ...(from === undefined ? {} : { from }) };
}

export function wait(unit: string): Command {
  return { kind: 'game', type: 'wait', unit };
}

export function order(first: BattleState, content: ContentRegistry, turns: number): ReadonlyArray<string | undefined> {
  const holders: Array<string | undefined> = [];
  let state = first;

  for (let turn = 0; turn < turns; turn += 1) {
    const holder = holderOf(state);

    holders.push(holder);

    if (holder === undefined) break;

    state = play(state, content, endTurn(holder)).state;
  }

  return holders;
}

export function answered(
  state: BattleState,
  content: ContentRegistry,
  command: Command,
  ...answers: ReadonlyArray<readonly number[]>
): { readonly events: readonly BattleEvent[]; readonly state: BattleState } {
  let result = play(state, content, command);
  const events = [...result.events];

  for (const dice of answers) {
    result = play(result.state, content, roll(result.state.inputRequest?.id ?? 0, ...dice));
    events.push(...result.events);
  }

  return { events, state: result.state };
}

export function eventsOf(events: readonly BattleEvent[], type: string): readonly BattleEvent[] {
  return events.filter((event) => event.type === type);
}

export function unitOf(state: BattleState, id: string): Unit {
  const found = state.units.find((unit) => unit.id === id);

  if (found === undefined) throw new Error(`No unit ${id}`);

  return found;
}

export function shoot(unit: string, target: string): Command {
  return { kind: 'game', target, type: 'shoot', unit };
}

export function endSide(side: string): Command {
  return { kind: 'game', side, type: 'end-turn' };
}

export function answer(state: BattleState, content: ContentRegistry, ...dice: readonly number[]): ExecuteAccepted {
  if (state.inputRequest === undefined) throw new Error('No input request to answer');

  return play(state, content, roll(state.inputRequest.id, ...dice));
}

const FRESH_KERNEL: Kernel = createKernel({ extensions: RULES_STDLIB_EXTENSIONS });

function checkUnits(state: BattleState, content: ContentRegistry): void {
  const field = KERNEL.field(state, content);
  const taken = new Map<string, string>();
  const blocked = new Set(state.field.obstacles.flatMap(({ cells }) => cells));

  for (const one of state.units) {
    expect(Number.isSafeInteger(one.count) && one.count >= 0 && one.count <= one.startCount, one.id).toBe(true);
    expect(Number.isSafeInteger(one.health) && one.health >= 0, one.id).toBe(true);
    expect(Object.values(one.resources).every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true);
    expect(Object.values(one.spentActions).every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true);

    if (one.count > 0) expect(one.health, one.id).toBeGreaterThan(0);

    if (!standsOnField(one)) continue;

    for (const cell of field.cellsOf(one.id)) {
      expect(taken.get(cell), `${one.id} and ${String(taken.get(cell))} share ${cell}`).toBeUndefined();
      expect(blocked.has(cell), `${one.id} on an obstacle`).toBe(false);
      taken.set(cell, one.id);
    }
  }
}

function node(type: string, params: Readonly<Record<string, unknown>> = {}): ExpressionNode {
  const value: unknown = { ...params, type };

  return value as ExpressionNode;
}

function unit(id: string, name: string, count: number, cell: string, extra: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return { cell, count, creature: name, effects: [], id, items: [], visibleTo: 'all', ...extra };
}

function creature(name: string, fight: Readonly<Record<string, number>>, extra: Partial<Creature>): Creature {
  return {
    abilities: [],
    effects: [],
    movement: 'walk',
    name,
    size: 1,
    tags: [],
    ...extra,
    attributes: { 'core:action': 1, ...fight, ...extra.attributes },
    resources: {
      'core:retaliations': { initial: 'full', limit: 'core:retaliations-max', restore: 'round' },
      ...extra.resources,
    },
  };
}

function effect(name: string, extra: Partial<Effect>): Effect {
  return {
    blockedBy: [],
    duration: { kind: 'battle' },
    endsOn: [],
    forbids: [],
    grantsTags: [],
    modifiers: [],
    name,
    onApply: [],
    onRemove: [],
    onTurn: [],
    removes: [],
    stacking: 'stack',
    tags: [],
    triggers: [],
    visibility: 'all',
    ...extra,
  };
}

function noneLeft(side: string): ExpressionNode {
  return node('kernel:compare', { left: node('kernel:units-alive', { side }), operator: '=', right: 0 });
}
