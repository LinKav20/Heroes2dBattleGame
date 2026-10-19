import { describe, expect, it } from 'vitest';
import { ContentError, type ContentRegistry, type Creature, type Effect } from '../../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../../events/index.ts';
import { createExpressions } from '../../expressions/index.ts';
import type { EventDraft } from '../../extensions/index.ts';
import type { BattleState, Unit } from '../../model/index.ts';
import { BARE_STATE, contentWith, emit, HIT, KERNEL, mark, run, tagsOf, types } from '../../tests/battle.ts';
import { applied, effect, node, unitOf } from '../../tests/fixtures.ts';
import { areaRefreshDraft, tickDraft } from '../index.ts';

describe('kernel:area-refresh', () => {
  it('covers the allies around the holder of an aura and puts units into the zones they stand in', () => {
    const result = run(onGrid(), CONTENT, areaRefreshDraft());

    expect(types(result)).toStrictEqual(['kernel:zones-changed', 'kernel:auras-changed']);

    expect(result.events.map(({ payload, visibleTo }) => [payload, visibleTo])).toStrictEqual([
      [{ added: ['swamp'], removed: [], unit: 'pikemen-1' }, ['defender']],
      [{ added: ['demo:inspired'], removed: [], unit: 'wolves-1' }, 'all'],
    ]);

    expect(speedOf(result.state, 'wolves-1')).toBe(6);
    expect(speedOf(result.state, 'pikemen-1')).toBe(3);
    expect(tagsOf(result.state, CONTENT, 'wolves-1')).toMatchObject({ 'Buff.Inspired': 1 });
    expect(tagsOf(result.state, CONTENT, 'pikemen-1')).toMatchObject({ 'Terrain.Mud': 1 });
    expect(run(result.state, CONTENT, areaRefreshDraft()).events).toStrictEqual([]);
  });

  it('uncovers units that left the aura or died and takes the auras of dead holders and inactive effects away', () => {
    const covered = run(onGrid(), CONTENT, areaRefreshDraft()).state;
    const away = run(moved(covered, 'wolves-1', '4,2'), CONTENT, areaRefreshDraft());
    const dead = run(changed(covered, 'archers-1', { count: 0 }), CONTENT, areaRefreshDraft());
    const fallen = run(changed(covered, 'pikemen-1', { count: 0 }), CONTENT, areaRefreshDraft());
    const quiet = withEffect('demo:banner', { activeWhile: false });

    expect(away.events.map(({ payload }) => payload)).toStrictEqual([
      { added: [], removed: ['demo:inspired'], unit: 'wolves-1' },
    ]);

    expect(unitOf(dead.state, 'wolves-1').auras).toStrictEqual([]);
    expect(unitOf(fallen.state, 'pikemen-1').zones).toStrictEqual([]);
    expect(unitOf(run(onGrid(), quiet, areaRefreshDraft()).state, 'wolves-1').auras).toStrictEqual([]);
  });

  it('gives an effect of the same name once, covers enemies if the aura says so and makes no auras of auras', () => {
    const state = changed(onGrid(), 'pikemen-1', { effects: [applied(10, 'demo:dread')] });
    const banners = changed(state, 'wolves-1', { effects: [applied(11, 'demo:banner')] });
    const result = run(banners, CONTENT, areaRefreshDraft());

    expect(unitOf(result.state, 'archers-1').auras).toStrictEqual(['demo:feared', 'demo:inspired']);
    expect(unitOf(result.state, 'wolves-1').auras).toStrictEqual(['demo:inspired']);
    expect(unitOf(result.state, 'pikemen-1').auras).toStrictEqual([]);
  });

  it('takes auras from effects of the creature and of equipped items, and not from items left unequipped', () => {
    const base = changed(onGrid(), 'archers-1', { effects: [] });
    const fromCreature = run(base, withCreatureEffect('demo:archer', 'demo:banner'), areaRefreshDraft());
    const carried = changed(base, 'archers-1', { inventory: [{ count: 1, id: 20, item: 'demo:standard' }] });
    const standard = { count: 1, id: 20, item: 'demo:standard', slot: 'hands' };
    const worn = changed(base, 'archers-1', { inventory: [standard] });

    expect(unitOf(fromCreature.state, 'wolves-1').auras).toStrictEqual(['demo:inspired']);
    expect(unitOf(run(carried, CONTENT, areaRefreshDraft()).state, 'wolves-1').auras).toStrictEqual([]);
    expect(unitOf(run(worn, CONTENT, areaRefreshDraft()).state, 'wolves-1').auras).toStrictEqual(['demo:inspired']);
  });

  it('does not let an aura effect act again on a unit that has it of its own', () => {
    const owned = withCreatureEffect('demo:pikeman', 'demo:inspired');
    const covered = run(onGrid(), owned, areaRefreshDraft()).state;

    expect(unitOf(covered, 'wolves-1').auras).toContain('demo:inspired');
    expect(speedOf(covered, 'wolves-1', owned)).toBe(6);
  });

  it('judges the activity of an aura by the auras from before the refresh', () => {
    const relay = changed(onGrid(), 'wolves-1', { effects: [applied(12, 'demo:relay')] });
    const once = run(relay, CONTENT, areaRefreshDraft()).state;
    const twice = run(once, CONTENT, areaRefreshDraft()).state;

    expect(unitOf(once, 'archers-1').auras).toStrictEqual([]);
    expect(unitOf(twice, 'archers-1').auras).toStrictEqual(['demo:relayed']);
  });

  it('gives events about what the same sides see together and hides a zone that is gone', () => {
    const owner = withEffect('demo:inspired', { visibility: 'owner' });
    const pit = { cells: ['0,0'], effects: [], id: 'pit', visibleTo: 'all' } as const;
    const swamp = { cells: ['0,0'], effects: [], id: 'swamp', visibleTo: ['defender'] } as const;
    const zoned = { ...onGrid(), field: { ...onGrid().field, hazards: [pit, swamp] } };
    const result = run(zoned, owner, areaRefreshDraft());
    const gone = { ...result.state, field: { ...result.state.field, hazards: [] } };

    expect(result.events.map(({ payload, visibleTo }) => [payload, visibleTo])).toStrictEqual([
      [{ added: ['pit'], removed: [], unit: 'archers-1' }, 'all'],
      [{ added: ['swamp'], removed: [], unit: 'archers-1' }, ['defender']],
      [{ added: ['demo:inspired'], removed: [], unit: 'wolves-1' }, ['attacker']],
    ]);

    expect(run(gone, owner, areaRefreshDraft()).events.map(({ visibleTo }) => visibleTo)).toStrictEqual([[]]);
  });

  it('shows an effect of an aura seen only by its own side to the side of the covered unit', () => {
    const owner = withEffect('demo:feared', { visibility: 'owner' });
    const state = changed(onGrid(), 'pikemen-1', { effects: [applied(10, 'demo:dread')] });
    const feared = run(state, owner, areaRefreshDraft()).events
      .filter(({ payload }) => JSON.stringify(payload).includes('demo:feared'));

    expect(feared.map(({ payload, visibleTo }) => [payload, visibleTo])).toStrictEqual([
      [{ added: ['demo:feared'], removed: [], unit: 'archers-1' }, ['attacker']],
    ]);
  });

  it('lets an effect of an aura react and run its operations of every turn like an effect of the creature', () => {
    const covered = run(onGrid(), CONTENT, areaRefreshDraft()).state;
    const hit = { payload: { unit: 'wolves-1' }, type: HIT.name, visibleTo: 'all' } as const;
    const turn = tickDraft({ holder: { kind: 'unit', unit: 'wolves-1' }, moment: 'holder-turn-start' });

    expect(run(covered, CONTENT, emit([hit])).state.variables).toMatchObject({ cheered: true });
    expect(run(covered, CONTENT, turn).state.variables).toMatchObject({ rallied: true });
  });

  it('treats an aura that is not a radius as an error of content', () => {
    const aura = { affects: 'allies', area: { shape: 'cone', size: 2 }, effect: 'demo:inspired' } as const;
    const cone = withEffect('demo:banner', { aura });

    expect(() => run(onGrid(), cone, areaRefreshDraft())).toThrow(ContentError);
  });
});

