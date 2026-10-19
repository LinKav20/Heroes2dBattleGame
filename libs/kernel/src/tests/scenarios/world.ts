import {
  applicationDraft,
  createKernel,
  operationDrafts,
  settledValue,
  spendActionsDraft,
  standsOnField,
  turnRecordsOf,
  type Ability,
  type CommandKind,
  type JsonObject,
  type KernelExtension,
  type StepKind,
  type BattleOptions,
  type BattleState,
  type ContentRegistry,
  type Creature,
  type DefenseVariant,
  type Effect,
  type ExpressionNode,
  type Item,
  type Kernel,
  type MechanicContext,
  type Ruleset,
  type Scenario,
  type ScenarioSide,
  type ScenarioUnit,
  type TopologyExtension,
  type TurnHolder,
  type TurnOrderVariant,
  type Unit,
} from '../../index.ts';

export interface BoardParams extends JsonObject {
  readonly width: number;
  readonly height: number;
  readonly hills?: readonly string[];
}

export const BOARD: TopologyExtension<BoardParams> = {
  area: (params, rule, center) => cellsOf(params).filter((cell) => distanceOf(cell, center) <= rule.size),
  cells: cellsOf,
  directions: () => ['east', 'west'],
  distance: (params, from, to) => distanceOf(from, to),
  footprint: (params, cell, { facing, size }) => {
    const [x, y] = pointOf(cell);
    const step = facing === 'west' ? -1 : 1;
    const cells = Array.from({ length: size }, (unused, index) => `${String(x + step * index)},${String(y)}`);

    return cells.every((taken) => cellsOf(params).includes(taken)) ? cells : undefined;
  },
  kind: 'topology',
  moveCost: (params, from, to) => (params.hills?.includes(to) === true ? 3 : 1),
  name: 'acme:board',
  neighbors: (params, cell) => {
    const [x, y] = pointOf(cell);

    return [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]
      .map(([nextX = 0, nextY = 0]) => `${String(nextX)},${String(nextY)}`)
      .filter((next) => cellsOf(params).includes(next));
  },
  schema: { type: 'object' },
};

export const SPEED: TurnOrderVariant = {
  kind: 'mechanic',
  mechanic: 'kernel:turn-order',
  name: 'acme:speed',
  next: (context) => ({ kind: 'value', value: nextBySpeed(context) }),
  schema: { type: 'object' },
  turnOwner: 'unit',
  wait: ({ state }, unit) => (turnRecordsOf(state, { kind: 'unit', unit }).some(({ waited }) => waited)
    ? { kind: 'reject', reason: 'acme:waited-twice' }
    : { kind: 'steps', steps: [] }),
};

export const TIDE: TurnOrderVariant = {
  ...SPEED,
  name: 'acme:tide',
  roundStart: () => operationDrafts(
    [node('kernel:set-variable', { value: node('kernel:round'), variable: 'tide' })],
    { subjects: {} },
  ),
  turnEnd: (context, holder) => (holder.kind === 'unit' && holder.unit === 'knight-1'
    ? operationDrafts([node('kernel:apply-effect', { effect: 'demo:haste', to: 'target' })], {
        subjects: { target: holder },
      })
    : []),
};

export const GAMBLE: CommandKind = {
  kind: 'command',
  name: 'acme:gamble',
  plan: ({ state }) => {
    const holder = state.phase.kind === 'turn' ? state.phase.unit : undefined;

    return holder === undefined
      ? { kind: 'reject', reason: 'kernel:wrong-phase' }
      : { kind: 'steps', steps: [{ params: { unit: holder }, type: 'acme:gamble-roll' }] };
  },
  schema: { type: 'object' },
};

