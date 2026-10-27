import {
  createKernel,
  DONE,
  moveDraft,
  type BattleEvent,
  type BattleOptions,
  type BattleState,
  type Command,
  type ContentRegistry,
  type Effect,
  type Op,
  type OperationContext,
  type StepResult,
  type OperationExtension,
  type Ruleset,
  type ScenarioUnit,
} from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { RULES_STDLIB_EXTENSIONS, STACK_ATTACK } from '../index.ts';
import {
  answered,
  attack,
  CONTENT,
  contentWith,
  dice,
  endTurn,
  eventsOf,
  EXTERNAL,
  holderOf,
  play,
  played,
  refusal,
  roll,
  RULESET,
  SCENARIO,
  shoot,
  STACK_PARAMS,
  started,
  unitOf,
  withUnits,
} from './world.ts';

type Units = Readonly<Record<string, Partial<ScenarioUnit>>>;

type Played = ReturnType<typeof answered>;

describe('the damage of a strike', () => {
  it('rolls the damage of every creature, and the target strikes back once', () => {
    const { content, state } = near();
    const asked = play(state, content, attack('pikemen-1', 'skeletons-1')).state;
    const struck = play(asked, content, roll(asked.inputRequest?.id ?? 0, ...dice(2, 10)));
    const back = play(struck.state, content, roll(struck.state.inputRequest?.id ?? 0, ...dice(1, 9)));

    expect(asked.inputRequest).toMatchObject({ count: 10, name: 'core:damage-roll', sides: 3, unit: 'pikemen-1' });
    expect(attacked(struck.events)).toStrictEqual([strikeOf('pikemen-1', 20, 'melee')]);
    expect(unitOf(struck.state, 'skeletons-1')).toMatchObject({ count: 9, health: 4 });
    expect(struck.state.inputRequest).toMatchObject({ count: 9, unit: 'skeletons-1' });
    expect(attacked(back.events)).toStrictEqual([strikeOf('skeletons-1', 9, 'retaliation', 'pikemen-1')]);
    expect(unitOf(back.state, 'pikemen-1')).toMatchObject({ count: 10, health: 1 });
    expect(unitOf(back.state, 'skeletons-1').resources['core:retaliations']).toBe(0);
    expect(holderOf(back.state)).toBe('skeletons-1');
  });

  it.each([
    {
      attacker: 'pikemen-1',
      damage: 20,
      endTurns: [],
      from: undefined,
      name: 'equal attack and defense',
      target: 'skeletons-1',
      units: {},
    },
    {
      attacker: 'skeletons-1',
      damage: 26,
      endTurns: ['pikemen-1'],
      from: '5,1',
      name: 'attack above defense',
      target: 'archers-1',
      units: { 'archers-1': { cell: '4,1' }, 'skeletons-1': { cell: '8,1' } },
    },
    {
      attacker: 'pikemen-1',
      damage: 80,
      endTurns: [],
      from: undefined,
      name: 'the largest rise',
      target: 'skeletons-1',
      units: { 'pikemen-1': { cell: '3,1', effects: ['demo:fury'] } },
    },
    {
      attacker: 'pikemen-1',
      damage: 18,
      endTurns: [],
      from: undefined,
      name: 'a fall below its limit',
      target: 'griffins-1',
      units: { 'pikemen-1': { cell: '6,3' } },
    },
    {
      attacker: 'pikemen-1',
      damage: 6,
      endTurns: [],
      from: undefined,
      name: 'the largest fall',
      target: 'skeletons-1',
      units: { 'skeletons-1': { cell: '4,1', effects: ['demo:fortress'] } },
    },
  ])('changes the damage by the difference of attack and defense: $name', (row) => {
    const { content, state } = near(row.units);
    const turn = played(state, content, ...row.endTurns.map(endTurn));
    const struck = answered(turn, content, attack(row.attacker, row.target, row.from), dice(2, 10));

    expect(attacked(struck.events)[0]).toStrictEqual(strikeOf(row.attacker, row.damage, 'melee', row.target));
  });

  it.each([
    { damage: 52, rounding: 'down' },
    { damage: 53, rounding: 'up' },
    { damage: 53, rounding: 'nearest' },
  ] as const)('grows the sum of the rolls in proportion for a bigger stack, rounding $rounding', (row) => {
    const content = contentWith(withUnits(NEAR), { rounding: row.rounding });
    const state = played(started(content, { ruleset: EXTERNAL, units: { 'pikemen-1': { count: 25 } } }), content,
      endTurn('griffins-1'));
    const asked = play(state, content, attack('pikemen-1', 'skeletons-1')).state;
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), [2, 2, 2, 2, 2, 2, 2, 2, 2, 3]);

    expect(asked.inputRequest).toMatchObject({ count: 10 });
    expect(attacked(struck.events)[0]).toMatchObject({ damage: row.damage });
  });

  it('rolls for as many creatures as the ruleset says', () => {
    const content = withAttack({ damage: { ...STACK_PARAMS.damage, rolled: 3 } }, NEAR);
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const asked = play(state, content, attack('pikemen-1', 'skeletons-1')).state;

    expect(asked.inputRequest).toMatchObject({ count: 3, unit: 'pikemen-1' });
  });

  it('counts exactly where the products go beyond the safe integers', () => {
    const { content, state } = near({}, { units: { 'pikemen-1': { count: 1_000_000_000_000_001 } } });
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), [2, 3, 3, 3, 3, 3, 3, 3, 3, 3]);

    expect(attacked(struck.events)[0]).toMatchObject({ damage: 2_900_000_000_000_002 });
  });

  it('rolls no damage for a fixed damage and counts a greatest damage below the least as the least', () => {
    const { content, state } = near({ 'archers-1': { cell: '4,2', effects: ['demo:blunt'] } });
    const archers = played(state, content, endTurn('pikemen-1'), endTurn('skeletons-1'));
    const struck = play(archers, content, attack('archers-1', 'skeletons-1'));

    expect(attacked(struck.events)[0]).toMatchObject({ attacker: 'archers-1', damage: 5 });
  });

  it('rolls a damage that spreads up to the largest die, and rejects a wider one', () => {
    const wide = withEffects({ 'acme:wide': spread(2 ** 32) }, WIDE);
    const wider = withEffects({ 'acme:wide': spread(2 ** 32 + 1) }, WIDE);
    const asked = play(ready(wide), wide, attack('pikemen-1', 'skeletons-1')).state;

    expect(asked.inputRequest).toMatchObject({ sides: 2 ** 32 });

    expect(refusal(ready(wider), wider, attack('pikemen-1', 'skeletons-1')))
      .toStrictEqual(['kernel:out-of-range', { attribute: 'core:damage-max', unit: 'pikemen-1' }]);
  });

  it('deals at least 1 damage', () => {
    const { content, state } = near(
      { 'skeletons-1': { cell: '4,1', effects: ['demo:fortress'] } },
      { units: { 'pikemen-1': { count: 1 } } },
    );
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), [1]);

    expect(attacked(struck.events)[0]).toMatchObject({ damage: 1 });
  });

  it('rejects a strike with a damage beyond the safe integers, naming the unit that strikes', () => {
    const { content, state } = near({ 'pikemen-1': { cell: '3,1', effects: ['demo:titan'] } });

    expect(refusal(state, content, attack('pikemen-1', 'skeletons-1')))
      .toStrictEqual(['kernel:out-of-range', { unit: 'pikemen-1' }]);
  });

  it('is refused against a unit that is not next to the attacker or is not an enemy', () => {
    const { content, state } = near();

    expect(refusal(state, content, attack('pikemen-1', 'griffins-1'))).toStrictEqual(['rules-stdlib:not-adjacent', {}]);
    expect(refusal(state, content, attack('pikemen-1', 'archers-1'))).toStrictEqual(['rules-stdlib:not-an-enemy', {}]);
  });

  it('is refused to a unit without the action it spends', () => {
    const content = contentWith(withUnits({ ...NEAR, 'pikemen-1': { cell: '3,1', effects: ['demo:stunned'] } }), {
      turn: { ...RULESET.turn, actions: ['core:action', 'core:speed'] },
    });
    const state = played(started(content), content, endTurn('griffins-1'));

    expect(holderOf(state)).toBe('pikemen-1');

    expect(refusal(state, content, attack('pikemen-1', 'skeletons-1')))
      .toStrictEqual(['kernel:not-enough-actions', { action: 'core:action' }]);
  });

  it('reaches a big creature through any of its cells', () => {
    const { content, state } = near({ 'griffins-1': { cell: '7,3', facing: 'east' }, 'pikemen-1': { cell: '5,3' } });
    const struck = answered(state, content, attack('pikemen-1', 'griffins-1'), dice(2, 10));

    expect(attacked(struck.events)).toHaveLength(1);
    expect(struck.state.inputRequest).toMatchObject({ name: 'core:damage-roll', unit: 'griffins-1' });
  });

  it('does nothing when a reaction to the cost of the strike takes the target away', () => {
    const content = withEffects({ 'acme:shy': shy('6,1') }, { 'skeletons-1': { cell: '4,1', effects: ['acme:shy'] } });
    const result = PUSHING.execute(pushed(content, 'griffins-1'), attack('pikemen-1', 'skeletons-1'), content);

    if (!result.ok) throw new Error('The attack is rejected.');

    expect(unitOf(result.state, 'skeletons-1').cell).toBe('6,1');
    expect(unitOf(result.state, 'pikemen-1').spentActions).toStrictEqual({ 'core:action': 1 });
    expect(attacked(result.events)).toStrictEqual([]);
    expect(result.state.inputRequest).toBeUndefined();
  });

  it('is a step of the attack of stacks only, and throws under an attack of another package', () => {
    const mechanics: Ruleset['mechanics'] = {
      ...RULESET.mechanics,
      'kernel:attack': { params: STACK_PARAMS, variant: 'acme:stacks' },
    };
    const content = contentWith(withUnits(NEAR), { mechanics });
    const created = FOREIGN.createState({ ruleset: EXTERNAL, scenario: 'demo:field', seed: '5'.repeat(64) }, content);
    const commands: readonly Command[] = [{ kind: 'game', type: 'start-battle' }, endTurn('griffins-1')];
    const state = commands.reduce((current, command) => {
      const result = FOREIGN.execute(current, command, content);

      if (!result.ok) throw new Error(`${JSON.stringify(command)} is rejected.`);

      return result.state;
    }, created);

    expect(() => FOREIGN.execute(state, attack('pikemen-1', 'skeletons-1'), content))
      .toThrow('The steps of rules-stdlib:stacks need it as the attack of the ruleset.');
  });
});

