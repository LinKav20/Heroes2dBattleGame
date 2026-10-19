import { describe, expect, it } from 'vitest';
import { createRng, rngRange, type BattleState, type RngState } from '../../index.ts';
import {
  act,
  acted,
  at,
  cell,
  deployed,
  effectsOf,
  endTurn,
  eventsOf,
  holderOfTurn,
  move,
  outcomeOf,
  refusal,
  unitOf,
  use,
  useItem,
  useOfSide,
  wait,
} from './driver.ts';
import { created, SEED } from './world.ts';

describe('a battle at the pass', () => {
  it('gives the first turn to the fastest unit and lets a flier land next to the enemy and strike', () => {
    const result = act(landed(), use('griffins-1', 'demo:strike', at('mage-1')));

    expect(holderOfTurn(deployedBattle())).toBe('griffins-1');
    expect(unitOf(landed(), 'griffins-1').cell).toBe('1,3');
    expect(unitOf(landed(), 'griffins-1').spentActions).toStrictEqual({ 'core:move': 6 });
    expect(unitOf(result.state, 'mage-1')).toMatchObject({ count: 1, health: 2 });
    expect(result.state.variables).toMatchObject({ 'first-blood': true, turns: 1 });
    expect(result.state.triggers['first-blood']).toStrictEqual({ fired: 1 });
    expect(holderOfTurn(result.state)).toBe('mage-1');
    expect(result.state.turns).toStrictEqual([{ holder: GRIFFINS, skipped: false, waited: false }]);
  });

  it('counts the drums of the attacker at the turn of every unit of the attacker', () => {
    expect(struck().variables.drums).toBe(1);
    expect(shot().variables.drums).toBe(2);
    expect(unitOf(knightTurn(), 'knight-1').id).toBe(holderOfTurn(knightTurn()));
    expect(knightTurn().variables.drums).toBe(3);
    expect(knightTurn().sides[0]?.effects).toStrictEqual([]);
  });

  it('heals up to the full health with a potion, which leaves the stack, and keeps the turn for an action', () => {
    const quaffed = act(struck(), useItem('mage-1', 2));

    expect(unitOf(quaffed.state, 'mage-1').health).toBe(8);

    expect(unitOf(quaffed.state, 'mage-1').inventory.map(({ count, id }) => [id, count]))
      .toStrictEqual([[2, 1], [3, 1]]);

    expect(holderOfTurn(quaffed.state)).toBe('mage-1');
  });

  it('hits every unit in the area of a fireball once, with a roll of the generator', () => {
    const before = unitOf(quaffed(), 'griffins-1');
    const burned = act(quaffed(), use('mage-1', 'demo:fireball', cell('2,3')));
    const [die] = rolls(quaffed().rng, 1);

    expect(eventsOf(burned.events, 'kernel:roll-made')).toMatchObject([{ dice: [die] }]);
    expect(unitOf(burned.state, 'griffins-1')).toMatchObject({ count: 2, health: before.health - 2 - (die ?? 0) });
    expect(unitOf(burned.state, 'knight-1').health).toBe(30);
    expect(unitOf(burned.state, 'mage-1').resources['demo:mana']).toBe(6);
    expect(burned.state.rng?.counter).toBe((quaffed().rng?.counter ?? 0) + 1);
    expect(holderOfTurn(burned.state)).toBe('archers-1');
  });

  it('lets a unit wait and go after all the others in the round', () => {
    expect(holderOfTurn(ghostsWaited())).toBe('knight-1');
    expect(ghostsWaited().turns.at(-1)).toStrictEqual({ holder: GHOSTS, skipped: false, waited: true });
    expect(holderOfTurn(golemDone())).toBe('ghosts-1');
    expect(refusal(golemDone(), wait('ghosts-1'))).toStrictEqual(['acme:waited-twice', {}]);
  });

  it('takes the armor of the target and the side into the damage of a strike', () => {
    const griffins = unitOf(knightTurn(), 'griffins-1');
    const struck = act(knightTurn(), use('knight-1', 'demo:strike', at('griffins-1')));

    expect(unitOf(struck.state, 'griffins-1').health).toBe(griffins.health - 5);
    expect(holderOfTurn(struck.state)).toBe('golem-1');
  });

  it('starts the second round with the fastest unit again and the turns of the round forgotten', () => {
    expect(secondRound().round).toBe(2);
    expect(secondRound().turns).toStrictEqual([]);
    expect(holderOfTurn(secondRound())).toBe('griffins-1');
    expect(unitOf(secondRound(), 'ghosts-1').cell).toBe('5,1');
    expect(secondRound().variables.turns).toBe(7);
  });

  it('poisons and silences with a hex and refuses a fireball out of range', () => {
    const hexed = act(mageSecond(), use('mage-1', 'demo:hex', at('griffins-1')));

    expect(effectsOf(hexed.state, 'griffins-1')).toStrictEqual(['demo:poison', 'demo:silence']);
    expect(unitOf(hexed.state, 'griffins-1').tags).toStrictEqual({});
    expect(unitOf(hexed.state, 'mage-1').resources['demo:mana']).toBe(3);

    expect(refusal(mageSecond(), use('mage-1', 'demo:fireball', cell('5,1')))).toStrictEqual([
      'kernel:invalid-targets',
      { ability: 'demo:fireball', problem: 'range', target: 0 },
    ]);
  });

  it('burns a unit that teleports into the fire, killing the wounded creature first', () => {
    const ghosts = unitOf(ghostsSecond(), 'ghosts-1');
    const burned = act(ghostsSecond(), move('ghosts-1', '4,1'));

    expect(ghosts).toMatchObject({ count: 3, health: 2 });
    expect(unitOf(burned.state, 'ghosts-1')).toMatchObject({ cell: '4,1', count: 2, health: 5, zones: ['fire'] });
    expect(holderOfTurn(burned.state)).toBe('ghosts-1');
  });

  it('lets a side rally a unit in the turn of the unit, once a round, so it goes further and strikes', () => {
    const rallied = act(knightSecond(), useOfSide('attacker', 'demo:rally', at('knight-1')));
    const moved = act(rallied.state, move('knight-1', '4,2'));
    const struck = act(moved.state, use('knight-1', 'demo:strike', at('ghosts-1')));

    expect(effectsOf(rallied.state, 'knight-1')).toStrictEqual(['demo:haste']);

    expect(refusal(rallied.state, useOfSide('attacker', 'demo:rally', at('knight-1')))).toStrictEqual([
      'kernel:use-limit',
      { ability: 'demo:rally', per: 'round' },
    ]);

    expect(unitOf(moved.state, 'knight-1').spentActions).toStrictEqual({ 'core:move': 5 });
    expect(refusal(knightSecond(), move('knight-1', '4,2'))).toStrictEqual(['kernel:unreachable', { cell: '4,2' }]);
    expect(unitOf(struck.state, 'ghosts-1')).toMatchObject({ count: 1, health: 6 });
    expect(holderOfTurn(struck.state)).toBe('golem-1');
  });

  it('ticks the poison of the griffins at their turn and gives the reinforcements in the third round', () => {
    const third = acted(golemSecond(), [endTurn('golem-1')]);
    const griffins = unitOf(golemSecond(), 'griffins-1');

    expect(third.round).toBe(3);
    expect(third.variables.reinforced).toBe(true);
    expect(holderOfTurn(third)).toBe('griffins-1');
    expect(unitOf(third, 'griffins-1').health).toBe(griffins.health - 2);
    expect(effectsOf(third, 'knight-1')).toStrictEqual(['demo:haste']);
  });

  it('ends with the defender holding the pass when the rounds run out', () => {
    let state = golemSecond();

    while (state.phase.kind !== 'ended') {
      const holder = holderOfTurn(state);

      if (holder === undefined) throw new Error('Nobody has the turn');

      state = act(state, endTurn(holder)).state;
    }

    expect(state.round).toBe(7);

    expect(outcomeOf(state))
      .toStrictEqual({ condition: 'held', kind: 'victory', side: 'defender', winners: ['defender'] });

    expect(state.variables.turns).toBeGreaterThan(golemSecond().variables.turns as number);
  });
});

