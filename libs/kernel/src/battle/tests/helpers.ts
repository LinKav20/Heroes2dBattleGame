import type { ContentRegistry, Creature, Effect, Ruleset, Scenario } from '../../content/index.ts';
import { ReactionIndex } from '../../effects/index.ts';
import type { ExecuteAccepted, ExecuteResult } from '../../execution/index.ts';
import { AttributeCache } from '../../expressions/index.ts';
import type {
  CommandKind,
  DefenseVariant,
  KernelExtension,
  StepDraft,
  StepKind,
  TopologyExtension,
  TurnOrderVariant,
} from '../../extensions/index.ts';
import { FieldCache } from '../../geometry/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { BattleState, Command, GameCommand } from '../../model/index.ts';
import { accepted, effect, HEX, node, SPEED_ORDER, type GridParams } from '../../tests/fixtures.ts';
import { runDrafts } from '../../tests/run-drafts.ts';
import { spendActionsDraft } from '../index.ts';

export const ORDER: TurnOrderVariant = {
  ...SPEED_ORDER,
  battleStart: () => [mark('started')],
  name: 'acme:in-order',
  roundStart: ({ state }) => [mark('round', state.round)],
  turnEnd: (context, holder) => (holder.kind === 'unit' ? [mark('last', holder.unit)] : []),
};

export const SIDES: TurnOrderVariant = {
  kind: 'mechanic',
  mechanic: 'kernel:turn-order',
  name: 'acme:sides-in-turn',
  next: ({ state }) => {
    const side = state.sides
      .find(({ id }) => !state.turns.some(({ holder }) => holder.kind === 'side' && holder.side === id));

    return { kind: 'value', value: side === undefined ? undefined : { kind: 'side', side: side.id } };
  },
  schema: { type: 'object' },
  turnOwner: 'side',
};

export const COMPASS: TopologyExtension<GridParams> = { ...HEX, directions: () => ['east', 'west'], name: 'acme:grid' };

export const BRACE: DefenseVariant = {
  defend: (context, unit) => (unit === 'pikemen-1'
    ? { kind: 'reject', reason: 'acme:too-proud' }
    : { kind: 'steps', steps: [mark('braced', unit), spendActionsDraft({ spent: { 'core:action': 1 }, unit })] }),
  kind: 'mechanic',
  mechanic: 'kernel:defense',
  name: 'acme:brace',
  schema: { type: 'object' },
};

export const MARK_STEP: StepKind<{ readonly variable: string; readonly value: boolean | number | string }> = {
  kind: 'step',
  migrations: [],
  name: 'acme:mark',
  run: ({ params }) => ({
    events: [{
      payload: { value: params.value, variable: params.variable },
      type: 'kernel:variable-set',
      visibleTo: 'all',
    }],
    kind: 'done',
  }),
  version: 1,
};

export const ASK_STEP: StepKind = {
  kind: 'step',
  migrations: [],
  name: 'acme:ask',
  run: ({ inputs }) => (inputs.length === 0
    ? { kind: 'need', need: { count: 1, kind: 'roll', name: 'core:morale', sides: 6 } }
    : { events: [], kind: 'done', steps: [mark('asked')] }),
  version: 1,
};

export const FAIL_STEP: StepKind = {
  kind: 'step',
  migrations: [],
  name: 'acme:fail',
  run: () => ({ kind: 'reject', reason: 'acme:failed' }),
  version: 1,
};

export const ACT: CommandKind = {
  kind: 'command',
  name: 'acme:act',
  plan: () => ({ kind: 'steps', steps: [mark('acted'), { params: {}, type: 'acme:ask' }, mark('after')] }),
  schema: { type: 'object' },
};

export const GAMBLE: CommandKind = {
  kind: 'command',
  name: 'acme:gamble',
  plan: () => ({
    kind: 'steps',
    steps: [
      spendActionsDraft({ spent: { 'core:action': 1 }, unit: 'archers-1' }),
      { params: {}, type: 'acme:ask' },
      { params: {}, type: 'acme:fail' },
    ],
  }),
  schema: { type: 'object' },
};

export const EXTENSIONS: readonly KernelExtension[] = [COMPASS, MARK_STEP, ASK_STEP, FAIL_STEP, ACT, GAMBLE];

export const KERNEL: Kernel = kernelWith(ORDER, SIDES, BRACE);

export const RULESET: Ruleset = {
  healthAttribute: 'core:health',
  mechanics: { 'kernel:turn-order': { variant: 'acme:in-order' } },
  name: 'demo:duel',
  randomSources: {},
  rounding: 'down',
  turn: {
    actions: ['core:action'],
    endTurn: true,
    movement: { actions: { 'core:action': 1 }, points: 'core:speed' },
  },
  turnOwner: 'unit',
};

