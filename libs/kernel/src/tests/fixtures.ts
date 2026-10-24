import type { ContentRegistry, Effect, ExpressionNode, Ruleset } from '../content/index.ts';
import type { ExecuteAccepted, ExecuteResult } from '../execution/index.ts';
import type { ExtensionEventKind, StepKind, TopologyExtension, TurnOrderVariant } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import {
  standsOnField,
  type AppliedEffect,
  type BattleEvent,
  type BattleState,
  type TurnHolder,
  type TurnRecord,
  type Unit,
} from '../model/index.ts';

export interface GridParams extends JsonObject {
  readonly width: number;
  readonly height: number;
  readonly hills?: readonly string[];
}

export const RULESET: Ruleset = {
  healthAttribute: 'core:health',
  mechanics: {
    'kernel:turn-order': { params: { waiting: true }, variant: 'acme:scenario-order' },
  },
  name: 'core:stacks-speed',
  randomSources: { 'core:damage-roll': 'generator', 'core:morale': 'external' },
  rounding: 'down',
  turn: { actions: [], endTurn: true },
  turnOwner: 'unit',
};

export const CONTENT: ContentRegistry = {
  abilities: {
    'demo:drink': {
      cooldown: 0,
      cost: { actions: { 'core:bonus-action': 1 }, resources: {} },
      forbiddenBy: [],
      limits: {},
      name: 'demo:drink',
      ops: [{ amount: 5, type: 'rules-stdlib:heal' }],
      tags: ['Item.Potion'],
      target: { kind: 'self' },
    },
    'demo:fire-arrow': {
      cooldown: 2,
      cost: { actions: { 'core:action': 1 }, resources: { 'demo:mana': 3 } },
      forbiddenBy: ['Debuff.Silence'],
      limits: { perBattle: 2 },
      name: 'demo:fire-arrow',
      ops: [{
        amount: { count: 2, name: 'core:damage-roll', sides: 6, type: 'kernel:dice' },
        type: 'rules-stdlib:damage',
      }],
      tags: ['Spell.Fire'],
      target: { kind: 'unit', range: 6 },
    },
  },
  attributes: {
    'core:health': { min: 1, name: 'core:health' },
    'core:speed': { name: 'core:speed' },
    'demo:mana': { min: 0, name: 'demo:mana' },
  },
  battlefields: { 'demo:meadow': { effects: [], name: 'demo:meadow' } },
  contentHash: 'a'.repeat(64),
  creatures: {
    'demo:archer': {
      abilities: ['demo:fire-arrow'],
      attributes: { 'core:health': 10, 'core:speed': 4, 'demo:mana': 5 },
      effects: [],
      movement: 'walk',
      name: 'demo:archer',
      resources: { 'demo:mana': { initial: 'full', limit: 'demo:mana', restore: 'round' } },
      size: 1,
      tags: ['Creature.Human'],
    },
    'demo:pikeman': {
      abilities: [],
      attributes: { 'core:health': 10, 'core:speed': 4 },
      effects: [],
      movement: 'walk',
      name: 'demo:pikeman',
      resources: {},
      size: 1,
      tags: ['Creature.Human'],
    },
  },
  effects: {
    'core:poison': {
      blockedBy: ['Immunity.Poison'],
      duration: { count: 3, kind: 'turns', tick: 'holder-turn-start' },
      endsOn: [{ condition: { left: 'self', right: 'target', type: 'kernel:same' }, on: 'rules-stdlib:unit-healed' }],
      forbids: [],
      grantsTags: ['Debuff.Poison'],
      modifiers: [{ attribute: 'core:speed', operation: 'percent', value: -25 }],
      name: 'core:poison',
      onApply: [],
      onRemove: [],
      onTurn: [{ amount: 2, type: 'rules-stdlib:damage' }],
      removes: [],
      stacking: 'strongest',
      strength: 2,
      tags: ['Debuff.Poison'],
      triggers: [{ on: 'kernel:unit-moved', ops: [], priority: 0 }],
      visibility: 'all',
    },
  },
  items: {
    'demo:healing-potion': {
      abilities: ['demo:drink'],
      charges: 1,
      consumedOnUse: true,
      effects: [],
      name: 'demo:healing-potion',
      stack: 5,
      tags: ['Item.Potion'],
    },
  },
  obstacles: {
    'demo:rock': { blocksMovement: true, blocksSight: true, name: 'demo:rock', tags: [] },
  },
  packs: [{ name: 'core', version: '1.0.0' }, { name: 'demo', version: '2.1.0' }],
  rulesets: { 'core:stacks-speed': RULESET },
  scenarios: {
    'demo:bridge': {
      extensions: { 'rules-stdlib:siege': { walls: ['7,3'] } },
      field: {
        hazards: [{ cells: ['5,5'], effects: ['core:poison'], id: 'swamp', visibleTo: ['defender'] }],
        obstacles: [{ cells: ['7,3'], id: 'rock-1', obstacle: 'demo:rock' }],
        params: { height: 11, width: 15 },
        topology: 'acme:facing-grid',
      },
      name: 'demo:bridge',
      outcomes: [
        {
          condition: {
            left: { side: 'defender', type: 'kernel:units-alive' },
            operator: '=',
            right: 0,
            type: 'kernel:compare',
          },
          id: 'rout',
          outcome: 'victory',
          side: 'attacker',
        },
      ],
      ruleset: 'core:stacks-speed',
      sides: [
        {
          abilities: [],
          deploymentZone: ['0,0', '0,1'],
          effects: [],
          id: 'attacker',
          units: [
            {
              count: 10,
              creature: 'demo:archer',
              effects: [],
              id: 'archers-1',
              items: [{ charges: 1, count: 2, item: 'demo:healing-potion' }],
              visibleTo: 'all',
            },
          ],
        },
        {
          abilities: [],
          deploymentZone: ['14,0', '14,1'],
          effects: [],
          id: 'defender',
          units: [
            {
              cell: '14,5',
              count: 20,
              creature: 'demo:pikeman',
              effects: [],
              id: 'pikemen-1',
              items: [],
              visibleTo: ['defender'],
            },
          ],
        },
      ],
      triggers: [
        {
          condition: { left: { type: 'kernel:round' }, operator: '=', right: 3, type: 'kernel:compare' },
          id: 'reinforcements',
          limit: 1,
          on: 'kernel:phase-changed',
          ops: [{ type: 'kernel:set-variable', value: true, variable: 'reinforcements-arrived' }],
          priority: 0,
        },
      ],
      variables: { 'reinforcements-arrived': false },
    },
  },
  tags: ['Creature.Human', 'Debuff.Poison', 'Debuff.Silence', 'Immunity.Poison', 'Item.Potion', 'Spell.Fire'],
};