describe('luck', () => {
  it('doubles the damage with good luck and halves it with bad luck, on the highest and the lowest sides', () => {
    const lucky = near({ 'pikemen-1': { cell: '3,1', effects: ['demo:fortune'] } });
    const unlucky = near({ 'pikemen-1': { cell: '3,1', effects: ['demo:misfortune'] } });
    const good = answered(lucky.state, lucky.content, attack('pikemen-1', 'skeletons-1'), dice(2, 10), [22]);
    const missed = answered(lucky.state, lucky.content, attack('pikemen-1', 'skeletons-1'), dice(2, 10), [21]);
    const bad = answered(unlucky.state, unlucky.content, attack('pikemen-1', 'skeletons-1'), dice(2, 10), [3]);

    expect(attacked(good.events)[0]).toStrictEqual({ ...strikeOf('pikemen-1', 40, 'melee'), luck: 'good' });
    expect(attacked(missed.events)[0]).toStrictEqual(strikeOf('pikemen-1', 20, 'melee'));
    expect(attacked(bad.events)[0]).toStrictEqual({ ...strikeOf('pikemen-1', 10, 'melee'), luck: 'bad' });
  });

  it('changes a shot and a strike back too', () => {
    const shooter = contentWith(withUnits({
      'archers-1': { cell: '0,3', effects: ['demo:fortune'] },
      'skeletons-1': { cell: '5,3' },
    }));
    const shot = shotAt(shooter, 'skeletons-1', dice(2, 5), [24]);
    const { content, state } = near({ 'skeletons-1': { cell: '4,1', effects: ['demo:fortune'] } });
    const back = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10), dice(1, 9), [24]);

    expect(attacked(shot.events)).toStrictEqual([{ ...strikeOf('archers-1', 32, 'shot'), luck: 'good' }]);

    expect(attacked(back.events)[1])
      .toStrictEqual({ ...strikeOf('skeletons-1', 18, 'retaliation', 'pikemen-1'), luck: 'good' });
  });

  it('is not rolled when the attack has no percents of luck', () => {
    const { luck, ...rules } = STACK_PARAMS;
    const content = contentWith(withUnits({ ...NEAR, 'pikemen-1': { cell: '3,1', effects: ['demo:fortune'] } }), {
      mechanics: { ...RULESET.mechanics, 'kernel:attack': { params: rules, variant: 'rules-stdlib:stacks' } },
    });
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10));

    expect(luck).toBeDefined();
    expect(attacked(struck.events)[0]).toStrictEqual(strikeOf('pikemen-1', 20, 'melee'));
  });
});