export const SCENARIO: Scenario = {
  extensions: {},
  field: {
    hazards: [{ cells: ['2,2'], effects: ['demo:burn'], id: 'embers', visibleTo: 'all' }],
    obstacles: [{ cells: ['2,0'], id: 'rock-1', obstacle: 'demo:rock' }],
    params: { height: 3, width: 5 },
    topology: 'acme:grid',
  },
  name: 'demo:duel',
  outcomes: [
    {
      condition: node('kernel:compare', {
        left: node('kernel:units-alive', { side: 'defender' }),
        operator: '=',
        right: 0,
      }),
      id: 'rout',
      outcome: 'victory',
      side: 'attacker',
    },
    {
      condition: node('kernel:compare', { left: node('kernel:round'), operator: '>', right: 9 }),
      id: 'stalemate',
      outcome: 'draw',
    },
  ],
  ruleset: 'demo:duel',
  sides: [
    {
      abilities: [],
      deploymentZone: ['0,0', '0,1', '0,2'],
      effects: ['demo:blessing'],
      id: 'attacker',
      units: [{
        count: 10,
        creature: 'demo:archer',
        effects: [],
        id: 'archers-1',
        items: [{ count: 7, item: 'demo:arrow' }, { charges: 1, count: 1, item: 'demo:wand', slot: 'hands' }],
        visibleTo: 'all',
      }],
    },
    {
      abilities: [],
      deploymentZone: ['4,0', '4,1', '4,2'],
      effects: [],
      id: 'defender',
      units: [{
        cell: '4,1',
        count: 20,
        creature: 'demo:pikeman',
        effects: ['demo:poison'],
        id: 'pikemen-1',
        items: [],
        visibleTo: 'all',
      }],
    },
  ],
  triggers: [
    {
      id: 'moved',
      on: 'kernel:unit-moved',
      ops: [node('kernel:set-variable', { value: true, variable: 'moved' })],
      priority: 0,
    },
    {
      condition: node('kernel:compare', { left: node('kernel:round'), operator: '=', right: 2 }),
      id: 'second-round',
      limit: 1,
      on: 'kernel:round-start',
      ops: [node('kernel:set-variable', { value: true, variable: 'second-round' })],
      priority: 0,
    },
    {
      id: 'turn',
      on: 'kernel:turn-start',
      ops: [node('kernel:set-variable', { value: 'first', variable: 'order' })],
      priority: 0,
    },
    {
      id: 'turn-later',
      on: 'kernel:turn-start',
      ops: [node('kernel:set-variable', { value: 'second', variable: 'order' })],
      priority: 5,
    },
  ],
  variables: { moved: false },
};

export const CONTENT: ContentRegistry = {
  abilities: {},
  attributes: {
    'core:action': { name: 'core:action' },
    'core:health': { min: 1, name: 'core:health' },
    'core:speed': { name: 'core:speed' },
    'demo:mana': { min: 0, name: 'demo:mana' },
  },
  battlefields: {},
  contentHash: 'b'.repeat(64),
  creatures: {
    'demo:archer': creature('demo:archer', {
      attributes: { 'core:action': 1, 'core:health': 10, 'core:speed': 3, 'demo:mana': 5 },
      resources: {
        'demo:fury': { initial: 'empty', limit: 'demo:mana', restore: 'battle' },
        'demo:mana': { initial: 'full', limit: 'demo:mana' },
      },
    }),
    'demo:pikeman': creature('demo:pikeman', {
      attributes: { 'core:action': 1, 'core:health': 10, 'core:speed': 2 },
    }),
  },
  effects: Object.fromEntries([
    effect('demo:blessing', {
      duration: { kind: 'battle' },
      modifiers: [{ attribute: 'core:speed', operation: 'add', value: 1 }],
    }),
    effect('demo:burn', { duration: { kind: 'battle' } }),
    effect('demo:ward', {
      duration: { count: 1, kind: 'turns', tick: 'holder-turn-start' },
      onTurn: [node('kernel:set-variable', { value: true, variable: 'warded' })],
    }),
    effect('demo:vitality', {
      duration: { kind: 'battle' },
      modifiers: [
        { attribute: 'core:health', operation: 'add', value: 5 },
        { attribute: 'demo:mana', operation: 'add', value: 5 },
      ],
    }),
    effect('demo:fragile', {
      activeWhile: node('kernel:variable-is', { value: true, variable: 'moved' }),
      duration: { kind: 'battle' },
    }),
    effect('demo:trap', {
      duration: { kind: 'battle' },
      triggers: [{
        on: 'kernel:effect-changed',
        ops: [node('kernel:damage', { amount: 1000, to: 'self' })],
        priority: 0,
      }],
    }),
    effect('demo:poison', {
      duration: { count: 2, kind: 'turns', tick: 'holder-turn-start' },
      onTurn: [node('kernel:damage', { amount: 1, to: 'self' })],
    }),
    effect('demo:steady', { duration: { count: 3, kind: 'turns', tick: 'holder-turn-end' } }),
    effect('demo:dazed', {
      duration: { count: 1, kind: 'rounds', tick: 'round-end' },
      modifiers: [{ attribute: 'core:action', operation: 'add', value: -1 }],
    }),
    effect('demo:frozen', {
      duration: { kind: 'battle' },
      modifiers: [{ attribute: 'core:action', operation: 'add', value: -1 }],
    }),
  ].map((one: Effect) => [one.name, one])),
  items: {
    'demo:arrow': { abilities: [], consumedOnUse: true, effects: [], name: 'demo:arrow', stack: 5, tags: [] },
    'demo:wand': {
      abilities: [],
      charges: 3,
      consumedOnUse: false,
      effects: [],
      name: 'demo:wand',
      slot: 'hands',
      stack: 1,
      tags: [],
    },
  },
  obstacles: { 'demo:rock': { blocksMovement: true, blocksSight: true, name: 'demo:rock', tags: [] } },
  packs: [{ name: 'demo', version: '1.0.0' }],
  rulesets: { 'demo:duel': RULESET },
  scenarios: { 'demo:duel': SCENARIO },
  tags: [],
};