export const GAMBLE_ROLL: StepKind<{ readonly unit: string }> = {
  kind: 'step',
  migrations: [],
  name: 'acme:gamble-roll',
  run: ({ inputs, params }) => {
    const [roll] = inputs;

    if (roll === undefined) return { kind: 'need', need: { count: 1, kind: 'roll', name: 'demo:damage', sides: 6 } };

    if (roll.kind === 'roll' && roll.result === 1) return { kind: 'reject', reason: 'acme:unlucky' };

    return { events: [], kind: 'done', steps: [spendActionsDraft({ spent: { 'core:action': 1 }, unit: params.unit })] };
  },
  version: 1,
};

export const SIDES_IN_TURN: TurnOrderVariant = {
  kind: 'mechanic',
  mechanic: 'kernel:turn-order',
  name: 'acme:sides',
  next: ({ state }) => {
    const side = state.sides
      .find(({ id }) => !state.turns.some(({ holder }) => holder.kind === 'side' && holder.side === id));

    return { kind: 'value', value: side === undefined ? undefined : { kind: 'side', side: side.id } };
  },
  schema: { type: 'object' },
  turnOwner: 'side',
};

export const GUARD: DefenseVariant = {
  defend: (context, unit) => ({
    kind: 'steps',
    steps: [
      applicationDraft({ effect: 'demo:guarding', holder: { kind: 'unit', unit } }),
      spendActionsDraft({ spent: { 'core:action': 1 }, unit }),
    ],
  }),
  kind: 'mechanic',
  mechanic: 'kernel:defense',
  name: 'acme:guard',
  schema: { type: 'object' },
};

export const WORLD_EXTENSIONS: readonly KernelExtension[] = [
  BOARD,
  SPEED,
  TIDE,
  SIDES_IN_TURN,
  GUARD,
  GAMBLE,
  GAMBLE_ROLL,
];

export const WORLD_KERNEL: Kernel = createKernel({ extensions: WORLD_EXTENSIONS });

export const FRESH_KERNEL: Kernel = createKernel({ extensions: WORLD_EXTENSIONS });

export const SKIRMISH: Ruleset = {
  healthAttribute: 'core:health',
  mechanics: {
    'kernel:defense': { variant: 'acme:guard' },
    'kernel:turn-order': { variant: 'acme:speed' },
  },
  name: 'demo:skirmish',
  randomSources: { 'demo:damage': 'generator' },
  rounding: 'down',
  turn: { actions: ['core:action'], endTurn: true, movement: { actions: {}, points: 'core:move' } },
  turnOwner: 'unit',
};

export const PASS: Scenario = {
  extensions: {},
  field: {
    hazards: [
      { cells: ['4,1'], effects: ['demo:flames'], id: 'fire', visibleTo: 'all' },
      { cells: ['5,3'], effects: ['demo:mist'], id: 'mist', visibleTo: ['defender'] },
    ],
    obstacles: [{ cells: ['3,0'], id: 'rock-1', obstacle: 'demo:rock' }],
    params: { height: 5, hills: ['4,2'], width: 8 },
    topology: 'acme:board',
  },
  name: 'demo:pass',
  outcomes: [
    { condition: noneLeft('defender'), id: 'rout', outcome: 'victory', side: 'attacker' },
    { condition: noneLeft('attacker'), id: 'wiped-out', outcome: 'victory', side: 'defender' },
    {
      condition: node('kernel:compare', { left: node('kernel:round'), operator: '>', right: 6 }),
      id: 'held',
      outcome: 'victory',
      side: 'defender',
    },
  ],
  ruleset: 'demo:skirmish',
  sides: [
    {
      abilities: ['demo:rally'],
      deploymentZone: ['0,0', '0,1', '0,2', '0,3', '0,4', '1,0', '1,1', '1,2', '1,3', '1,4'],
      effects: ['demo:war-drums'],
      id: 'attacker',
      units: [
        unit('knight-1', 'demo:knight', { items: [{ count: 1, item: 'demo:standard', slot: 'hands' }] }),
        unit('archers-1', 'demo:archer', { count: 5 }),
        unit('mage-1', 'demo:mage', {
          items: [{ count: 2, item: 'demo:potion' }, { count: 1, item: 'demo:silence-scroll' }],
        }),
      ],
    },
    {
      abilities: [],
      deploymentZone: ['6,0', '6,1', '6,3', '6,4', '7,0', '7,1', '7,2', '7,3', '7,4'],
      effects: ['demo:fortified'],
      id: 'defender',
      units: [
        unit('golem-1', 'demo:golem', { cell: '6,2', facing: 'west' }),
        unit('ghosts-1', 'demo:ghost', { count: 3 }),
        unit('griffins-1', 'demo:griffin', { count: 2 }),
      ],
    },
  ],
  triggers: [
    {
      id: 'first-blood',
      limit: 1,
      on: 'kernel:health-changed',
      ops: [node('kernel:set-variable', { value: true, variable: 'first-blood' })],
      priority: 0,
    },
    {
      condition: node('kernel:compare', { left: node('kernel:round'), operator: '=', right: 3 }),
      id: 'reinforce',
      limit: 1,
      on: 'kernel:round-start',
      ops: [node('kernel:set-variable', { value: true, variable: 'reinforced' })],
      priority: 0,
    },
    {
      id: 'turn-count',
      on: 'kernel:turn-end',
      ops: [node('kernel:set-variable', {
        value: node('kernel:add', { values: [node('kernel:variable', { variable: 'turns' }), 1] }),
        variable: 'turns',
      })],
      priority: 0,
    },
  ],
  variables: { drums: 0, 'first-blood': false, turns: 0 },
};