describe('who sees a strike', () => {
  it.each([
    { name: 'a hidden attacker', pikemen: ['attacker'], skeletons: 'all', strike: ['attacker'] },
    { name: 'units both sides see', pikemen: 'all', skeletons: 'all', strike: 'all' },
  ] as const)('shows the strike and the strike back only to the sides that see both: $name', (row) => {
    const { content, state } = near({
      'pikemen-1': { cell: '3,1', visibleTo: row.pikemen },
      'skeletons-1': { cell: '4,1', visibleTo: row.skeletons },
    });
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10), dice(1, 9));

    expect(eventsOf(struck.events, 'rules-stdlib:attacked').map(({ visibleTo }) => visibleTo))
      .toStrictEqual([row.strike, row.strike]);
  });

  it.each([
    { name: 'a target the side of the attacker does not see', pikemen: 'all', skeletons: ['defender'] },
    { name: 'units hidden from different sides', pikemen: ['attacker'], skeletons: ['defender'] },
  ] as const)('rejects a strike at a unit not in the battle and at $name alike', (row) => {
    const { content, state } = near({
      'pikemen-1': { cell: '3,1', visibleTo: row.pikemen },
      'skeletons-1': { cell: '4,1', visibleTo: row.skeletons },
    });

    expect(refusal(state, content, attack('pikemen-1', 'skeletons-1')))
      .toStrictEqual(refusal(state, content, attack('pikemen-1', 'nobody-1')));

    expect(refusal(state, content, attack('pikemen-1', 'skeletons-1')))
      .toStrictEqual(['kernel:invalid-command', { field: 'target' }]);
  });

  it('shows the roll of the damage to the sides that see the unit that strikes', () => {
    const { content, state } = near({ 'pikemen-1': { cell: '3,1', visibleTo: ['attacker'] } });
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10));

    expect(eventsOf(struck.events, 'kernel:roll-made').map(({ visibleTo }) => visibleTo)).toStrictEqual([['attacker']]);
  });

  it('lets a reaction tell the attacker and the kind of strike from the event', () => {
    const watched = { 'pikemen-1': { cell: '3,1', effects: ['demo:watcher'] } };
    const { content, state } = near(watched, {}, { variables: { struck: false } });
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10), dice(1, 9));

    expect(struck.state.variables.struck).toBe(true);
  });
});

