import { describe, expect, it } from 'vitest';
import { summonedUnitId } from '../../ids/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { AppliedEffect, BattleState, InventoryItem, RollRequest, Unit } from '../../model/index.ts';
import { withoutKey } from '../../shared/index.ts';
import { deepFreeze, event, FROZEN_STATE, unitOf } from '../../tests/fixtures.ts';
import {
  isKernelEvent,
  KERNEL_EVENT_KINDS,
  KERNEL_EVENTS,
  kernelEventDraft,
  type KernelEvent,
  type KernelEventPayloads,
  type KernelEventType,
} from '../index.ts';

describe('events of the kernel', () => {
  it('are registered by the kernel itself, with version 1 and without migrations', () => {
    const { events } = createKernel({ extensions: [] }).registries;

    expect(events.extensions.map(({ name }) => name)).toStrictEqual(KERNEL_EVENT_KINDS.map(({ name }) => name));
    expect(KERNEL_EVENT_KINDS.every(({ migrations, version }) => version === 1 && migrations.length === 0)).toBe(true);
  });

  it('cover every name of the kernel and every kind of the payload table', () => {
    const names = Object.keys(PAYLOADS).sort((left, right) => (left < right ? -1 : 1));

    expect(KERNEL_EVENT_KINDS.map(({ name }) => name)).toStrictEqual(names);
    expect(Object.values(KERNEL_EVENTS).sort((left, right) => (left < right ? -1 : 1))).toStrictEqual(names);
  });

  it.each(Object.keys(PAYLOADS))('%s changes no input', (type) => {
    const state = inputOf(type);

    expect(() => applyKernel(type, state)).not.toThrow();
  });

  it('kernel:phase-changed sets the round and the phase of a battle that goes on', () => {
    const next = apply(KERNEL_EVENTS.phaseChanged, { phase: { kind: 'round-start' }, round: 2 });

    expect(next.round).toBe(2);
    expect(next.phase).toStrictEqual({ kind: 'round-start' });

    const holder = { kind: 'unit', unit: 'archers-1' } as const;
    const ended = apply(KERNEL_EVENTS.turnEnded, { holder, skipped: false, waited: true });
    const sameRound = kernelEvent(KERNEL_EVENTS.phaseChanged, { phase: { kind: 'turn', side: 'defender' }, round: 1 });

    expect(ended.turns).toStrictEqual([{ holder, skipped: false, waited: true }]);
    expect(ended.phase).toStrictEqual({ kind: 'between-turns' });
    expect(KERNEL.applyEvent(ended, sameRound).turns).toStrictEqual([{ holder, skipped: false, waited: true }]);

    const nextRound = kernelEvent(KERNEL_EVENTS.phaseChanged, { phase: { kind: 'round-start' }, round: 2 });

    expect(KERNEL.applyEvent(ended, nextRound).turns)
      .toStrictEqual([]);

    expect(unitOf(apply(KERNEL_EVENTS.unitTurned, { facing: 'west', unit: 'archers-1' }), 'archers-1').facing)
      .toBe('west');

    const restart = kernelEvent(KERNEL_EVENTS.phaseChanged, { phase: { kind: 'round-start' }, round: 2 });

    expect(() => KERNEL.applyEvent(ENDED, restart)).toThrow('The battle is over.');
  });

  it('kernel:input-requested opens a request with the next number of requests', () => {
    const next = KERNEL.applyEvent(WITHOUT_REQUEST, kernelEvent(KERNEL_EVENTS.inputRequested, { request: REQUEST }));

    expect(next.inputRequest).toStrictEqual(REQUEST);
    expect(next.nextRequestId).toBe(9);
    expect(next.nextId).toBe(FROZEN_STATE.nextId);
  });

  it('kernel:input-requested rejects a second open request and a wrong identifier', () => {
    expect(() => apply(KERNEL_EVENTS.inputRequested, { request: REQUEST })).toThrow('is still open');

    const skipped = kernelEvent(KERNEL_EVENTS.inputRequested, { request: { ...REQUEST, id: 9 } });

    expect(() => KERNEL.applyEvent(WITHOUT_REQUEST, skipped))
      .toThrow('The next identifier of an input request is 8, but the event uses 9.');
  });

  it('kernel:input-closed removes the open request and takes back the saved steps', () => {
    const next = apply(KERNEL_EVENTS.inputClosed, { request: 7 });

    expect('inputRequest' in next).toBe(false);
    expect(next.steps).toStrictEqual([]);
    expect(() => apply(KERNEL_EVENTS.inputClosed, { request: 6 })).toThrow('The input request 6 is not open.');
  });

  it('kernel:steps-saved replaces the stack of steps', () => {
    const steps = [{ params: {}, type: 'acme-frost:strike', version: 2 }];

    expect(apply(KERNEL_EVENTS.stepsSaved, { steps }).steps).toBe(steps);
    expect(apply(KERNEL_EVENTS.stepsSaved, { steps: [] }).steps).toStrictEqual([]);
  });

  it('kernel:roll-made moves the counter of the generator forward only', () => {
    const external = apply(KERNEL_EVENTS.rollMade, { name: 'core:attack-roll', result: 17, source: 'external' });
    const roll = { counter: 15, name: 'core:damage', result: 4, source: 'generator' } as const;
    const generated = apply(KERNEL_EVENTS.rollMade, roll);

    expect(external).toBe(FROZEN_STATE);
    expect(generated.rng).toStrictEqual({ counter: 15, seed: '0'.repeat(64) });

    expect(() => apply(KERNEL_EVENTS.rollMade, { counter: 12, name: 'core:damage', result: 4, source: 'generator' }))
      .toThrow('cannot go back from 12');
  });

  it('kernel:roll-made needs a generator for a roll of the generator', () => {
    const { rng: removed, ...withoutRng } = FROZEN_STATE;
    const payload = { counter: 1, name: 'core:damage', result: 4, source: 'generator' } as const;
    const made = kernelEvent(KERNEL_EVENTS.rollMade, payload);

    expect(removed).toBeDefined();
    expect(() => KERNEL.applyEvent(withoutRng, made)).toThrow('The battle has no random number generator.');
  });

  it('kernel:effect-not-applied changes nothing', () => {
    const holder = { kind: 'unit', unit: 'pikemen-1' } as const;
    const payload = { effect: 'core:poison', holder, reason: 'condition' } as const;

    expect(apply(KERNEL_EVENTS.effectNotApplied, payload)).toBe(FROZEN_STATE);
  });

  it('name the unit or the side they are about for reactions of effects', () => {
    const archers = { kind: 'unit', unit: 'archers-1' };

    function target(type: KernelEventType): unknown {
      const payload: unknown = Object.entries(PAYLOADS).find(([name]) => name === type)?.[1];

      return KERNEL.registries.events.get(type)?.target?.(payload);
    }

    expect(target(KERNEL_EVENTS.healthChanged)).toStrictEqual(archers);
    expect(target(KERNEL_EVENTS.itemRemoved)).toStrictEqual(archers);
    expect(target(KERNEL_EVENTS.effectChanged)).toStrictEqual(archers);
    expect(target(KERNEL_EVENTS.unitSummoned)).toStrictEqual({ kind: 'unit', unit: '#8' });
    expect(target(KERNEL_EVENTS.effectApplied)).toBeUndefined();
    expect(target(KERNEL_EVENTS.variableSet)).toBeUndefined();
    expect(target(KERNEL_EVENTS.phaseChanged)).toBeUndefined();

    expect(KERNEL.registries.events.get(KERNEL_EVENTS.phaseChanged)?.target?.({
      phase: { kind: 'turn', side: 'attacker' },
      round: 1,
    })).toStrictEqual({ kind: 'side', side: 'attacker' });

    expect(KERNEL.registries.events.get(KERNEL_EVENTS.battleEnded)).not.toHaveProperty('target');
  });

  it('kernel:command-aborted changes nothing', () => {
    const rejection = { code: 'rule-violation', params: {}, reason: 'acme-duel:failed' } as const;

    expect(apply(KERNEL_EVENTS.commandAborted, { rejection })).toBe(FROZEN_STATE);
  });

  it('kernel:unit-placed and kernel:unit-moved put the unit into a cell and keep its direction unless given', () => {
    const placed = apply(KERNEL_EVENTS.unitPlaced, { cell: '0,1', unit: 'archers-1' });
    const moved = apply(KERNEL_EVENTS.unitMoved, { facing: 'west', path: ['2,5', '3,5'], unit: 'archers-1' });

    expect(unitOf(placed, 'archers-1')).toMatchObject({ cell: '0,1' });
    expect(unitOf(placed, 'archers-1').facing).toBeUndefined();
    expect(unitOf(moved, 'archers-1')).toMatchObject({ cell: '3,5', facing: 'west' });
    expect(() => apply(KERNEL_EVENTS.unitMoved, { path: [], unit: 'archers-1' })).toThrow('is empty');
  });

  it('kernel:health-changed, :resource-changed, :flags-changed and :tags-changed set unit values', () => {
    const health = apply(KERNEL_EVENTS.healthChanged, { count: 4, health: 2, unit: 'pikemen-1' });
    const mana = apply(KERNEL_EVENTS.resourceChanged, { resource: 'demo:mana', unit: 'archers-1', value: 0 });
    const flags = apply(KERNEL_EVENTS.flagsChanged, { flags: [], unit: 'archers-1' });
    const tags = apply(KERNEL_EVENTS.tagsChanged, { added: ['Buff.Haste', 'Buff'], removed: [], unit: 'archers-1' });
    const taken = KERNEL.applyEvent(tags, kernelEvent(KERNEL_EVENTS.tagsChanged, {
      added: ['Buff'],
      removed: ['Buff.Haste', 'Buff'],
      unit: 'archers-1',
    }));

    expect(unitOf(health, 'pikemen-1')).toMatchObject({ count: 4, health: 2 });
    expect(unitOf(mana, 'archers-1').resources).toStrictEqual({ 'demo:mana': 0 });
    expect(unitOf(flags, 'archers-1').flags).toStrictEqual([]);
    expect(unitOf(tags, 'archers-1').tags).toStrictEqual({ Buff: 1, 'Buff.Haste': 1 });
    expect(unitOf(taken, 'archers-1').tags).toStrictEqual({ Buff: 1 });

    expect(() => apply(KERNEL_EVENTS.tagsChanged, { added: [], removed: ['Buff'], unit: 'archers-1' }))
      .toThrow('The tag "Buff" has no source to take back.');

    expect(() => apply(KERNEL_EVENTS.healthChanged, { count: 1, health: 1, unit: 'ghosts-1' }))
      .toThrow('There is no unit "ghosts-1".');
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
      const applied = apply(KERNEL_EVENTS.effectApplied, { effect, holder });
      const change = kernelEvent(KERNEL_EVENTS.effectChanged, { effect: { ...effect, stacks: 2 }, holder });
      const changed = KERNEL.applyEvent(applied, change);
      const removed = KERNEL.applyEvent(changed, kernelEvent(KERNEL_EVENTS.effectRemoved, { effect: 8, holder }));

      expect(applied.nextId).toBe(9);
      expect(effectsOf(changed, holder.kind)).toContainEqual({ ...effect, stacks: 2 });
      expect(effectsOf(removed, holder.kind)).not.toContainEqual(expect.objectContaining({ id: 8 }));
    }
  });

  it('kernel:effect-changed and kernel:effect-removed need an existing applied effect', () => {
    const holder = { kind: 'unit', unit: 'archers-1' } as const;

    expect(() => apply(KERNEL_EVENTS.effectChanged, { effect: { ...POISON, id: 99 }, holder }))
      .toThrow('There is no applied effect 99.');

    expect(() => apply(KERNEL_EVENTS.effectRemoved, { effect: 99, holder })).toThrow('There is no applied effect 99.');

    expect(() => apply(KERNEL_EVENTS.effectApplied, { effect: { ...POISON, id: 9 }, holder }))
      .toThrow('The next identifier is 8, but the event uses 9.');

    expect(() => apply(KERNEL_EVENTS.effectApplied, { effect: POISON, holder: { hazard: 'lava', kind: 'hazard' } }))
      .toThrow('There is no hazard zone "lava".');
  });

  it('kernel:item-added, kernel:item-changed and kernel:item-removed change the inventory', () => {
    const potion: InventoryItem = { count: 1, id: 8, item: 'demo:healing-potion' };
    const added = apply(KERNEL_EVENTS.itemAdded, { item: potion, unit: 'pikemen-1' });
    const change = kernelEvent(KERNEL_EVENTS.itemChanged, { item: { ...potion, count: 2 }, unit: 'pikemen-1' });
    const changed = KERNEL.applyEvent(added, change);
    const removed = KERNEL.applyEvent(changed, kernelEvent(KERNEL_EVENTS.itemRemoved, { item: 8, unit: 'pikemen-1' }));

    expect(unitOf(changed, 'pikemen-1').inventory).toStrictEqual([{ ...potion, count: 2 }]);
    expect(unitOf(removed, 'pikemen-1').inventory).toStrictEqual([]);
    expect(removed.nextId).toBe(9);
  });

  it('kernel:ability-used replaces the use of the same ability or adds a new one', () => {
    const use = { ability: 'demo:fire-arrow', battle: 2, cooldown: 2, round: 1, turn: 1 };
    const unit = apply(KERNEL_EVENTS.abilityUsed, { holder: { kind: 'unit', unit: 'archers-1' }, targets: [], use });
    const side = apply(KERNEL_EVENTS.abilityUsed, { holder: { kind: 'side', side: 'defender' }, targets: [], use });

    expect(unitOf(unit, 'archers-1').abilityUses).toStrictEqual([use]);
    expect(side.sides[1]?.abilityUses).toStrictEqual([use]);
  });

  it('kernel:ability-uses-changed replaces all uses, and kernel:actions-changed the spent actions', () => {
    const uses = [{ ability: 'demo:fire-arrow', battle: 1, cooldown: 0, round: 1, turn: 0 }];
    const unit = apply(KERNEL_EVENTS.abilityUsesChanged, { holder: { kind: 'unit', unit: 'archers-1' }, uses });
    const side = apply(KERNEL_EVENTS.abilityUsesChanged, { holder: { kind: 'side', side: 'defender' }, uses });
    const spent = apply(KERNEL_EVENTS.actionsChanged, { spent: { 'core:action': 1 }, unit: 'archers-1' });

    expect(unitOf(unit, 'archers-1').abilityUses).toStrictEqual(uses);
    expect(side.sides[1]?.abilityUses).toStrictEqual(uses);
    expect(unitOf(spent, 'archers-1').spentActions).toStrictEqual({ 'core:action': 1 });
  });

  it('kernel:auras-changed and kernel:zones-changed add and remove auras and zones and keep them sorted', () => {
    const covered = apply(KERNEL_EVENTS.aurasChanged, { added: ['demo:b', 'demo:a'], removed: [], unit: 'archers-1' });
    const change = { added: ['demo:c'], removed: ['demo:a'], unit: 'archers-1' };
    const moved = KERNEL.applyEvent(covered, kernelEvent(KERNEL_EVENTS.aurasChanged, change));
    const placed = apply(KERNEL_EVENTS.zonesChanged, { added: ['swamp'], removed: [], unit: 'archers-1' });

    expect(unitOf(covered, 'archers-1').auras).toStrictEqual(['demo:a', 'demo:b']);
    expect(unitOf(moved, 'archers-1').auras).toStrictEqual(['demo:b', 'demo:c']);
    expect(unitOf(placed, 'archers-1').zones).toStrictEqual(['swamp']);

    expect(() => apply(KERNEL_EVENTS.zonesChanged, { added: [], removed: ['swamp'], unit: 'archers-1' }))
      .toThrow('lacks one of the zones');

    const again = kernelEvent(KERNEL_EVENTS.aurasChanged, { ...change, added: ['demo:a'], removed: ['demo:b'] });

    expect(() => KERNEL.applyEvent(covered, again))
      .toThrow('already has one of the auras');

    expect(() => apply(KERNEL_EVENTS.aurasChanged, { added: ['demo:a', 'demo:a'], removed: [], unit: 'archers-1' }))
      .toThrow('The auras to add or to remove repeat');

    expect(() => apply(KERNEL_EVENTS.zonesChanged, { added: [], removed: ['swamp', 'swamp'], unit: 'archers-1' }))
      .toThrow('The zones to add or to remove repeat');
  });

  it('kernel:unit-summoned adds a unit named after the next identifier', () => {
    const summoned: Unit = { ...unitOf(FROZEN_STATE, 'pikemen-1'), id: summonedUnitId(8), summoned: true };
    const next = apply(KERNEL_EVENTS.unitSummoned, { unit: summoned });

    expect(summonedUnitId(8)).toBe('#8');
    expect(next.units.at(-1)).toBe(summoned);
    expect(next.nextId).toBe(9);
    expect(() => apply(KERNEL_EVENTS.unitSummoned, { unit: { ...summoned, id: 'wolves-1' } })).toThrow('like "#7"');
    expect(() => apply(KERNEL_EVENTS.unitSummoned, { unit: { ...summoned, id: '#08' } })).toThrow('like "#7"');

    expect(() => apply(KERNEL_EVENTS.unitSummoned, { unit: { ...summoned, id: '#9' } }))
      .toThrow('The next identifier is 8');
  });

  it('kernel:health-changed keeps the count of a unit within the count it started with', () => {
    const full = apply(KERNEL_EVENTS.healthChanged, { count: 20, health: 10, unit: 'pikemen-1' });

    expect(unitOf(full, 'pikemen-1')).toMatchObject({ count: 20, health: 10, startCount: 20 });

    expect(() => apply(KERNEL_EVENTS.healthChanged, { count: 21, health: 10, unit: 'pikemen-1' }))
      .toThrow(new RangeError('The unit "pikemen-1" cannot have more than 20 creatures.'));
  });

  it('kernel:unit-summoned needs a start count that is a whole number of at least the count', () => {
    const summoned: Unit = { ...unitOf(FROZEN_STATE, 'pikemen-1'), id: summonedUnitId(8), summoned: true };
    const error = new RangeError('The summoned unit "#8" needs a start count of at least its count.');

    expect(apply(KERNEL_EVENTS.unitSummoned, { unit: { ...summoned, count: 20, startCount: 20 } }).units.at(-1))
      .toMatchObject({ count: 20, startCount: 20 });

    expect(() => apply(KERNEL_EVENTS.unitSummoned, { unit: { ...summoned, startCount: 19 } })).toThrow(error);
    expect(() => apply(KERNEL_EVENTS.unitSummoned, { unit: { ...summoned, startCount: 20.5 } })).toThrow(error);

    expect(() => apply(KERNEL_EVENTS.unitSummoned, { unit: { ...summoned, startCount: Number.NaN } }))
      .toThrow(error);

    expect(() => apply(KERNEL_EVENTS.unitSummoned, { unit: withoutStartCount(summoned) })).toThrow(error);
  });

  it('kernel:unit-summoned rejects an identifier that a unit already has', () => {
    const twin = { ...unitOf(FROZEN_STATE, 'pikemen-1'), id: '#8' };
    const taken = { ...FROZEN_STATE, units: [...FROZEN_STATE.units, twin] };
    const summoned: Unit = { ...unitOf(FROZEN_STATE, 'pikemen-1'), id: '#8', summoned: true };

    expect(() => KERNEL.applyEvent(taken, kernelEvent(KERNEL_EVENTS.unitSummoned, { unit: summoned })))
      .toThrow('The unit "#8" already exists.');
  });

  it('kernel:variable-set and kernel:trigger-fired change the scenario state', () => {
    const variable = apply(KERNEL_EVENTS.variableSet, { value: true, variable: 'reinforcements-arrived' });
    const trigger = apply(KERNEL_EVENTS.triggerFired, { fired: 1, trigger: 'reinforcements' });

    expect(variable.variables).toStrictEqual({ 'reinforcements-arrived': true });
    expect(trigger.triggers).toStrictEqual({ reinforcements: { fired: 1 } });
  });

  it('kernel:hazard-added and kernel:hazard-removed change the hazard zones', () => {
    const added = apply(KERNEL_EVENTS.hazardAdded, { cells: ['6,6'], hazard: 'fire-wall', visibleTo: 'all' });
    const removed = KERNEL.applyEvent(added, kernelEvent(KERNEL_EVENTS.hazardRemoved, { hazard: 'swamp' }));

    expect(added.field.hazards.at(-1))
      .toStrictEqual({ cells: ['6,6'], effects: [], id: 'fire-wall', visibleTo: 'all' });

    expect(removed.field.hazards.map(({ id }) => id)).toStrictEqual(['fire-wall']);

    const standing = apply(KERNEL_EVENTS.zonesChanged, { added: ['swamp'], removed: [], unit: 'archers-1' });
    const gone = KERNEL.applyEvent(standing, kernelEvent(KERNEL_EVENTS.hazardRemoved, { hazard: 'swamp' }));

    expect(unitOf(gone, 'archers-1').zones).toStrictEqual([]);

    expect(() => apply(KERNEL_EVENTS.hazardAdded, { cells: [], hazard: 'swamp', visibleTo: 'all' }))
      .toThrow('already has');

    expect(() => apply(KERNEL_EVENTS.hazardRemoved, { hazard: 'lava' })).toThrow('There is no hazard zone "lava".');
  });

  it('kernel:battle-ended ends the battle once, empties the stack and closes the request', () => {
    expect(ENDED.phase).toStrictEqual({ kind: 'ended', outcome: OUTCOME });
    expect(ENDED.steps).toStrictEqual([]);
    expect('inputRequest' in ENDED).toBe(false);

    expect(() => KERNEL.applyEvent(ENDED, kernelEvent(KERNEL_EVENTS.battleEnded, { outcome: OUTCOME })))
      .toThrow('The battle is over.');
  });
});