export const WORLD: ContentRegistry = {
  abilities: Object.fromEntries([
    ability('demo:strike', {
      ops: [node('kernel:damage', { amount: armored(6), to: 'target' })],
      target: { filter: notSelf(), kind: 'unit', range: 1 },
    }),
    ability('demo:shoot', {
      ops: [node('kernel:damage', { amount: 4, to: 'target' })],
      target: { filter: notSelf(), kind: 'unit', range: 5 },
    }),
    ability('demo:fireball', {
      cooldown: 1,
      cost: { actions: { 'core:action': 1 }, resources: { 'demo:mana': 4 } },
      forbiddenBy: ['Debuff.Silence'],
      ops: [node('kernel:damage', {
        amount: node('kernel:add', { values: [2, node('kernel:dice', { count: 1, name: 'demo:damage', sides: 6 })] }),
        to: 'target',
      })],
      tags: ['Spell.Fire'],
      target: { area: { shape: 'radius', size: 1 }, kind: 'area', range: 5 },
    }),
    ability('demo:mend', {
      cost: { actions: { 'core:action': 1 }, resources: { 'demo:mana': 2 } },
      forbiddenBy: ['Debuff.Silence'],
      limits: { perRound: 1 },
      ops: [
        node('kernel:heal', { amount: 6, to: 'target' }),
        node('kernel:remove-effects', { from: 'target', tags: ['Debuff'] }),
      ],
      tags: ['Spell.Holy'],
      target: { count: 2, kind: 'unit', range: 3 },
    }),
    ability('demo:hex', {
      cost: { actions: { 'core:action': 1 }, resources: { 'demo:mana': 3 } },
      forbiddenBy: ['Debuff.Silence'],
      ops: [
        node('kernel:apply-effect', { effect: 'demo:poison', to: 'target' }),
        node('kernel:apply-effect', { effect: 'demo:silence', to: 'target' }),
      ],
      tags: ['Spell.Dark'],
      target: { filter: notSelf(), kind: 'unit', range: 4 },
    }),
    ability('demo:rally', {
      cost: { actions: {}, resources: {} },
      limits: { perRound: 1 },
      ops: [node('kernel:apply-effect', { effect: 'demo:haste', to: 'target' })],
      target: { kind: 'unit' },
    }),
    ability('demo:quaff', {
      cost: { actions: {}, resources: {} },
      ops: [node('kernel:heal', { amount: 10, to: 'target' })],
      target: { kind: 'self' },
    }),
    ability('demo:read-silence', {
      cost: { actions: {}, resources: {} },
      ops: [node('kernel:apply-effect', { effect: 'demo:silence', to: 'target' })],
      target: { kind: 'unit', range: 6 },
    }),
  ].map((one) => [one.name, one])),
  attributes: {
    'core:action': { name: 'core:action' },
    'core:health': { min: 1, name: 'core:health' },
    'core:move': { min: 0, name: 'core:move' },
    'core:speed': { min: 0, name: 'core:speed' },
    'demo:armor': { min: 0, name: 'demo:armor' },
    'demo:mana': { min: 0, name: 'demo:mana' },
  },
  battlefields: {},
  contentHash: 'c'.repeat(64),
  creatures: Object.fromEntries([
    creature('demo:knight', { 'core:health': 30, 'core:move': 3, 'core:speed': 3, 'demo:armor': 2 }, {
      abilities: ['demo:strike'],
      tags: ['Creature.Human'],
    }),
    creature('demo:archer', { 'core:health': 10, 'core:move': 4, 'core:speed': 4 }, {
      abilities: ['demo:shoot'],
      tags: ['Creature.Human'],
    }),
    creature('demo:mage', { 'core:health': 8, 'core:move': 3, 'core:speed': 5, 'demo:mana': 10 }, {
      abilities: ['demo:fireball', 'demo:mend', 'demo:hex'],
      resources: { 'demo:mana': { initial: 'full', limit: 'demo:mana' } },
      tags: ['Creature.Human'],
    }),
    creature('demo:griffin', { 'core:health': 20, 'core:move': 6, 'core:speed': 6 }, {
      abilities: ['demo:strike'],
      movement: 'fly',
      size: 2,
      tags: ['Creature.Beast'],
    }),
    creature('demo:ghost', { 'core:health': 6, 'core:move': 3, 'core:speed': 4 }, {
      abilities: ['demo:strike'],
      movement: 'teleport',
      tags: ['Creature.Undead', 'Immunity.Poison'],
    }),
    creature('demo:golem', { 'core:health': 40, 'core:move': 1, 'core:speed': 1, 'demo:armor': 5 }, {
      abilities: ['demo:strike'],
      effects: ['demo:thorns'],
      tags: ['Creature.Construct', 'Immunity.Poison'],
    }),
  ].map((one) => [one.name, one])),
  effects: Object.fromEntries([
    effect('demo:poison', {
      blockedBy: ['Immunity.Poison'],
      duration: { count: 3, kind: 'turns', tick: 'holder-turn-start' },
      grantsTags: ['Debuff.Poison'],
      onTurn: [node('kernel:damage', { amount: 2, to: 'self' })],
      stacking: 'refresh',
      tags: ['Debuff.Poison'],
    }),
    effect('demo:silence', {
      duration: { count: 1, kind: 'turns', tick: 'holder-turn-end' },
      grantsTags: ['Debuff.Silence'],
      stacking: 'refresh',
      tags: ['Debuff.Silence'],
    }),
    effect('demo:haste', {
      duration: { count: 2, kind: 'rounds', tick: 'round-end' },
      modifiers: [
        { attribute: 'core:speed', operation: 'add', value: 2 },
        { attribute: 'core:move', operation: 'add', value: 2 },
      ],
      stacking: 'refresh',
      tags: ['Buff.Haste'],
    }),
    effect('demo:rage', {
      maxStacks: 3,
      modifiers: [{ attribute: 'core:speed', operation: 'add', value: 1 }],
      tags: ['Buff.Rage'],
    }),
    effect('demo:thorns', {
      triggers: [{
        condition: node('kernel:same', { left: 'self', right: 'target' }),
        on: 'kernel:health-changed',
        ops: [node('kernel:apply-effect', { effect: 'demo:rage', to: 'self' })],
        priority: 0,
      }],
    }),
    effect('demo:guarding', {
      duration: { count: 1, kind: 'turns', tick: 'holder-turn-start' },
      modifiers: [{ attribute: 'demo:armor', operation: 'add', value: 4 }],
      stacking: 'refresh',
      tags: ['Buff.Guard'],
    }),
    effect('demo:flames', {
      triggers: [
        { on: 'kernel:unit-moved', ops: [node('kernel:damage', { amount: 3, to: 'target' })], priority: 0 },
        { on: 'kernel:phase-changed', ops: [node('kernel:damage', { amount: 3, to: 'target' })], priority: 0 },
      ],
    }),
    effect('demo:mist', { modifiers: [{ attribute: 'core:speed', operation: 'add', value: -1 }] }),
    effect('demo:bleed', {
      duration: { count: 4, kind: 'turns', tick: 'holder-turn-start' },
      onTurn: [node('kernel:damage', {
        amount: node('kernel:dice', { count: 1, name: 'demo:damage', sides: 4 }),
        to: 'self',
      })],
      stacking: 'refresh',
    }),
    effect('demo:banner', {
      aura: { affects: 'allies', area: { shape: 'radius', size: 1 }, effect: 'demo:inspired' },
    }),
    effect('demo:inspired', {
      grantsTags: ['Buff.Inspired'],
      modifiers: [{ attribute: 'demo:armor', operation: 'add', value: 1 }],
    }),
    effect('demo:fortified', { modifiers: [{ attribute: 'demo:armor', operation: 'add', value: 1 }] }),
    effect('demo:war-drums', {
      duration: { count: 3, kind: 'turns', tick: 'holder-turn-start' },
      onTurn: [node('kernel:set-variable', {
        value: node('kernel:add', { values: [node('kernel:variable', { variable: 'drums' }), 1] }),
        variable: 'drums',
      })],
    }),
  ].map((one) => [one.name, one])),
  items: Object.fromEntries([
    item('demo:standard', { effects: ['demo:banner'], slot: 'hands' }),
    item('demo:potion', { abilities: ['demo:quaff'], charges: 1, consumedOnUse: true, stack: 3 }),
    item('demo:silence-scroll', { abilities: ['demo:read-silence'], consumedOnUse: true }),
  ].map((one) => [one.name, one])),
  obstacles: { 'demo:rock': { blocksMovement: true, blocksSight: true, name: 'demo:rock', tags: [] } },
  packs: [{ name: 'demo', version: '3.0.0' }],
  rulesets: { 'demo:skirmish': SKIRMISH },
  scenarios: { 'demo:pass': PASS },
  tags: [
    'Buff.Guard',
    'Buff.Haste',
    'Buff.Inspired',
    'Buff.Rage',
    'Creature.Beast',
    'Creature.Construct',
    'Creature.Human',
    'Creature.Undead',
    'Debuff.Poison',
    'Debuff.Silence',
    'Immunity.Poison',
    'Spell.Dark',
    'Spell.Fire',
    'Spell.Holy',
  ],
};

