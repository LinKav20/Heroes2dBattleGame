import type { ContentRegistry, Ruleset } from '../../content/index.ts';
import type { JsonArray, JsonObject, JsonValue } from '../../json/index.ts';
import type { BattleState, Command, InputValue, StateEdit } from '../index.ts';

export type IsJson<T> = 0 extends 1 & T
  ? false
  : [T] extends [object]
      ? [keyof T] extends [never]
          ? false
          : IsJsonValue<T>
      : IsJsonValue<T>;

export type CommandKind = Command extends infer Kind
  ? Kind extends { readonly kind: 'game'; readonly type: infer Type extends string }
    ? `game:${Type}`
    : Kind extends { readonly kind: 'answer' }
      ? `answer:${InputValue['kind']}`
      : Kind extends { readonly kind: 'edit' }
        ? `edit:${StateEdit['type']}`
        : never
  : never;

type IsJsonValue<T> = true extends Same<T, JsonArray> | Same<T, JsonObject> | Same<T, JsonValue>
  ? true
  : T extends boolean | number | string
    ? true
    : T extends ReadonlyArray<infer Item>
      ? IsJson<Item>
      : T extends (...args: never[]) => unknown
        ? false
        : T extends object
          ? false extends { [Key in keyof T]-?: IsJson<Required<T>[Key]> }[keyof T]
            ? false
            : true
          : false;

type Same<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;

export const COMMAND_KINDS: Readonly<Record<CommandKind, true>> = {
  'answer:choice': true,
  'answer:roll': true,
  'answer:target': true,
  'edit:apply-effect': true,
  'edit:move-unit': true,
  'edit:remove-effect': true,
  'edit:set-health': true,
  'edit:set-resource': true,
  'game:attack': true,
  'game:defend': true,
  'game:end-turn': true,
  'game:extension': true,
  'game:finish-deployment': true,
  'game:move': true,
  'game:place-unit': true,
  'game:retreat': true,
  'game:shoot': true,
  'game:surrender': true,
  'game:use-ability': true,
  'game:use-item': true,
  'game:wait': true,
};

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
  format: { extensions: { 'rules-stdlib:siege': 1 }, kernel: 1 },
  inputRequest: {
    dice: 1,
    id: 7,
    kind: 'roll',
    side: 'attacker',
    sides: 20,
    unit: 'archers-1',
    value: 'core:morale',
  },
  nextId: 8,
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

export const COMMANDS: readonly Command[] = [
  { cell: '0,0', facing: 'east', kind: 'game', type: 'place-unit', unit: 'archers-1' },
  { kind: 'game', side: 'attacker', type: 'finish-deployment' },
  { facing: 'east', kind: 'game', to: '3,5', type: 'move', unit: 'archers-1' },
  { facing: 'east', from: '13,5', kind: 'game', target: 'pikemen-1', type: 'attack', unit: 'archers-1' },
  { kind: 'game', target: 'pikemen-1', type: 'shoot', unit: 'archers-1' },
  {
    ability: 'demo:fire-arrow',
    kind: 'game',
    targets: [{ kind: 'unit', unit: 'pikemen-1' }],
    type: 'use-ability',
    unit: 'archers-1',
  },
  {
    ability: 'demo:drink',
    item: 4,
    kind: 'game',
    targets: [{ kind: 'unit', unit: 'archers-1' }],
    type: 'use-item',
    unit: 'archers-1',
  },
  { kind: 'game', type: 'wait', unit: 'archers-1' },
  { kind: 'game', type: 'defend', unit: 'archers-1' },
  { kind: 'game', type: 'end-turn', unit: 'archers-1' },
  { kind: 'game', side: 'attacker', type: 'retreat' },
  { kind: 'game', side: 'attacker', type: 'surrender' },
  { kind: 'game', name: 'acme-frost:freeze', payload: { unit: 'pikemen-1' }, type: 'extension' },
  { kind: 'answer', request: 7, value: { dice: [17], kind: 'roll' } },
  { kind: 'answer', request: 7, value: { kind: 'choice', option: 'flee' } },
  { kind: 'answer', request: 7, value: { kind: 'target', targets: [{ cell: '2,2', kind: 'cell' }] } },
  { edit: { count: 3, health: 5, type: 'set-health', unit: 'archers-1' }, kind: 'edit' },
  { edit: { resource: 'demo:mana', type: 'set-resource', unit: 'archers-1', value: 0 }, kind: 'edit' },
  {
    edit: { effect: 'core:poison', params: {}, target: { kind: 'side', side: 'attacker' }, type: 'apply-effect' },
    kind: 'edit',
  },
  { edit: { effect: 3, target: { kind: 'unit', unit: 'archers-1' }, type: 'remove-effect' }, kind: 'edit' },
  { edit: { cell: '4,4', facing: 'west', type: 'move-unit', unit: 'archers-1' }, kind: 'edit' },
];

export function commandKind(command: Command): string {
  switch (command.kind) {
    case 'answer': {
      return `answer:${command.value.kind}`;
    }

    case 'edit': {
      return `edit:${command.edit.type}`;
    }

    case 'game': {
      return `game:${command.type}`;
    }

    default: {
      return 'unknown';
    }
  }
}
