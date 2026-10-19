import type { JsonArray, JsonObject, JsonValue } from '../../json/index.ts';
import type { Command, InputValue, StateEdit } from '../index.ts';

export type IsJson<T> = 0 extends 1 & T
  ? false
  : [T] extends [object]
      ? [keyof T] extends [never]
          ? false
          : IsJsonValue<T>
      : IsJsonValue<T>;

export type CommandShape = Command extends infer Kind
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

export const COMMAND_SHAPES: Readonly<Record<CommandShape, true>> = {
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
  'game:start-battle': true,
  'game:surrender': true,
  'game:use-ability': true,
  'game:use-item': true,
  'game:wait': true,
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
  { kind: 'game', type: 'start-battle' },
  { kind: 'game', name: 'acme-frost:freeze', payload: { unit: 'pikemen-1' }, side: 'attacker', type: 'extension' },
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

export function commandShape(command: Command): string {
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