export const SEED = '5eed'.repeat(16);

export function node(type: string, params: Readonly<Record<string, unknown>> = {}): ExpressionNode {
  const value: unknown = { ...params, type };

  return value as ExpressionNode;
}

export function worldWith(
  change: Partial<Scenario> = {},
  ruleset: Partial<Ruleset> = {},
  extra: Partial<ContentRegistry> = {},
): ContentRegistry {
  return {
    ...WORLD,
    ...extra,
    rulesets: { 'demo:skirmish': { ...SKIRMISH, ...ruleset } },
    scenarios: { 'demo:pass': { ...PASS, ...change } },
  };
}

export function withUnits(side: string, change: (units: readonly ScenarioUnit[]) => readonly ScenarioUnit[]): {
  readonly sides: readonly ScenarioSide[];
} {
  return { sides: PASS.sides.map((one) => (one.id === side ? { ...one, units: change(one.units) } : one)) };
}

export function arena(
  cells: Readonly<Record<string, string>>,
  units: Readonly<Record<string, Partial<ScenarioUnit>>> = {},
  change: Partial<Scenario> = {},
): ContentRegistry {
  const sides = PASS.sides.map((side) => ({
    ...side,
    units: side.units.flatMap((one) => {
      const at = cells[one.id];

      return at === undefined ? [] : [{ ...one, cell: at, ...units[one.id] }];
    }),
  }));

  return worldWith({ sides, ...change });
}