describe('the reactions of the effects of a hazard zone', () => {
  it('follow a move only by its path, its last cell included', () => {
    const placed = run(onGrid(), CONTENT, areaRefreshDraft()).state;

    expect(stuck(placed, CONTENT, movedAlong('archers-1', ['1,1', '2,1', '3,1', '4,1']))).toBe(true);
    expect(stuck(placed, CONTENT, movedAlong('archers-1', ['1,1', '1,2']))).toBeUndefined();
    expect(stuck(placed, CONTENT, movedAlong('pikemen-1', ['2,0']))).toBe(true);
    expect(stuck(placed, CONTENT, movedAlong('pikemen-1', ['2,1', '2,2']))).toBeUndefined();
  });

  it('count for a flying unit only the cell where it stops, and every cell of a big unit', () => {
    const placed = run(onGrid(), CONTENT, areaRefreshDraft()).state;
    const flying = withCreature('demo:archer', { movement: 'fly' });
    const big = withCreature('demo:archer', { size: 2 });

    expect(stuck(placed, flying, movedAlong('archers-1', ['1,1', '2,1', '3,1', '4,1']))).toBeUndefined();
    expect(stuck(placed, flying, movedAlong('archers-1', ['1,1', '2,1', '3,1']))).toBe(true);
    expect(stuck(placed, big, movedAlong('archers-1', ['1,1', '2,1']))).toBe(true);
  });

  it('fire on other events only for units in the zone and never for events about nobody', () => {
    const placed = run(onGrid(), CONTENT, areaRefreshDraft()).state;
    const nobody = kernelEventDraft(KERNEL_EVENTS.variableSet, { value: 1, variable: 'waves' }, 'all');

    expect(run(placed, CONTENT, emit([about('pikemen-1')])).state.variables.burned).toBe(true);
    expect(run(placed, CONTENT, emit([about('wolves-1')])).state.variables.burned).toBeUndefined();
    expect(run(placed, CONTENT, emit([nobody])).state.variables.wet).toBeUndefined();
  });

  it('end the effect on an event about anybody, as for other applied effects', () => {
    const placed = run(onGrid(), CONTENT, areaRefreshDraft()).state;
    const ending = withEffect('demo:mud', { endsOn: [{ on: HIT.name }] });
    const result = run(placed, ending, emit([{ payload: { unit: 'wolves-1' }, type: HIT.name, visibleTo: 'all' }]));

    expect(result.state.field.hazards[0]?.effects).toStrictEqual([]);
  });
});