export const STATE: BattleState = {
  contentHash: CONTENT.contentHash,
  extensions: { 'rules-stdlib:siege': { walls: ['7,3'] } },
  field: {
    effects: [],
    hazards: [
      {
        cells: ['5,5'],
        effects: [{ active: true, effect: 'core:poison', id: 5, params: {}, stacks: 1, visibleTo: ['defender'] }],
        id: 'swamp',
        visibleTo: ['defender'],
      },
    ],
    obstacles: [{ cells: ['7,3'], id: 'rock-1', obstacle: 'demo:rock' }],
    params: { height: 11, width: 15 },
    topology: 'acme:facing-grid',
  },
  format: { extensions: { 'rules-stdlib:siege': 1 }, kernel: 1, steps: { 'kernel:end-turn': 1 } },
  inputRequest: {
    count: 1,
    id: 7,
    kind: 'roll',
    name: 'core:morale',
    side: 'attacker',
    sides: 20,
    unit: 'archers-1',
  },
  nextId: 8,
  nextRequestId: 8,
  packs: CONTENT.packs,
  phase: { kind: 'turn', side: 'attacker', unit: 'archers-1' },
  rng: { counter: 12, seed: '0'.repeat(64) },
  round: 1,
  ruleset: RULESET,
  scenario: 'demo:bridge',
  sides: [
    { abilities: [], abilityUses: [], effects: [], id: 'attacker' },
    { abilities: [], abilityUses: [], effects: [], id: 'defender' },
  ],
  steps: [{ params: { unit: 'archers-1' }, type: 'kernel:end-turn', version: 1 }],
  triggers: { reinforcements: { fired: 0 } },
  turns: [],
  units: [
    {
      abilityUses: [{ ability: 'demo:fire-arrow', battle: 1, cooldown: 1, round: 1, turn: 1 }],
      auras: [],
      cell: '1,5',
      count: 10,
      creature: 'demo:archer',
      effects: [
        {
          active: true,
          effect: 'core:poison',
          id: 3,
          params: {},
          remaining: 2,
          sourceUnit: 'pikemen-1',
          stacks: 1,
          visibleTo: 'all',
        },
      ],
      flags: ['rules-stdlib:waited'],
      health: 7,
      id: 'archers-1',
      inventory: [{ charges: 1, count: 2, id: 4, item: 'demo:healing-potion' }],
      resources: { 'demo:mana': 3 },
      side: 'attacker',
      spentActions: {},
      startCount: 10,
      summoned: false,
      tags: {},
      visibleTo: 'all',
      zones: [],
    },
    {
      abilityUses: [],
      auras: [],
      cell: '14,5',
      count: 20,
      creature: 'demo:pikeman',
      effects: [],
      flags: [],
      health: 10,
      id: 'pikemen-1',
      inventory: [],
      resources: {},
      side: 'defender',
      spentActions: {},
      startCount: 20,
      summoned: false,
      tags: {},
      visibleTo: ['defender'],
      zones: [],
    },
  ],
  variables: { 'reinforcements-arrived': false },
};