export function created(content: ContentRegistry = WORLD, options: Partial<BattleOptions> = {}): BattleState {
  return WORLD_KERNEL.createState({ scenario: 'demo:pass', seed: SEED, ...options }, content);
}

export function speedOf(context: MechanicContext, unit: Unit): number {
  return settledValue(context.expressions.attribute({ kind: 'unit', unit: unit.id }, 'core:speed'), 'acme:speed');
}

function nextBySpeed(context: MechanicContext): TurnHolder | undefined {
  const { state } = context;
  const ready = state.units.filter((one) => standsOnField(one));
  const fresh = ready.filter((one) => turnRecordsOf(state, { kind: 'unit', unit: one.id }).length === 0);
  const waiting = ready.filter((one) => {
    const records = turnRecordsOf(state, { kind: 'unit', unit: one.id });

    return records.length === 1 && records[0]?.waited === true;
  });
  const next = ranked(context, fresh, true)[0] ?? ranked(context, waiting, false)[0];

  return next === undefined ? undefined : { kind: 'unit', unit: next.id };
}

function ranked(context: MechanicContext, units: readonly Unit[], fastest: boolean): readonly Unit[] {
  const { state } = context;
  const sideOrder = state.sides.map(({ id }) => id);

  return [...units].sort((left, right) => {
    const bySpeed = (speedOf(context, right) - speedOf(context, left)) * (fastest ? 1 : -1);

    if (bySpeed !== 0) return bySpeed;

    const bySide = sideOrder.indexOf(left.side) - sideOrder.indexOf(right.side);

    return bySide === 0 ? state.units.indexOf(left) - state.units.indexOf(right) : bySide;
  });
}

