import { describe, expect, it } from 'vitest';
import { ContentError, type ContentRegistry, type ScenarioUnit } from '../../content/index.ts';
import type { BattleState } from '../../model/index.ts';
import { ability } from '../../tests/abilities.ts';
import { unitOf } from '../../tests/fixtures.ts';
import type { BattleOptions } from '../index.ts';
import { CONTENT, KERNEL } from './helpers.ts';

describe('the units and sides of the options of a battle', () => {
  it('add units after the units of their sides, with visibility and count, and deploy those without a cell', () => {
    const state = create({
      added: {
        attacker: [newcomer('archers-2', { count: 3, visibleTo: ['attacker'] })],
        defender: [newcomer('pikemen-2', { cell: '4,0', count: 4 }), newcomer('pikemen-3')],
      },
    });

    expect(state.units.map(({ id }) => id))
      .toStrictEqual(['archers-1', 'archers-2', 'pikemen-1', 'pikemen-2', 'pikemen-3']);

    expect(unitOf(state, 'archers-2'))
      .toMatchObject({ count: 3, side: 'attacker', startCount: 3, visibleTo: ['attacker'] });

    expect(unitOf(state, 'archers-2').cell).toBeUndefined();
    expect(unitOf(state, 'pikemen-2')).toMatchObject({ cell: '4,0', count: 4, side: 'defender', startCount: 4 });
    expect(unitOf(state, 'pikemen-3').cell).toBeUndefined();
    expect(state.phase).toStrictEqual({ kind: 'deployment', pending: ['attacker', 'defender'] });
  });

  it('leave out the removed units, and let an added unit take the place of one', () => {
    const state = create({ added: { defender: [newcomer('pikemen-2', { cell: '4,1' })] }, removed: ['pikemen-1'] });

    expect(state.units.map(({ id }) => id)).toStrictEqual(['archers-1', 'pikemen-2']);
    expect(unitOf(state, 'pikemen-2').cell).toBe('4,1');
  });

  it('change added units like units of the scenario, after they join', () => {
    const state = create({
      added: { attacker: [newcomer('archers-2', { count: 3 })] },
      units: { 'archers-2': { count: 2, health: 4, items: [{ count: 1, item: 'demo:arrow' }] } },
    });

    expect(unitOf(state, 'archers-2')).toMatchObject({ count: 2, health: 4, startCount: 2 });

    expect(unitOf(state, 'archers-2').inventory.map(({ count, item }) => [item, count]))
      .toStrictEqual([['demo:arrow', 1]]);
  });

  it('give the items of the options in place of the items of the scenario', () => {
    const state = create({ units: { 'archers-1': { items: [{ count: 2, item: 'demo:arrow' }] } } });

    expect(unitOf(state, 'archers-1').inventory).toStrictEqual([{ count: 2, id: 1, item: 'demo:arrow' }]);
  });

  it('apply the effects of the options after the effects of the scenario, with their parameters', () => {
    const state = create({
      sides: { attacker: { effects: [{ effect: 'demo:frozen' }] } },
      units: { 'pikemen-1': { effects: [{ effect: 'demo:ward' }, { effect: 'demo:steady', params: { level: 2 } }] } },
    });
    const pikemen = unitOf(state, 'pikemen-1');
    const attacker = state.sides.find(({ id }) => id === 'attacker');

    expect(pikemen.effects.map(({ effect }) => effect)).toStrictEqual(['demo:poison', 'demo:ward', 'demo:steady']);
    expect(pikemen.effects.map(({ params }) => params)).toStrictEqual([{}, {}, { level: 2 }]);
    expect(attacker?.effects.map(({ effect }) => effect)).toStrictEqual(['demo:blessing', 'demo:frozen']);
  });

  it('give sides more abilities and units the uses of abilities they have already spent', () => {
    const state = create({
      sides: { defender: { abilities: ['demo:volley'] } },
      units: { 'archers-1': { abilityUses: { 'demo:volley': { battle: 2, cooldown: 1 }, 'demo:zap': {} } } },
    }, ABILITIES);

    expect(state.sides.find(({ id }) => id === 'defender')?.abilities).toStrictEqual(['demo:volley']);

    expect(unitOf(state, 'archers-1').abilityUses).toStrictEqual([
      { ability: 'demo:volley', battle: 2, cooldown: 1, round: 0, turn: 0 },
      { ability: 'demo:zap', battle: 0, cooldown: 0, round: 0, turn: 0 },
    ]);
  });

  it('keep an added unit hidden from the sides it is hidden from in their projections', () => {
    const state = create({ added: { defender: [newcomer('pikemen-2', { cell: '4,0', visibleTo: ['defender'] })] } });

    expect(seenBy(state, 'attacker')).toStrictEqual(['archers-1', 'pikemen-1']);
    expect(seenBy(state, 'defender')).toStrictEqual(['archers-1', 'pikemen-1', 'pikemen-2']);
  });

  it.each([
    [{ removed: ['ghosts-1'] }, 'The scenario has no unit "ghosts-1" to remove.'],
    [{ removed: ['pikemen-1', 'pikemen-1'] }, 'The options remove the unit "pikemen-1" twice.'],
    [
      { removed: ['pikemen-1'], units: { 'pikemen-1': { count: 1 } } },
      'The battle has no unit "pikemen-1" to change; it is removed or unknown.',
    ],
    [{ units: { 'ghosts-1': { count: 1 } } }, 'The battle has no unit "ghosts-1" to change; it is removed or unknown.'],
    [{ added: { raiders: [newcomer('raiders-1')] } }, 'The scenario has no side "raiders" to add units to.'],
    [
      { added: { attacker: [newcomer('pikemen-1')] } },
      'The options add the unit "pikemen-1" under a name of the scenario.',
    ],
    [
      { added: { attacker: [newcomer('pikemen-1')] }, removed: ['pikemen-1'] },
      'The options add the unit "pikemen-1" under a name of the scenario.',
    ],
    [
      { added: { attacker: [newcomer('archers-2')], defender: [newcomer('archers-2')] } },
      'The options add the unit "archers-2" twice.',
    ],
    [{ added: { attacker: [newcomer('#3')] } }, 'The options add the unit "#3" named like a summoned unit.'],
    [{ added: { attacker: [newcomer('archers-2', { count: 0 })] } }, 'The unit "archers-2" needs a count from 1.'],
    [{ added: { attacker: [newcomer('archers-2', { visibleTo: ['defender'] })] } }, ADDED_UNSEEN],
    [{ added: { attacker: [newcomer('archers-2', { visibleTo: ['attacker', 'atacker'] })] } }, ADDED_UNSEEN],
    [
      { added: { attacker: [newcomer('archers-2', { items: [{ count: 0, item: 'demo:arrow' }] })] } },
      'An item "demo:arrow" of the unit "archers-2" in the options needs a count from 1 to',
    ],
    [
      { units: { 'archers-1': { items: [{ count: 0, item: 'demo:arrow' }] } } },
      'An item "demo:arrow" of the unit "archers-1" in the options needs a count from 1 to',
    ],
    [
      { units: { 'archers-1': { items: [{ charges: 1, count: 1, item: 'demo:arrow' }] } } },
      'An item "demo:arrow" of the unit "archers-1" in the options has charges it cannot have.',
    ],
    [{ sides: { raiders: {} } }, 'The scenario has no side "raiders" to change.'],
    [
      { sides: { attacker: { abilities: ['demo:volley', 'demo:volley'] } } },
      'The side "attacker" has the ability "demo:volley" already.',
    ],
    [{ sides: { defender: { abilities: ['demo:zap'] } } }, 'The side "defender" has the ability "demo:zap" already.'],
    [
      { units: { 'archers-1': { abilityUses: { 'demo:volley': { battle: -1 } } } } },
      'The uses of "demo:volley" by "archers-1" need numbers of 0+.',
    ],
    [
      { units: { 'archers-1': { effects: [{ effect: 'demo:ward', params: [] }] } } },
      'The unit "archers-1" gets an effect that needs a full name and parameters as an object or none.',
    ],
    [
      { sides: { attacker: { effects: [{ effect: 7 }] } } },
      'The side "attacker" gets an effect that needs a full name and parameters as an object or none.',
    ],
  ])('reject the wrong options %j', (options, message) => {
    expect(() => create(options as Partial<BattleOptions>, ZAPPING)).toThrow(new TypeError(message).message);
    expect(() => create(options as Partial<BattleOptions>, ZAPPING)).toThrow(TypeError);
  });

  it.each([
    [{ units: { 'archers-1': { abilityUses: { 'demo:missing': {} } } } }, 'demo:missing'],
    [{ added: { attacker: [newcomer('golems-1', { creature: 'demo:golem' })] } }, 'demo:golem'],
    [{ added: { defender: [newcomer('pikemen-2', { cell: '2,0' })] } }, 'does not fit where it stands'],
    [{ units: { 'archers-1': { effects: [{ effect: 'demo:missing' }] } } }, 'demo:missing'],
    [{ units: { 'archers-1': { items: [{ count: 1, item: 'demo:missing' }] } } }, 'demo:missing'],
    [{ sides: { attacker: { abilities: ['demo:missing'] } } }, 'demo:missing'],
  ])('treat options that name what the content does not have or allow as errors of content %j', (options, text) => {
    expect(() => create(options as Partial<BattleOptions>, ABILITIES)).toThrow(ContentError);
    expect(() => create(options as Partial<BattleOptions>, ABILITIES)).toThrow(text);
  });
});

