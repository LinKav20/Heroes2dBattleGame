import { describe, expect, it } from 'vitest';
import { createKernel } from '../../kernel/index.ts';
import type { AppliedEffect, BattleState, InventoryItem, Unit } from '../../model/index.ts';
import { KERNEL_EVENT_KINDS, summonedUnitId, type KernelEventPayloads, type KernelEventType } from '../index.ts';
import { deepFreeze, FROZEN_STATE, kernelEvent } from './helpers.ts';

describe('events of the kernel', () => {
  it('are registered by the kernel itself, with version 1 and without migrations', () => {
    const { events } = createKernel({ extensions: [] }).registries;

    expect(events.extensions.map(({ name }) => name)).toStrictEqual(KERNEL_EVENT_KINDS.map(({ name }) => name));
    expect(KERNEL_EVENT_KINDS.every(({ migrations, version }) => version === 1 && migrations.length === 0)).toBe(true);
  });

  it('cover every kind of the payload table', () => {
    const names = Object.keys(PAYLOADS).sort((left, right) => (left < right ? -1 : 1));

    expect(KERNEL_EVENT_KINDS.map(({ name }) => name)).toStrictEqual(names);
  });

  it.each(Object.keys(PAYLOADS))('%s changes no input', (type) => {
    const state = type === 'kernel:input-requested' ? WITHOUT_REQUEST : FROZEN_STATE;

    expect(() => applyKernel(type, state)).not.toThrow();
  });

  it('kernel:phase-changed sets the round and the phase', () => {
    const next = apply('kernel:phase-changed', { phase: { kind: 'round-start' }, round: 2 });

    expect(next.round).toBe(2);
    expect(next.phase).toStrictEqual({ kind: 'round-start' });
  });

  it('kernel:input-requested opens a request with the next identifier', () => {
    const closed = apply('kernel:input-closed', { request: 7 });
    const next = KERNEL.apply(closed, kernelEvent('kernel:input-requested', { request: { ...REQUEST, id: 8 } }));

    expect(next.inputRequest).toStrictEqual({ ...REQUEST, id: 8 });
    expect(next.nextId).toBe(9);
  });

  it('kernel:input-requested rejects a second open request and a wrong identifier', () => {
    const closed = apply('kernel:input-closed', { request: 7 });

    expect(() => apply('kernel:input-requested', { request: { ...REQUEST, id: 8 } })).toThrow('is still open');

    expect(() => KERNEL.apply(closed, kernelEvent('kernel:input-requested', { request: { ...REQUEST, id: 9 } })))
      .toThrow('The next identifier is 8, but the event uses 9.');
  });

  it('kernel:input-closed removes the open request and only it', () => {
    const next = apply('kernel:input-closed', { request: 7 });

    expect('inputRequest' in next).toBe(false);
    expect(() => apply('kernel:input-closed', { request: 6 })).toThrow('The input request 6 is not open.');
  });

  it('kernel:steps-saved replaces the stack of steps', () => {
    const steps = [{ params: {}, type: 'acme-frost:strike', version: 2 }];

    expect(apply('kernel:steps-saved', { steps }).steps).toBe(steps);
    expect(apply('kernel:steps-saved', { steps: [] }).steps).toStrictEqual([]);
  });

  it('kernel:roll-made moves the counter of the generator forward only', () => {
    const external = apply('kernel:roll-made', { result: 17, source: 'external', value: 'core:attack-roll' });
    const generated = apply('kernel:roll-made', { counter: 15, result: 4, source: 'generator', value: 'core:damage' });

    expect(external).toBe(FROZEN_STATE);
    expect(generated.rng).toStrictEqual({ counter: 15, seed: '0'.repeat(64) });

    expect(() => apply('kernel:roll-made', { counter: 12, result: 4, source: 'generator', value: 'core:damage' }))
      .toThrow('cannot go back from 12');
  });

  it('kernel:roll-made needs a generator for a roll of the generator', () => {
    const { rng: removed, ...withoutRng } = FROZEN_STATE;
    const event = kernelEvent('kernel:roll-made', { counter: 1, result: 4, source: 'generator', value: 'core:damage' });

    expect(removed).toBeDefined();
    expect(() => KERNEL.apply(withoutRng, event)).toThrow('The battle has no random number generator.');
  });

  it('kernel:unit-placed and kernel:unit-moved put the unit into a cell and keep its direction unless given', () => {
    const placed = apply('kernel:unit-placed', { cell: '0,1', unit: 'archers-1' });
    const moved = apply('kernel:unit-moved', { facing: 'west', path: ['2,5', '3,5'], unit: 'archers-1' });

    expect(unitOf(placed, 'archers-1')).toMatchObject({ cell: '0,1' });
    expect(unitOf(placed, 'archers-1').facing).toBeUndefined();
    expect(unitOf(moved, 'archers-1')).toMatchObject({ cell: '3,5', facing: 'west' });
    expect(() => apply('kernel:unit-moved', { path: [], unit: 'archers-1' })).toThrow('is empty');
  });

  it('kernel:health-changed, :resource-changed, :flags-changed and :tags-changed set unit values', () => {
    const health = apply('kernel:health-changed', { count: 4, health: 2, unit: 'pikemen-1' });
    const mana = apply('kernel:resource-changed', { resource: 'demo:mana', unit: 'archers-1', value: 0 });
    const flags = apply('kernel:flags-changed', { flags: [], unit: 'archers-1' });
    const tags = apply('kernel:tags-changed', { tags: { 'Creature.Human': 1 }, unit: 'archers-1' });

    expect(unitOf(health, 'pikemen-1')).toMatchObject({ count: 4, health: 2 });
    expect(unitOf(mana, 'archers-1').resources).toStrictEqual({ 'demo:mana': 0 });
    expect(unitOf(flags, 'archers-1').flags).toStrictEqual([]);
    expect(unitOf(tags, 'archers-1').tags).toStrictEqual({ 'Creature.Human': 1 });

    expect(() => apply('kernel:health-changed', { count: 1, health: 1, unit: 'ghosts-1' }))
      .toThrow('The battle has no unit "ghosts-1".');
  });

  it('kernel:effect-applied, kernel:effect-changed and kernel:effect-removed work on every holder', () => {
    const effect: AppliedEffect = { ...POISON, id: 8 };
    const holders = [
      { kind: 'unit', unit: 'pikemen-1' },
      { kind: 'side', side: 'defender' },
      { kind: 'field' },
      { hazard: 'swamp', kind: 'hazard' },
    ] as const;

    for (const holder of holders) {
      const applied = apply('kernel:effect-applied', { effect, holder });
      const change = kernelEvent('kernel:effect-changed', { effect: { ...effect, stacks: 2 }, holder });
      const changed = KERNEL.apply(applied, change);
      const removed = KERNEL.apply(changed, kernelEvent('kernel:effect-removed', { effect: 8, holder }));

      expect(applied.nextId).toBe(9);
      expect(effectsOf(changed, holder.kind)).toContainEqual({ ...effect, stacks: 2 });
      expect(effectsOf(removed, holder.kind)).not.toContainEqual(expect.objectContaining({ id: 8 }));
    }
  });

  it('kernel:effect-changed and kernel:effect-removed need an existing applied effect', () => {
    const holder = { kind: 'unit', unit: 'archers-1' } as const;

    expect(() => apply('kernel:effect-changed', { effect: { ...POISON, id: 99 }, holder }))
      .toThrow('There is no applied effect 99.');

    expect(() => apply('kernel:effect-removed', { effect: 99, holder })).toThrow('There is no applied effect 99.');

    expect(() => apply('kernel:effect-applied', { effect: { ...POISON, id: 9 }, holder }))
      .toThrow('The next identifier is 8, but the event uses 9.');

    expect(() => apply('kernel:effect-applied', { effect: POISON, holder: { hazard: 'lava', kind: 'hazard' } }))
      .toThrow('The field has no hazard zone "lava".');
  });

  it('kernel:item-added, kernel:item-changed and kernel:item-removed change the inventory', () => {
    const potion: InventoryItem = { count: 1, id: 8, item: 'demo:healing-potion' };
    const added = apply('kernel:item-added', { item: potion, unit: 'pikemen-1' });
    const change = kernelEvent('kernel:item-changed', { item: { ...potion, count: 2 }, unit: 'pikemen-1' });
    const changed = KERNEL.apply(added, change);
    const removed = KERNEL.apply(changed, kernelEvent('kernel:item-removed', { item: 8, unit: 'pikemen-1' }));

    expect(unitOf(changed, 'pikemen-1').inventory).toStrictEqual([{ ...potion, count: 2 }]);
    expect(unitOf(removed, 'pikemen-1').inventory).toStrictEqual([]);
    expect(removed.nextId).toBe(9);
  });

  it('kernel:ability-used replaces the use of the same ability or adds a new one', () => {
    const use = { ability: 'demo:fire-arrow', battle: 2, cooldown: 2, round: 1, turn: 1 };
    const unit = apply('kernel:ability-used', { holder: { kind: 'unit', unit: 'archers-1' }, use });
    const side = apply('kernel:ability-used', { holder: { kind: 'side', side: 'defender' }, use });

    expect(unitOf(unit, 'archers-1').abilityUses).toStrictEqual([use]);
    expect(side.sides[1]?.abilityUses).toStrictEqual([use]);
  });

  it('kernel:unit-summoned adds a unit named after the next identifier', () => {
    const summoned: Unit = { ...unitOf(FROZEN_STATE, 'pikemen-1'), id: summonedUnitId(8), summoned: true };
    const next = apply('kernel:unit-summoned', { unit: summoned });

    expect(summonedUnitId(8)).toBe('#8');
    expect(next.units.at(-1)).toBe(summoned);
    expect(next.nextId).toBe(9);
    expect(() => apply('kernel:unit-summoned', { unit: { ...summoned, id: 'wolves-1' } })).toThrow('like "#7"');

    expect(() => apply('kernel:unit-summoned', { unit: { ...summoned, id: '#9' } }))
      .toThrow('The next identifier is 8');
  });

  it('kernel:variable-set and kernel:trigger-fired change the scenario state', () => {
    const variable = apply('kernel:variable-set', { value: true, variable: 'reinforcements-arrived' });
    const trigger = apply('kernel:trigger-fired', { fired: 1, trigger: 'reinforcements' });

    expect(variable.variables).toStrictEqual({ 'reinforcements-arrived': true });
    expect(trigger.triggers).toStrictEqual({ reinforcements: { fired: 1 } });
  });

  it('kernel:hazard-added and kernel:hazard-removed change the hazard zones', () => {
    const added = apply('kernel:hazard-added', { cells: ['6,6'], hazard: 'fire-wall', visibleTo: 'all' });
    const removed = KERNEL.apply(added, kernelEvent('kernel:hazard-removed', { hazard: 'swamp' }));

    expect(added.field.hazards.at(-1))
      .toStrictEqual({ cells: ['6,6'], effects: [], id: 'fire-wall', visibleTo: 'all' });

    expect(removed.field.hazards.map(({ id }) => id)).toStrictEqual(['fire-wall']);
    expect(() => apply('kernel:hazard-added', { cells: [], hazard: 'swamp', visibleTo: 'all' })).toThrow('already has');
    expect(() => apply('kernel:hazard-removed', { hazard: 'lava' })).toThrow('has no hazard zone "lava"');
  });

  it('kernel:battle-ended ends the battle, empties the stack and closes the request', () => {
    const outcome = { kind: 'victory', side: 'attacker', winners: ['attacker'] } as const;
    const next = apply('kernel:battle-ended', { outcome });

    expect(next.phase).toStrictEqual({ kind: 'ended', outcome });
    expect(next.steps).toStrictEqual([]);
    expect('inputRequest' in next).toBe(false);
  });
});