describe('the strike back', () => {
  it('follows from the event of the strike', () => {
    const { content } = near({ 'archers-1': { cell: '4,2' } });
    const rolled = played(started(content), content, endTurn('griffins-1'), endTurn('pikemen-1'));
    const [strike, back] = eventsOf(play(rolled, content, attack('skeletons-1', 'archers-1', '5,2')).events,
      'rules-stdlib:attacked');

    expect(back?.cause).toBe(strike?.id);
  });

  it('comes from a shooter with the penalty of melee', () => {
    const { content, state } = near({ 'archers-1': { cell: '4,2' } });
    const skeletons = played(state, content, endTurn('pikemen-1'));
    const struck = answered(skeletons, content, attack('skeletons-1', 'archers-1', '5,2'), dice(2, 10), dice(2, 3));

    expect(attacked(struck.events)[1]).toStrictEqual(strikeOf('archers-1', 4, 'retaliation', 'skeletons-1'));
  });

  it('never comes from a dead target, which keeps its strikes back', () => {
    const { content, state } = near({}, { units: { 'skeletons-1': { count: 1 } } });
    const killed = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10));
    const changed = eventsOf(killed.events, 'kernel:resource-changed');

    expect(attacked(killed.events)).toHaveLength(1);
    expect(killed.state.inputRequest).toBeUndefined();
    expect(unitOf(killed.state, 'skeletons-1').resources['core:retaliations']).toBe(1);
    expect(changed).toStrictEqual([]);
  });

  it('comes once for every strike back left and again in the next round', () => {
    const { content, state } = near({ 'archers-1': { cell: '4,2' } });
    const first = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10), dice(1, 9)).state;
    const archers = played(first, content, endTurn('skeletons-1'));
    const second = answered(archers, content, attack('archers-1', 'skeletons-1'), dice(2, 5));
    const round = played(second.state, content, endTurn('griffins-1'));
    const third = play(round, content, attack('pikemen-1', 'skeletons-1')).state;
    const again = play(third, content, roll(third.inputRequest?.id ?? 0, ...dice(2, 10))).state;

    expect(attacked(second.events)).toHaveLength(1);
    expect(second.state.inputRequest).toBeUndefined();
    expect(round.round).toBe(2);
    expect(again.inputRequest).toMatchObject({ name: 'core:damage-roll', unit: 'skeletons-1' });
  });

  it('counts the strikes back of a creature that has more than one', () => {
    const { content, state } = near({ 'pikemen-1': { cell: '6,3' } });
    const struck = answered(state, content, attack('pikemen-1', 'griffins-1'), dice(2, 10), dice(2, 2));

    expect(attacked(struck.events)).toHaveLength(2);
    expect(unitOf(struck.state, 'griffins-1').resources['core:retaliations']).toBe(1);
  });

  it('is not given to an attacker that has none coming', () => {
    const { content, state } = near({ 'pikemen-1': { cell: '3,1', effects: ['demo:unanswered'] } });
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10));

    expect(struck.state.inputRequest).toBeUndefined();
  });

  it('is lost when its damage goes beyond the safe integers', () => {
    const { content, state } = near({ 'skeletons-1': { cell: '4,1', effects: ['demo:titan'] } });
    const struck = answered(state, content, attack('pikemen-1', 'skeletons-1'), dice(2, 10));

    expect(attacked(struck.events)).toStrictEqual([strikeOf('pikemen-1', 20, 'melee')]);
    expect(struck.state.inputRequest).toBeUndefined();
  });

  it('comes through any cell of a big creature', () => {
    const { content, state } = near({ 'griffins-1': { cell: '7,3', facing: 'east' }, 'pikemen-1': { cell: '5,3' } });
    const struck = answered(state, content, attack('pikemen-1', 'griffins-1'), dice(2, 10), dice(2, 2));

    expect(attacked(struck.events).map((strike) => (strike as { readonly kind: string }).kind))
      .toStrictEqual(['melee', 'retaliation']);
  });
});