describe('isKernelEvent', () => {
  it('narrows an event of the kernel of the given kind or of any kind', () => {
    const moved = kernelEvent(KERNEL_EVENTS.unitMoved, { path: ['1,1'], unit: 'archers-1' });

    expect(isKernelEvent(moved, KERNEL_EVENTS.unitMoved)).toBe(true);
    expect(isKernelEvent(moved, KERNEL_EVENTS.unitPlaced)).toBe(false);
    expect(isKernelEvent(moved)).toBe(true);
    expect(isKernelEvent(event('acme-frost:frozen', { unit: 'archers-1' }))).toBe(false);
  });

  it('does not take an event of an old version for the current one', () => {
    expect(isKernelEvent({ ...kernelEvent(KERNEL_EVENTS.unitMoved, { path: [], unit: 'a' }), version: 0 })).toBe(false);
  });
});

describe('kernelEventDraft', () => {
  it('gives a step a draft of an event of the kernel', () => {
    expect(kernelEventDraft(KERNEL_EVENTS.variableSet, { value: 1, variable: 'waves' }, 'all')).toStrictEqual({
      payload: { value: 1, variable: 'waves' },
      type: 'kernel:variable-set',
      visibleTo: 'all',
    });
  });
});

const KERNEL = createKernel({ extensions: [] });