describe('the abilities of the sides of a scenario', () => {
  it('are checked when the battle is created, and one the content lacks is an error of content', () => {
    const scenario = ABILITIES.scenarios['demo:duel'];

    if (scenario === undefined) throw new Error('No scenario');

    const sides = scenario.sides
      .map((side) => (side.id === 'attacker' ? { ...side, abilities: ['demo:missing'] } : side));
    const content = { ...ABILITIES, scenarios: { 'demo:duel': { ...scenario, sides } } };

    expect(() => create({}, content)).toThrow(ContentError);
    expect(() => create({}, content)).toThrow('demo:missing');
    const zapped = create({ sides: { attacker: { abilities: ['demo:zap'] } } }, ABILITIES);

    expect(zapped.sides.find(({ id }) => id === 'attacker')?.abilities).toContain('demo:zap');
  });
});

const ABILITIES: ContentRegistry = {
  ...CONTENT,
  abilities: { 'demo:volley': ability('demo:volley'), 'demo:zap': ability('demo:zap') },
};

const ZAPPING = withSideAbility(ABILITIES, 'defender', 'demo:zap');

const ADDED_UNSEEN = 'The unit "archers-2" needs to be seen by its side and by no side the scenario does not have.';

function create(options: Partial<BattleOptions>, content: ContentRegistry = CONTENT): BattleState {
  return KERNEL.createState({ scenario: 'demo:duel', ...options }, content);
}

function seenBy(state: BattleState, side: string): readonly string[] {
  return KERNEL.project(state, CONTENT, { kind: 'sides', sides: [side] }).units.map(({ id }) => id);
}

function newcomer(id: string, change: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return { count: 1, creature: 'demo:pikeman', effects: [], id, items: [], visibleTo: 'all', ...change };
}

function withSideAbility(content: ContentRegistry, side: string, ability: string): ContentRegistry {
  const scenario = content.scenarios['demo:duel'];

  if (scenario === undefined) throw new Error('No scenario');

  const sides = scenario.sides.map((one) => (one.id === side ? { ...one, abilities: [ability] } : one));

  return { ...content, scenarios: { 'demo:duel': { ...scenario, sides } } };
}