const GRIFFINS = { kind: 'unit', unit: 'griffins-1' } as const;

const GHOSTS = { kind: 'unit', unit: 'ghosts-1' } as const;

function deployedBattle(): BattleState {
  return deployed(created());
}

function landed(): BattleState {
  return act(deployedBattle(), move('griffins-1', '1,3')).state;
}

function struck(): BattleState {
  return act(landed(), use('griffins-1', 'demo:strike', at('mage-1'))).state;
}

function quaffed(): BattleState {
  return act(struck(), useItem('mage-1', 2)).state;
}

function burned(): BattleState {
  return act(quaffed(), use('mage-1', 'demo:fireball', cell('2,3'))).state;
}

function shot(): BattleState {
  return act(burned(), use('archers-1', 'demo:shoot', at('griffins-1'))).state;
}

function ghostsWaited(): BattleState {
  return act(shot(), wait('ghosts-1')).state;
}

function knightTurn(): BattleState {
  return ghostsWaited();
}

function golemDone(): BattleState {
  return acted(knightTurn(), [
    use('knight-1', 'demo:strike', at('griffins-1')),
    move('golem-1', '5,2', 'west'),
    endTurn('golem-1'),
  ]);
}

function secondRound(): BattleState {
  return acted(golemDone(), [move('ghosts-1', '5,1'), endTurn('ghosts-1')]);
}

function mageSecond(): BattleState {
  return act(secondRound(), use('griffins-1', 'demo:strike', at('knight-1'))).state;
}

function ghostsSecond(): BattleState {
  return acted(mageSecond(), [
    use('mage-1', 'demo:hex', at('griffins-1')),
    use('archers-1', 'demo:shoot', at('ghosts-1')),
  ]);
}

function knightSecond(): BattleState {
  return acted(ghostsSecond(), [move('ghosts-1', '4,1'), endTurn('ghosts-1')]);
}

function golemSecond(): BattleState {
  return acted(knightSecond(), [
    useOfSide('attacker', 'demo:rally', at('knight-1')),
    move('knight-1', '4,2'),
    use('knight-1', 'demo:strike', at('ghosts-1')),
  ]);
}

function rolls(rng: RngState | undefined, count: number): readonly number[] {
  let current = rng ?? createRng(SEED);

  return Array.from({ length: count }, () => {
    const drawn = rngRange(current, 1, 6);

    if (!drawn.ok) throw new Error('No roll');

    current = drawn.rng;

    return drawn.value;
  });
}
