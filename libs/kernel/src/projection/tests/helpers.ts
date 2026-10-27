import type { ContentRegistry } from '../../content/index.ts';
import type { ExtensionEventKind } from '../../extensions/index.ts';
import type { Visibility } from '../../ids/index.ts';
import type { JsonValue } from '../../json/index.ts';
import type { Kernel } from '../../kernel/index.ts';
import type { BattleEvent, BattleState, Unit } from '../../model/index.ts';

export const FULL: Visibility = { kind: 'full' };

export const ATTACKER: Visibility = { kind: 'sides', sides: ['attacker'] };

export const DEFENDER: Visibility = { kind: 'sides', sides: ['defender'] };

export const BOTH: Visibility = { kind: 'sides', sides: ['attacker', 'defender'] };

export const NOBODY: Visibility = { kind: 'sides', sides: [] };

export function event(
  id: number,
  type: string,
  payload: unknown,
  visibleTo: BattleEvent['visibleTo'] = 'all',
): BattleEvent {
  return { id, payload, type, version: 1, visibleTo };
}

export function hiddenEvent(id: number, payload: object): BattleEvent {
  return event(id, 'kernel:hidden', payload);
}

export function dataChanged(id: number, changed: object, removed: readonly string[]): BattleEvent {
  return event(id, 'kernel:data-changed', { changed, removed });
}

export function packageEventKind(
  name: string,
  apply: ExtensionEventKind<JsonValue>['apply'],
  data?: ExtensionEventKind<JsonValue>['data'],
): ExtensionEventKind<JsonValue> {
  return {
    apply,
    kind: 'event',
    migrations: [],
    name,
    schema: { type: 'object' },
    version: 1,
    ...(data === undefined ? {} : { data }),
  };
}

export function replayed(
  kernel: Kernel,
  content: ContentRegistry,
  before: BattleState,
  events: readonly BattleEvent[],
  visibility: Visibility,
): BattleState {
  return kernel.projectEvents(before, events, content, visibility)
    .reduce((state, one) => kernel.applyEvent(state, one), kernel.project(before, content, visibility));
}

export function placeOf(state: BattleState, unit: string): readonly unknown[] {
  const found = state.units.find(({ id }) => id === unit);

  return [found?.cell, found?.facing];
}

export function summoned(owner: string, visibleTo: Unit['visibleTo'], extra: Partial<Unit> = {}): Unit {
  return {
    abilityUses: [],
    auras: [],
    count: 3,
    creature: 'demo:pikeman',
    effects: [],
    flags: [],
    health: 10,
    id: '#8',
    inventory: [],
    resources: {},
    side: owner,
    spentActions: {},
    startCount: 3,
    summoned: true,
    tags: {},
    visibleTo,
    zones: [],
    ...extra,
  };
}