const WITHOUT_REQUEST = deepFreeze(
  KERNEL.applyEvent(FROZEN_STATE, kernelEvent(KERNEL_EVENTS.inputClosed, { request: 7 })),
);

const REQUEST: RollRequest = { count: 1, id: 8, kind: 'roll', name: 'core:morale', sides: 20 };

const OUTCOME = { kind: 'victory', side: 'attacker', winners: ['attacker'] } as const;

const PROJECTION: BattleState = deepFreeze({ ...FROZEN_STATE, visibility: { kind: 'full' } });

const ENDED = deepFreeze(KERNEL.applyEvent(FROZEN_STATE, kernelEvent(KERNEL_EVENTS.battleEnded, { outcome: OUTCOME })));

const POISON: AppliedEffect = { active: true, effect: 'core:poison', id: 8, params: {}, stacks: 1, visibleTo: 'all' };

const PAYLOADS: { readonly [Type in KernelEventType]: KernelEventPayloads[Type] } = {
  'kernel:ability-used': {
    holder: { kind: 'unit', unit: 'archers-1' },
    item: 4,
    targets: [{ kind: 'unit', unit: 'pikemen-1' }],
    use: { ability: 'demo:fire-arrow', battle: 2, cooldown: 2, round: 2, turn: 1 },
  },
  'kernel:ability-uses-changed': { holder: { kind: 'side', side: 'attacker' }, uses: [] },
  'kernel:actions-changed': { spent: {}, unit: 'archers-1' },
  'kernel:auras-changed': { added: ['core:poison'], removed: [], unit: 'archers-1' },
  'kernel:battle-ended': { outcome: { kind: 'draw', winners: [] } },
  'kernel:command-aborted': { rejection: { code: 'rule-violation', params: {}, reason: 'acme-duel:failed' } },
  'kernel:data-changed': { changed: { 'acme:data': { level: 2 } }, removed: [] },
  'kernel:effect-applied': { effect: POISON, holder: { kind: 'field' } },
  'kernel:effect-changed': { effect: { ...POISON, id: 3 }, holder: { kind: 'unit', unit: 'archers-1' } },
  'kernel:effect-not-applied': { effect: 'core:poison', holder: { kind: 'field' }, reason: 'immune' },
  'kernel:effect-removed': { effect: 3, holder: { kind: 'unit', unit: 'archers-1' } },
  'kernel:flags-changed': { flags: [], unit: 'archers-1' },
  'kernel:hazard-added': { cells: ['6,6'], hazard: 'fire-wall', visibleTo: 'all' },
  'kernel:hazard-removed': { hazard: 'swamp' },
  'kernel:health-changed': { count: 1, health: 1, unit: 'archers-1' },
  'kernel:hidden': { nextRequestId: 999 },
  'kernel:input-closed': { request: 7 },
  'kernel:input-requested': { request: REQUEST },
  'kernel:item-added': { item: { count: 1, id: 8, item: 'demo:healing-potion' }, unit: 'pikemen-1' },
  'kernel:item-changed': { item: { count: 1, id: 4, item: 'demo:healing-potion' }, unit: 'archers-1' },
  'kernel:item-removed': { item: 4, unit: 'archers-1' },
  'kernel:phase-changed': { phase: { kind: 'round-start' }, round: 2 },
  'kernel:resource-changed': { resource: 'demo:mana', unit: 'archers-1', value: 1 },
  'kernel:roll-made': { counter: 13, name: 'core:damage', result: 3, source: 'generator' },
  'kernel:steps-saved': { steps: [] },
  'kernel:tags-changed': { added: [], removed: [], unit: 'archers-1' },
  'kernel:trigger-fired': { fired: 1, trigger: 'reinforcements' },
  'kernel:turn-ended': { holder: { kind: 'unit', unit: 'archers-1' }, skipped: false, waited: false },
  'kernel:unit-moved': { path: ['2,5'], unit: 'archers-1' },
  'kernel:unit-placed': { cell: '0,0', unit: 'archers-1' },
  'kernel:unit-summoned': {
    unit: {
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
      side: 'defender',
      spentActions: {},
      startCount: 3,
      summoned: true,
      tags: {},
      visibleTo: 'all',
      zones: [],
    },
  },
  'kernel:unit-turned': { facing: 'west', unit: 'archers-1' },
  'kernel:variable-set': { value: 3, variable: 'waves' },
  'kernel:zones-changed': { added: ['swamp'], removed: [], unit: 'pikemen-1' },
};

function kernelEvent<Type extends KernelEventType>(type: Type, payload: KernelEventPayloads[Type]): KernelEvent<Type> {
  return { id: 0, payload, type, version: 1, visibleTo: 'all' };
}

function apply<Type extends KernelEventType>(type: Type, payload: KernelEventPayloads[Type]): BattleState {
  return KERNEL.applyEvent(FROZEN_STATE, kernelEvent(type, payload));
}

function withoutStartCount(unit: Unit): Unit {
  const value: unknown = withoutKey(unit, 'startCount');

  return value as Unit;
}

function inputOf(type: string): BattleState {
  if (type === KERNEL_EVENTS.inputRequested) return WITHOUT_REQUEST;

  return type === KERNEL_EVENTS.hidden || type === KERNEL_EVENTS.dataChanged ? PROJECTION : FROZEN_STATE;
}

function applyKernel(type: string, state: BattleState): BattleState {
  const payload: unknown = Object.entries(PAYLOADS).find(([name]) => name === type)?.[1];

  return KERNEL.applyEvent(state, event(type, payload));
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