const EFFECTS: readonly Effect[] = [
  effect('demo:banner', {
    aura: { affects: 'allies', area: { shape: 'radius', size: 1 }, effect: 'demo:inspired' },
    duration: { kind: 'battle' },
  }),
  effect('demo:inspired', {
    aura: { affects: 'all', area: { shape: 'radius', size: 5 }, effect: 'demo:echo' },
    duration: { kind: 'battle' },
    grantsTags: ['Buff.Inspired'],
    modifiers: [{ attribute: 'core:speed', operation: 'add', value: 2 }],
    onTurn: [mark('rallied')],
    triggers: [{ on: HIT.name, ops: [mark('cheered')], priority: 0 }],
  }),
  effect('demo:relay', {
    activeWhile: node('kernel:has-tag', { of: 'self', tag: 'Buff.Inspired' }),
    aura: { affects: 'allies', area: { shape: 'radius', size: 1 }, effect: 'demo:relayed' },
    duration: { kind: 'battle' },
  }),
  effect('demo:relayed', { duration: { kind: 'battle' } }),
  effect('demo:dread', {
    aura: { affects: 'enemies', area: { shape: 'radius', size: 2 }, effect: 'demo:feared' },
    duration: { kind: 'battle' },
  }),
  effect('demo:feared', { duration: { kind: 'battle' } }),
  effect('demo:echo', { duration: { kind: 'battle' } }),
  effect('demo:mud', {
    duration: { kind: 'battle' },
    grantsTags: ['Terrain.Mud'],
    modifiers: [{ attribute: 'core:speed', operation: 'add', value: -1 }],
    triggers: [
      { on: KERNEL_EVENTS.unitMoved, ops: [mark('stuck')], priority: 0 },
      { on: HIT.name, ops: [mark('burned')], priority: 0 },
      { on: KERNEL_EVENTS.variableSet, ops: [mark('wet')], priority: 0 },
    ],
  }),
];