describe('shots', () => {
  it.each([
    { cell: '5,3', damage: 16, name: 'at the far distance' },
    { cell: '6,3', damage: 8, name: 'beyond the far distance' },
  ])('spend a shot and lose half of the damage only beyond the far distance: $name', ({ cell, damage }) => {
    const content = contentWith(withUnits({ 'skeletons-1': { cell } }));
    const shot = shotAt(content, 'skeletons-1', dice(2, 5));

    expect(attacked(shot.events)).toStrictEqual([strikeOf('archers-1', damage, 'shot')]);
    expect(unitOf(shot.state, 'archers-1').resources['core:shots']).toBe(11);
    expect(shot.state.inputRequest).toBeUndefined();
  });

  it('measure the far distance to the nearest cell of a big creature', () => {
    const content = contentWith(withUnits({ 'griffins-1': { cell: '6,3', facing: 'east' } }));
    const shot = shotAt(content, 'griffins-1', dice(2, 5));

    expect(attacked(shot.events)).toStrictEqual([strikeOf('archers-1', 14, 'shot', 'griffins-1')]);
  });

  it('lose half of the damage from afar with the last shot too', () => {
    const content = contentWith(withUnits({ 'skeletons-1': { cell: '6,3' } }));
    const lastShot = { ruleset: EXTERNAL, units: { 'archers-1': { resources: { 'core:shots': 1 } } } };
    const last = answered(atArchers(content, lastShot), content, shoot('archers-1', 'skeletons-1'), dice(2, 5));

    expect(attacked(last.events)[0]).toMatchObject({ damage: 8 });
    expect(unitOf(last.state, 'archers-1').resources['core:shots']).toBe(0);
  });

  it.each([
    { damage: 8, effects: [], name: 'loses half of it with shots left', shots: 12 },
    { damage: 16, effects: [], name: 'keeps all of it without shots', shots: 0 },
    { damage: 16, effects: ['demo:sharp'], name: 'keeps all of it with a tag of no penalty', shots: 12 },
  ])('give a shooter in melee the damage it $name', ({ damage, effects, shots }) => {
    const units = { 'archers-1': { resources: { 'core:shots': shots } } };
    const { content, state } = near({ 'archers-1': { cell: '4,2', effects } }, { units });
    const turn = played(state, content, endTurn('pikemen-1'), endTurn('skeletons-1'));
    const struck = answered(turn, content, attack('archers-1', 'skeletons-1'), dice(2, 5));

    expect(attacked(struck.events)[0]).toStrictEqual(strikeOf('archers-1', damage, 'melee'));
  });

  it('lose nothing from afar with a tag of no penalty', () => {
    const content = contentWith(withUnits({
      'archers-1': { cell: '0,3', effects: ['demo:sharp'] },
      'skeletons-1': { cell: '6,3' },
    }));
    const shot = shotAt(content, 'skeletons-1', dice(2, 5));

    expect(attacked(shot.events)[0]).toMatchObject({ damage: 16 });
  });

  it.each([
    {
      name: 'without shots',
      options: { units: { 'archers-1': { resources: { 'core:shots': 0 } } } },
      reason: 'rules-stdlib:no-shots',
      target: 'skeletons-1',
      units: {},
    },
    {
      name: 'at a unit of its own side',
      options: {},
      reason: 'rules-stdlib:not-an-enemy',
      target: 'pikemen-1',
      units: {},
    },
    {
      name: 'next to an enemy it sees',
      options: {},
      reason: 'rules-stdlib:enemy-nearby',
      target: 'skeletons-1',
      units: { 'archers-1': { cell: '3,3' }, 'griffins-1': { cell: '4,3' } },
    },
    {
      name: 'next to the back cell of a big enemy',
      options: {},
      reason: 'rules-stdlib:enemy-nearby',
      target: 'skeletons-1',
      units: { 'archers-1': { cell: '5,3' }, 'griffins-1': { cell: '7,3', facing: 'east' } },
    },
  ])('are refused to a unit $name', ({ options, reason, target, units }) => {
    const content = contentWith(withUnits(units));

    expect(refusal(atArchers(content, options), content, shoot('archers-1', target))).toStrictEqual([reason, {}]);
  });

  it('are refused to a unit without shots in its creature', () => {
    const content = contentWith(withUnits({}));
    const pikemen = played(started(content), content, endTurn('griffins-1'));

    expect(refusal(pikemen, content, shoot('pikemen-1', 'griffins-1'))).toStrictEqual(['rules-stdlib:no-shots', {}]);
  });

  it('are refused without sight of the target, but not next to an enemy the side does not see', () => {
    const hidden = contentWith({ field: { ...SCENARIO.field, obstacles: [ROCK] } });
    const unseen = contentWith(withUnits({
      'archers-1': { cell: '3,3' },
      'griffins-1': { cell: '4,3', visibleTo: ['defender'] },
    }));

    expect(refusal(atArchers(hidden), hidden, shoot('archers-1', 'griffins-1')))
      .toStrictEqual(['rules-stdlib:out-of-sight', {}]);

    expect(refusal(atArchers(unseen), unseen, shoot('archers-1', 'skeletons-1'))).toBeUndefined();
  });

  it('do nothing when a reaction to the cost of the shot takes the target out of sight', () => {
    const shying = withEffects({ 'acme:shy': shy('6,3') }, { 'skeletons-1': { cell: '2,1', effects: ['acme:shy'] } });
    const scenario = shying.scenarios['demo:field'];

    if (scenario === undefined) throw new Error('No scenario.');

    const field = { ...scenario.field, obstacles: [ROCK] };
    const content = { ...shying, scenarios: { 'demo:field': { ...scenario, field } } };
    const result = PUSHING.execute(pushed(content, 'griffins-1', 'pikemen-1', 'skeletons-1'), shoot('archers-1',
      'skeletons-1'), content);

    if (!result.ok) throw new Error('The shot is rejected.');

    expect(unitOf(result.state, 'skeletons-1').cell).toBe('6,3');
    expect(attacked(result.events)).toStrictEqual([]);
    expect(result.state.inputRequest).toBeUndefined();
  });

  it('may hit a target out of sight when the ruleset allows it', () => {
    const content = withAttack({ shots: { ...STACK_PARAMS.shots, sight: false } }, {}, { obstacles: [ROCK] });
    const shot = shotAt(content, 'griffins-1', dice(2, 5));

    expect(attacked(shot.events)).toHaveLength(1);
  });

  it('may hit an enemy next to the shooter when the ruleset allows it, and get no strike back', () => {
    const content = withAttack({ shots: { ...STACK_PARAMS.shots, nearby: false } }, {
      'archers-1': { cell: '3,3' },
      'griffins-1': { cell: '4,3' },
    });
    const shot = shotAt(content, 'griffins-1', dice(2, 5));

    expect(attacked(shot.events)).toHaveLength(1);
    expect(shot.state.inputRequest).toBeUndefined();
  });
});