function cellsOf(params: BoardParams): readonly string[] {
  return Array.from({ length: params.width * params.height }, (unused, index) =>
    `${String(index % params.width)},${String(Math.floor(index / params.width))}`);
}

function pointOf(cell: string): readonly [number, number] {
  const [x = 0, y = 0] = cell.split(',').map(Number);

  return [x, y];
}

function distanceOf(from: string, to: string): number {
  const [fromX, fromY] = pointOf(from);
  const [toX, toY] = pointOf(to);

  return Math.abs(fromX - toX) + Math.abs(fromY - toY);
}

function noneLeft(side: string): ExpressionNode {
  return node('kernel:compare', { left: node('kernel:units-alive', { side }), operator: '=', right: 0 });
}

function notSelf(): ExpressionNode {
  return node('kernel:not', { condition: node('kernel:same', { left: 'self', right: 'target' }) });
}

function armored(base: number): ExpressionNode {
  const armor = node('kernel:attribute', { attribute: 'demo:armor', of: 'target' });

  return node('kernel:max', { values: [1, node('kernel:subtract', { left: base, right: armor })] });
}

function unit(id: string, creatureName: string, extra: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return { count: 1, creature: creatureName, effects: [], id, items: [], visibleTo: 'all', ...extra };
}

function ability(name: string, extra: Partial<Ability>): Ability {
  return {
    cooldown: 0,
    cost: { actions: { 'core:action': 1 }, resources: {} },
    forbiddenBy: [],
    limits: {},
    name,
    ops: [],
    tags: [],
    target: { kind: 'none' },
    ...extra,
  };
}

function creature(name: string, attributes: Readonly<Record<string, number>>, extra: Partial<Creature>): Creature {
  return {
    abilities: [],
    attributes: { 'core:action': 1, ...attributes },
    effects: [],
    movement: 'walk',
    name,
    resources: {},
    size: 1,
    tags: [],
    ...extra,
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

function item(name: string, extra: Partial<Item>): Item {
  return { abilities: [], consumedOnUse: false, effects: [], name, stack: 1, tags: [], ...extra };
}
