import { describe, expect, it } from 'vitest';
import type { ContentRegistry, GameCommand } from '../../index.ts';
import { act, acted, at, begin, effectsOf, refusal, unitOf, use, wait } from './driver.ts';
import { arena, SKIRMISH } from './world.ts';

describe('a battle where the sides take turns', () => {
  it('lets every unit of the side act in its turn and passes the turn when all of them have acted', () => {
    const { drive, state } = begin(SIDES);
    const knight = act(state, use('knight-1', 'demo:strike', at('golem-1')), drive).state;
    const archers = act(knight, use('archers-1', 'demo:shoot', at('golem-1')), drive).state;
    const passed = act(archers, use('mage-1', 'demo:hex', at('golem-1')), drive).state;

    expect(state.phase).toStrictEqual({ kind: 'turn', side: 'attacker' });

    expect(refusal(knight, use('knight-1', 'demo:strike', at('golem-1')), drive)).toStrictEqual([
      'kernel:not-enough-actions',
      { action: 'core:action' },
    ]);

    expect(refusal(knight, wait('mage-1'), drive)).toStrictEqual(['kernel:not-available', {}]);

    expect(refusal(knight, use('golem-1', 'demo:strike', at('knight-1')), drive)).toStrictEqual([
      'kernel:not-your-turn',
      {},
    ]);

    expect(unitOf(archers, 'golem-1')).toMatchObject({ health: 35 });
    expect(passed.phase).toStrictEqual({ kind: 'turn', side: 'defender' });
    expect(effectsOf(passed, 'golem-1')).toStrictEqual(['demo:rage', 'demo:silence']);
  });

  it('counts the effects of a side once in its turn and the effects of its units in the turn of the side', () => {
    const { drive, state } = begin(SIDES);
    const passed = acted(state, [
      use('knight-1', 'demo:strike', at('golem-1')),
      use('archers-1', 'demo:shoot', at('golem-1')),
      use('mage-1', 'demo:hex', at('golem-1')),
    ], drive);
    const second = acted(passed, [use('golem-1', 'demo:strike', at('knight-1')), END_DEFENDER], drive);

    expect(state.variables.drums).toBe(1);
    expect(state.sides[0]?.effects[0]?.remaining).toBe(2);
    expect(second.round).toBe(2);
    expect(second.variables.drums).toBe(2);
    expect(unitOf(second, 'knight-1')).toMatchObject({ health: 26, spentActions: {} });
    expect(effectsOf(second, 'golem-1')).toStrictEqual(['demo:rage']);
    expect(second.turns).toStrictEqual([]);
  });
});

const END_DEFENDER: GameCommand = { kind: 'game', side: 'defender', type: 'end-turn' };

const SIDES: ContentRegistry = {
  ...arena({ 'archers-1': '1,1', 'ghosts-1': '6,0', 'golem-1': '4,2', 'knight-1': '3,2', 'mage-1': '1,3' }),
  rulesets: {
    'demo:skirmish': {
      ...SKIRMISH,
      mechanics: { ...SKIRMISH.mechanics, 'kernel:turn-order': { variant: 'acme:sides' } },
      turnOwner: 'side',
    },
  },
};