describe('the defense that braces a unit', () => {
  it('gives the unit the effect and ends its turn', () => {
    const { content, state } = near();
    const braced = play(state, content, { kind: 'game', type: 'defend', unit: 'pikemen-1' }).state;

    expect(unitOf(braced, 'pikemen-1').effects.map(({ effect }) => effect)).toStrictEqual(['demo:defending']);
    expect(holderOf(braced)).toBe('skeletons-1');
  });
});

const NEAR: Units = { 'pikemen-1': { cell: '3,1' }, 'skeletons-1': { cell: '4,1' } };

const WIDE: Units = { 'pikemen-1': { cell: '3,1', effects: ['acme:wide'] } };

const ROCK = { cells: ['4,3'], id: 'rock-2', obstacle: 'demo:rock' };

const PUSH: OperationExtension = Object.freeze({
  kind: 'operation',
  name: 'acme:push',
  run: (node: Op, { subjects }: OperationContext): StepResult => {
    const { self } = subjects;
    const to: unknown = node.to;

    if (self?.kind !== 'unit' || typeof to !== 'string') return DONE;

    return { events: [], kind: 'done', steps: [moveDraft({ path: [to], spent: {}, unit: self.unit })] };
  },
  schema: { type: 'object' },
});

const PUSHING = createKernel({ extensions: [...RULES_STDLIB_EXTENSIONS, PUSH] });