export const FROZEN_STATE: BattleState = deepFreeze(STATE);

export const FROST_EVENT: ExtensionEventKind<{ readonly unit: string }> = {
  apply: (state, { unit }) => ({
    ...state,
    extensions: { ...state.extensions, 'acme-frost:frozen': [unit] },
  }),
  kind: 'event',
  migrations: [],
  name: 'acme-frost:frozen',
  schema: { properties: { unit: { type: 'string' } }, type: 'object' },
  version: 1,
};

export const RENAMED_EVENT: ExtensionEventKind<{ readonly target: string }> = {
  apply: (state, { target }) => ({ ...state, extensions: { ...state.extensions, 'acme-frost:target': target } }),
  kind: 'event',
  migrations: [
    { from: 1, migrate: (value) => ({ ...asRecord(value), victim: asRecord(value).unit }) },
    { from: 2, migrate: (value) => ({ target: asRecord(value).victim }) },
  ],
  name: 'acme-frost:targeted',
  schema: { properties: { target: { type: 'string' } }, type: 'object' },
  version: 3,
};

export const STRIKE_STEP: StepKind = {
  kind: 'step',
  migrations: [{ from: 1, migrate: (value) => ({ ...asRecord(value), amount: asRecord(value).damage }) }],
  name: 'acme-frost:strike',
  run: () => ({ events: [], kind: 'done' }),
  version: 2,
};

export const GRID: TopologyExtension<GridParams> = {
  area: (params, rule, center, origin) => {
    if (rule.shape === 'radius') return gridCells(params).filter((cell) => gridDistance(cell, center) <= rule.size);

    if (origin === undefined) return [center];

    const [fromX, fromY] = gridPoint(origin);
    const [toX, toY] = gridPoint(center);
    const stepX = Math.sign(toX - fromX);
    const stepY = Math.sign(toY - fromY);

    return counting(rule.size)
      .map((index) => gridCell(fromX + stepX * (index + 1), fromY + stepY * (index + 1)))
      .filter((cell) => gridCells(params).includes(cell));
  },
  cells: gridCells,
  distance: (params, from, to) => gridDistance(from, to),
  footprint: (params, cell, { size }) => {
    const [x, y] = gridPoint(cell);
    const cells = counting(size).map((index) => gridCell(x + index, y));

    return cells.every((taken) => gridCells(params).includes(taken)) ? cells : undefined;
  },
  kind: 'topology',
  moveCost: (params, from, to) => (params.hills?.includes(to) === true ? 3 : 1),
  name: 'acme:grid',
  neighbors: (params, cell) => {
    const [x, y] = gridPoint(cell);
    const around = [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]];

    return around
      .map(([nextX = 0, nextY = 0]) => gridCell(nextX, nextY))
      .filter((next) => gridCells(params).includes(next));
  },
  schema: { type: 'object' },
};