const CONTENT_BASE: ContentRegistry = contentWith(...EFFECTS);

const CONTENT: ContentRegistry = {
  ...CONTENT_BASE,
  items: {
    ...CONTENT_BASE.items,
    'demo:standard': {
      abilities: [],
      consumedOnUse: false,
      effects: ['demo:banner'],
      name: 'demo:standard',
      slot: 'hands',
      stack: 1,
      tags: [],
    },
  },
};

function onGrid(): BattleState {
  const pikemen = unitOf(BARE_STATE, 'pikemen-1');
  const wolves: Unit = { ...pikemen, cell: '0,1', id: 'wolves-1', side: 'attacker', visibleTo: 'all' };
  const units = [...BARE_STATE.units, wolves].map((unit) => {
    if (unit.id === 'archers-1') return { ...unit, cell: '0,0', effects: [applied(9, 'demo:banner')] };

    return unit.id === 'pikemen-1' ? { ...unit, cell: '2,0' } : unit;
  });
  const swamp = { cells: ['2,0', '3,1'], effects: [applied(5, 'demo:mud', { visibleTo: ['defender'] })], id: 'swamp' };

  return {
    ...BARE_STATE,
    field: {
      ...BARE_STATE.field,
      hazards: [{ ...swamp, visibleTo: ['defender'] }],
      obstacles: [],
      params: { height: 3, width: 6 },
      topology: 'acme:grid',
    },
    units,
  };
}

function about(unit: string): EventDraft {
  return { payload: { unit }, type: HIT.name, visibleTo: 'all' };
}

function movedAlong(unit: string, path: readonly string[]): EventDraft {
  return kernelEventDraft(KERNEL_EVENTS.unitMoved, { path, unit }, 'all');
}

function changed(state: BattleState, id: string, change: Partial<Unit>): BattleState {
  return { ...state, units: state.units.map((unit) => (unit.id === id ? { ...unit, ...change } : unit)) };
}

function moved(state: BattleState, id: string, cell: string): BattleState {
  return changed(state, id, { cell });
}

function withEffect(name: string, change: Partial<Effect>): ContentRegistry {
  const found = CONTENT.effects[name];

  if (found === undefined) throw new Error(`No effect ${name}`);

  return { ...CONTENT, effects: { ...CONTENT.effects, [name]: { ...found, ...change } } };
}

function withCreature(name: string, change: Partial<Creature>): ContentRegistry {
  const found = CONTENT.creatures[name];

  if (found === undefined) throw new Error(`No creature ${name}`);

  return { ...CONTENT, creatures: { ...CONTENT.creatures, [name]: { ...found, ...change } } };
}

function withCreatureEffect(name: string, effectName: string): ContentRegistry {
  return withCreature(name, { effects: [effectName] });
}

function stuck(state: BattleState, content: ContentRegistry, move: EventDraft): unknown {
  return run(state, content, emit([move])).state.variables.stuck;
}

function speedOf(state: BattleState, unit: string, content: ContentRegistry = CONTENT): unknown {
  const expressions = createExpressions({ content, inputs: [], registries: KERNEL.registries, state });
  const speed = expressions.attribute({ kind: 'unit', unit }, 'core:speed');

  return speed.kind === 'value' ? speed.value : speed;
}