const FOREIGN = createKernel({ extensions: [...RULES_STDLIB_EXTENSIONS, { ...STACK_ATTACK, name: 'acme:stacks' }] });

function near(
  change: Units = {},
  options: Partial<BattleOptions> = {},
  scenario: object = {},
): { readonly content: ContentRegistry; readonly state: BattleState } {
  const content = contentWith({ ...withUnits({ ...NEAR, ...change }), ...scenario });

  return { content, state: ready(content, options) };
}

function ready(content: ContentRegistry, options: Partial<BattleOptions> = {}): BattleState {
  return played(started(content, { ruleset: EXTERNAL, ...options }), content, endTurn('griffins-1'));
}

function atArchers(content: ContentRegistry, options: Partial<BattleOptions> = {}): BattleState {
  return played(started(content, options), content, ...['griffins-1', 'pikemen-1', 'skeletons-1'].map(endTurn));
}

function shotAt(content: ContentRegistry, target: string, ...answers: ReadonlyArray<readonly number[]>): Played {
  return answered(atArchers(content, { ruleset: EXTERNAL }), content, shoot('archers-1', target), ...answers);
}

function withAttack(change: object, units: Units, field: object = {}): ContentRegistry {
  const params = { ...STACK_PARAMS, ...change };
  const mechanics: Ruleset['mechanics'] = {
    ...RULESET.mechanics,
    'kernel:attack': { params, variant: 'rules-stdlib:stacks' },
  };

  return contentWith({ ...withUnits(units), field: { ...SCENARIO.field, ...field } }, { mechanics });
}