const KERNEL = createKernel({ extensions: [] });

const WITHOUT_REQUEST = deepFreeze(KERNEL.apply(FROZEN_STATE, kernelEvent('kernel:input-closed', { request: 7 })));

const REQUEST = { dice: 1, id: 7, kind: 'roll', sides: 20, value: 'core:morale' } as const;

const POISON: AppliedEffect = { active: true, effect: 'core:poison', id: 8, params: {}, stacks: 1, visibleTo: 'all' };

const PAYLOADS: { readonly [Type in KernelEventType]: KernelEventPayloads[Type] } = {
  'kernel:ability-used': {
    holder: { kind: 'unit', unit: 'archers-1' },
    use: { ability: 'demo:fire-arrow', battle: 2, cooldown: 2, round: 2, turn: 1 },
  },
  'kernel:battle-ended': { outcome: { kind: 'draw', winners: [] } },
  'kernel:effect-applied': { effect: POISON, holder: { kind: 'field' } },
  'kernel:effect-changed': { effect: { ...POISON, id: 3 }, holder: { kind: 'unit', unit: 'archers-1' } },
  'kernel:effect-removed': { effect: 3, holder: { kind: 'unit', unit: 'archers-1' } },
  'kernel:flags-changed': { flags: [], unit: 'archers-1' },
  'kernel:hazard-added': { cells: ['6,6'], hazard: 'fire-wall', visibleTo: 'all' },
  'kernel:hazard-removed': { hazard: 'swamp' },
  'kernel:health-changed': { count: 1, health: 1, unit: 'archers-1' },
  'kernel:input-closed': { request: 7 },
  'kernel:input-requested': { request: { ...REQUEST, id: 8 } },
  'kernel:item-added': { item: { count: 1, id: 8, item: 'demo:healing-potion' }, unit: 'pikemen-1' },
  'kernel:item-changed': { item: { count: 1, id: 4, item: 'demo:healing-potion' }, unit: 'archers-1' },
  'kernel:item-removed': { item: 4, unit: 'archers-1' },
  'kernel:phase-changed': { phase: { kind: 'round-start' }, round: 2 },
  'kernel:resource-changed': { resource: 'demo:mana', unit: 'archers-1', value: 1 },
  'kernel:roll-made': { counter: 13, result: 3, source: 'generator', value: 'core:damage' },
  'kernel:steps-saved': { steps: [] },
  'kernel:tags-changed': { tags: {}, unit: 'archers-1' },
  'kernel:trigger-fired': { fired: 1, trigger: 'reinforcements' },
  'kernel:unit-moved': { path: ['2,5'], unit: 'archers-1' },
  'kernel:unit-placed': { cell: '0,0', unit: 'archers-1' },
  'kernel:unit-summoned': {
    unit: {
      abilityUses: [],
      count: 3,
      creature: 'demo:pikeman',
      effects: [],
      flags: [],
      health: 10,
      id: '#8',
      inventory: [],
      resources: {},
      side: 'defender',
      summoned: true,
      tags: {},
      visibleTo: 'all',
    },
  },
  'kernel:variable-set': { value: 3, variable: 'waves' },
};