export const FACING_GRID: TopologyExtension<GridParams> = {
  ...GRID,
  line: (params, from, to) => gridLine(from, to),
  footprint: (params, cell, { facing, size }) => {
    const [x, y] = gridPoint(cell);
    const step = facing === 'west' ? -1 : 1;
    const cells = counting(size).map((index) => gridCell(x + step * index, y));

    return cells.every((taken) => gridCells(params).includes(taken)) ? cells : undefined;
  },
  name: 'acme:facing-grid',
};

export const SPEED_ORDER: TurnOrderVariant = {
  kind: 'mechanic',
  mechanic: 'kernel:turn-order',
  name: 'acme:scenario-order',
  next: ({ state }) => ({ kind: 'value', value: nextUnit(state) }),
  schema: { type: 'object' },
  wait: () => ({ kind: 'steps', steps: [] }),
};

export function deepFreeze<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((member: unknown) => deepFreeze(member));
    Object.freeze(value);
  }

  return value;
}

export function node(type: string, params: Readonly<Record<string, unknown>> = {}): ExpressionNode {
  const value: unknown = { ...params, type };

  return value as ExpressionNode;
}

export function effect(name: string, extra: Partial<Effect> = {}): Effect {
  return {
    blockedBy: [],
    duration: { count: 2, kind: 'turns', tick: 'holder-turn-start' },
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

export function applied(id: number, name: string, extra: Partial<AppliedEffect> = {}): AppliedEffect {
  return { active: true, effect: name, id, params: {}, stacks: 1, visibleTo: 'all', ...extra };
}

export function event(type: string, payload: unknown, version = 1): BattleEvent {
  return { id: 0, payload, type, version, visibleTo: 'all' };
}

export function accepted(result: ExecuteResult): ExecuteAccepted {
  if (!result.ok) throw new Error(`Rejected: ${JSON.stringify(result.rejection)}`);

  return result;
}

export function unitOf(state: BattleState, id: string): Unit {
  const unit = state.units.find((current) => current.id === id);

  if (unit === undefined) throw new Error(`No unit ${id}`);

  return unit;
}

export function gridCells(params: GridParams): readonly string[] {
  return counting(params.height).flatMap((y) => counting(params.width).map((x) => gridCell(x, y)));
}

export function gridCell(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}

export function counting(count: number): readonly number[] {
  return [...Array.from({ length: count }).keys()];
}

export function gridPoint(cell: string): readonly [number, number] {
  const [x = 0, y = 0] = cell.split(',').map(Number);

  return [x, y];
}

export function gridLine(from: string, to: string): readonly string[] {
  const [fromX, fromY] = gridPoint(from);
  const [toX, toY] = gridPoint(to);
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));

  return counting(Math.max(0, steps - 1)).map((index) => gridCell(
    fromX + Math.round(((toX - fromX) * (index + 1)) / steps),
    fromY + Math.round(((toY - fromY) * (index + 1)) / steps),
  ));
}

export function gridDistance(from: string, to: string): number {
  const [fromX, fromY] = gridPoint(from);
  const [toX, toY] = gridPoint(to);

  return Math.abs(fromX - toX) + Math.abs(fromY - toY);
}

export function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};
}

function nextUnit(state: BattleState): TurnHolder | undefined {
  const ready = state.units.filter((unit) => standsOnField(unit));
  const fresh = ready.find((unit) => recordsOf(state, unit).length === 0);
  const waited = ready.find((unit) => {
    const records = recordsOf(state, unit);

    return records.length === 1 && records[0]?.waited === true;
  });
  const next = fresh ?? waited;

  return next === undefined ? undefined : { kind: 'unit', unit: next.id };
}

function recordsOf(state: BattleState, unit: Unit): readonly TurnRecord[] {
  return state.turns.filter(({ holder }) => holder.kind === 'unit' && holder.unit === unit.id);
}