function withEffects(effects: Readonly<Record<string, Effect>>, units: Units): ContentRegistry {
  const content = contentWith(withUnits({ ...NEAR, ...units }));

  return { ...content, effects: { ...content.effects, ...effects } };
}

function spread(greatest: number): Effect {
  return effectLike('acme:wide', {
    modifiers: [{ attribute: 'core:damage-max', operation: 'override', value: greatest }],
  });
}

function shy(to: string): Effect {
  return effectLike('acme:shy', {
    triggers: [{ on: 'kernel:actions-changed', ops: [{ to, type: 'acme:push' }], priority: 0 }],
  });
}

function effectLike(name: string, change: Partial<Effect>): Effect {
  const base = CONTENT.effects['demo:bless'];

  if (base === undefined) throw new Error('No effect to copy.');

  return { ...base, modifiers: [], name, ...change };
}

function pushed(content: ContentRegistry, ...ended: readonly string[]): BattleState {
  const first = PUSHING.createState({ ruleset: EXTERNAL, scenario: 'demo:field', seed: '5'.repeat(64) }, content);
  const commands: readonly Command[] = [{ kind: 'game', type: 'start-battle' }, ...ended.map(endTurn)];

  return commands.reduce((state, command) => {
    const result = PUSHING.execute(state, command, content);

    if (!result.ok) throw new Error(`${JSON.stringify(command)} is rejected.`);

    return result.state;
  }, first);
}

function attacked(events: readonly BattleEvent[]): readonly unknown[] {
  return eventsOf(events, 'rules-stdlib:attacked').map(({ payload }) => payload);
}

function strikeOf(attacker: string, damage: number, kind: string, target = 'skeletons-1'): object {
  return { attacker, damage, kind, target };
}