function apply<Type extends KernelEventType>(type: Type, payload: KernelEventPayloads[Type]): BattleState {
  return KERNEL.apply(FROZEN_STATE, kernelEvent(type, payload));
}

function applyKernel(type: string, state: BattleState): BattleState {
  const kind = KERNEL_EVENT_KINDS.find(({ name }) => name === type);
  const payload: unknown = Object.entries(PAYLOADS).find(([name]) => name === type)?.[1];

  if (kind === undefined) throw new Error(`No kind ${type}`);

  return KERNEL.apply(state, { id: 0, payload, type, version: kind.version, visibleTo: 'all' });
}

function unitOf(state: BattleState, id: string): Unit {
  const unit = state.units.find((current) => current.id === id);

  if (unit === undefined) throw new Error(`No unit ${id}`);

  return unit;
}

function effectsOf(state: BattleState, holder: 'field' | 'hazard' | 'side' | 'unit'): readonly AppliedEffect[] {
  switch (holder) {
    case 'field': {
      return state.field.effects;
    }

    case 'hazard': {
      return state.field.hazards[0]?.effects ?? [];
    }

    case 'side': {
      return state.sides[1]?.effects ?? [];
    }

    case 'unit': {
      return unitOf(state, 'pikemen-1').effects;
    }

    default: {
      return [];
    }
  }
}