export const CREATED: BattleState = KERNEL.createState({ scenario: 'demo:duel' }, CONTENT);

export const PLACED: BattleState = played(
  CREATED,
  place('archers-1', '0,1'),
  { kind: 'game', side: 'attacker', type: 'finish-deployment' },
);

export function variant(name: string, change: Partial<TurnOrderVariant>): TurnOrderVariant {
  return { ...ORDER, ...change, name };
}

export function value<Value>(found: Value): { readonly kind: 'value'; readonly value: Value } {
  return { kind: 'value', value: found };
}

export function finish(): GameCommand {
  return { kind: 'game', side: 'attacker', type: 'finish-deployment' };
}

export function startWith(kernel: Kernel, content: ContentRegistry): BattleState {
  const created = kernel.createState({ scenario: 'demo:duel' }, content);
  const placed = play(created, place('archers-1', '0,1'), content, kernel).state;

  return play(placed, finish(), content, kernel).state;
}

export function battleWith(
  order: TurnOrderVariant,
  change: Partial<Scenario> = {},
  ruleset: Partial<Ruleset> = {},
): { readonly content: ContentRegistry; readonly kernel: Kernel; readonly state: BattleState } {
  const kernel = kernelWith(order, BRACE);
  const mechanics = { ...RULESET.mechanics, ...ruleset.mechanics, 'kernel:turn-order': { variant: order.name } };
  const content = withScenario(change, { ...ruleset, mechanics });

  return { content, kernel, state: startWith(kernel, content) };
}

export function withArchers(effects: readonly string[]): Partial<Scenario> {
  return {
    sides: SCENARIO.sides.map((side) => (side.id === 'attacker'
      ? { ...side, units: side.units.map((unit) => ({ ...unit, effects })) }
      : side)),
  };
}

export function kernelWith(...variants: readonly KernelExtension[]): Kernel {
  return createKernel({ extensions: [...EXTENSIONS, ...variants] });
}

export function mark(variable: string, value: boolean | number | string = true): StepDraft {
  return { params: { value, variable }, type: 'acme:mark' };
}

export function place(unit: string, cell: string, facing?: string): GameCommand {
  return { cell, kind: 'game', type: 'place-unit', unit, ...(facing === undefined ? {} : { facing }) };
}

export function move(unit: string, to: string, facing?: string): GameCommand {
  return { kind: 'game', to, type: 'move', unit, ...(facing === undefined ? {} : { facing }) };
}

export function endTurn(unit: string): GameCommand {
  return { kind: 'game', type: 'end-turn', unit };
}

export function play(
  state: BattleState,
  command: Command,
  content: ContentRegistry = CONTENT,
  kernel: Kernel = KERNEL,
): ExecuteAccepted {
  return accepted(kernel.execute(state, command, content));
}

export function played(state: BattleState, ...commands: readonly Command[]): BattleState {
  return commands.reduce((current, command) => play(current, command).state, state);
}

export function runOn(
  state: BattleState,
  content: ContentRegistry,
  ...drafts: readonly StepDraft[]
): ExecuteAccepted {
  const caches = { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };

  return accepted(runDrafts(KERNEL.registries, caches, state, drafts, content));
}

export function reason(result: ExecuteResult): unknown {
  return result.ok ? undefined : [result.rejection.reason, result.rejection.params];
}

export function withScenario(change: Partial<Scenario>, ruleset: Partial<Ruleset> = {}): ContentRegistry {
  return {
    ...CONTENT,
    rulesets: { 'demo:duel': { ...RULESET, ...ruleset } },
    scenarios: { 'demo:duel': { ...SCENARIO, ...change } },
  };
}

function creature(name: string, extra: Partial<Creature>): Creature {
  return {
    abilities: [],
    attributes: {},
    effects: [],
    movement: 'walk',
    name,
    resources: {},
    size: 1,
    tags: [],
    ...extra,
  };
}
