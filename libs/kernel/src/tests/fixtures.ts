import type { ContentRegistry, Ruleset } from '../content/index.ts';
import type { ExtensionEventKind, StepKind } from '../extensions/index.ts';
import type { BattleEvent, BattleState } from '../model/index.ts';

export const RULESET: Ruleset = {
  healthAttribute: 'core:health',
  mechanics: {
    'kernel:turn-order': { params: { waiting: true }, variant: 'rules-stdlib:speed-with-waiting' },
  },
  name: 'core:stacks-speed',
  randomSources: { 'core:damage-roll': 'generator', 'core:morale': 'external' },
  rounding: 'down',
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
      ops: [{ amount: { count: 2, sides: 6, type: 'kernel:dice' }, type: 'rules-stdlib:damage' }],
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
      endsOn: [{ condition: { type: 'kernel:is-holder' }, on: 'kernel:unit-healed' }],
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
        topology: 'rules-stdlib:hex',
      },
      name: 'demo:bridge',
      outcomes: [
        {
          condition: { side: 'defender', type: 'kernel:side-destroyed' },
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
          condition: { round: 3, type: 'kernel:round-is' },
          id: 'reinforcements',
          limit: 1,
          on: 'kernel:round-started',
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
    topology: 'rules-stdlib:hex',
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
  units: [
    {
      abilityUses: [{ ability: 'demo:fire-arrow', battle: 1, cooldown: 1, round: 1, turn: 1 }],
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
      summoned: false,
      tags: { 'Creature.Human': 1, 'Debuff.Poison': 1 },
      visibleTo: 'all',
    },
    {
      abilityUses: [],
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
      summoned: false,
      tags: { 'Creature.Human': 1 },
      visibleTo: ['defender'],
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

export function deepFreeze<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((member: unknown) => deepFreeze(member));
    Object.freeze(value);
  }

  return value;
}

export function event(type: string, payload: unknown, version = 1): BattleEvent {
  return { id: 0, payload, type, version, visibleTo: 'all' };
}

export function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};
}
