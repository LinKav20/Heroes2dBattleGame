import { describe, expect, it } from 'vitest';
import type { BattleState } from '../../model/index.ts';
import {
  ABILITY_CONTENT,
  execute,
  READY,
  reason,
  useAbility,
  used,
  useItem,
  withArchers,
} from '../../tests/abilities.ts';
import { ARCHERS, PIKEMEN, run, types } from '../../tests/battle.ts';
import { unitOf } from '../../tests/fixtures.ts';
import { abilityTickDraft } from '../index.ts';

describe('kernel:ability-tick', () => {
  it('starts the uses of the turn again, shortens cooldowns and gives back the actions at the start of a turn', () => {
    const uses = [{ ability: 'demo:fire-arrow', battle: 1, cooldown: 2, round: 1, turn: 1 }];
    const state = withArchers(READY, { abilityUses: uses, spentActions: { 'core:action': 1 } });
    const result = run(state, ABILITY_CONTENT, abilityTickDraft({ holder: ARCHERS, moment: 'holder-turn-start' }));
    const archers = unitOf(result.state, 'archers-1');
    const pikemenTurn = abilityTickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' });

    expect(types(result)).toStrictEqual(['kernel:ability-uses-changed', 'kernel:actions-changed']);
    expect(archers.abilityUses).toStrictEqual([{ ...uses[0], cooldown: 1, turn: 0 }]);
    expect(archers.spentActions).toStrictEqual({});
    expect(run(result.state, ABILITY_CONTENT, pikemenTurn).events).toStrictEqual([]);
  });

  it('gives back spent actions of a unit without uses, and starts the turn of a side', () => {
    const spent = withArchers(READY, { spentActions: { 'core:action': 1 } });
    const rally = [{ ability: 'demo:rally', battle: 1, cooldown: 1, round: 1, turn: 1 }];
    const side: BattleState = {
      ...READY,
      sides: READY.sides.map((current) => (current.id === 'attacker' ? { ...current, abilityUses: rally } : current)),
    };
    const sideTurn = run(side, ABILITY_CONTENT, abilityTickDraft({
      holder: { kind: 'side', side: 'attacker' },
      moment: 'holder-turn-start',
    }));

    expect(types(run(spent, ABILITY_CONTENT, abilityTickDraft({ holder: ARCHERS, moment: 'holder-turn-start' }))))
      .toStrictEqual(['kernel:actions-changed']);

    expect(sideTurn.events.map(({ payload, visibleTo }) => [payload, visibleTo])).toStrictEqual([
      [{ holder: { kind: 'side', side: 'attacker' }, uses: [{ ...rally[0], cooldown: 0, turn: 0 }] }, 'all'],
    ]);
  });

  it('starts the uses of the round again for every unit and side at the start of a round', () => {
    const rally = [{ ability: 'demo:rally', battle: 1, cooldown: 0, round: 1, turn: 1 }];
    const arrow = { ability: 'demo:fire-arrow', battle: 1, cooldown: 1, round: 1, turn: 0 };
    const state: BattleState = {
      ...withArchers(READY, { abilityUses: [arrow], resources: { 'demo:mana': 5 } }),
      sides: READY.sides.map((side) => (side.id === 'attacker' ? { ...side, abilityUses: rally } : side)),
    };
    const result = run(state, ABILITY_CONTENT, abilityTickDraft({ moment: 'round-start' }));

    expect(result.events.map(({ payload }) => payload)).toStrictEqual([
      { holder: ARCHERS, uses: [{ ...arrow, round: 0 }] },
      { holder: { kind: 'side', side: 'attacker' }, uses: [{ ...rally[0], round: 0 }] },
    ]);
  });

  it('restores the resources of a unit to their bound at the moment they are restored', () => {
    const drained = withArchers(READY, { resources: { 'demo:mana': 1 } });
    const round = run(drained, ABILITY_CONTENT, abilityTickDraft({ moment: 'round-start' }));
    const turn = run(drained, ABILITY_CONTENT, abilityTickDraft({ holder: ARCHERS, moment: 'holder-turn-start' }));
    const byTurn = withRestore('turn');
    const turnly = run(drained, byTurn, abilityTickDraft({ holder: ARCHERS, moment: 'holder-turn-start' }));

    expect(round.events.map(({ payload, visibleTo }) => [payload, visibleTo])).toStrictEqual([
      [{ resource: 'demo:mana', unit: 'archers-1', value: 5 }, 'all'],
    ]);

    expect(unitOf(round.state, 'archers-1').resources).toStrictEqual({ 'demo:mana': 5 });
    expect(types(turn)).toStrictEqual([]);
    expect(unitOf(turnly.state, 'archers-1').resources).toStrictEqual({ 'demo:mana': 5 });
    expect(types(run(drained, byTurn, abilityTickDraft({ moment: 'round-start' })))).toStrictEqual([]);
  });

  it('keeps a resource above its bound and restores nothing for a unit with no creatures left', () => {
    const above = withArchers(READY, { resources: { 'demo:mana': 9 } });
    const dead = withArchers(READY, { count: 0, health: 0, resources: { 'demo:mana': 1 } });
    const unset = withArchers(READY, { resources: {} });

    expect(types(run(above, ABILITY_CONTENT, abilityTickDraft({ moment: 'round-start' })))).toStrictEqual([]);

    expect(types(run(dead, ABILITY_CONTENT, abilityTickDraft({ moment: 'round-start' })))).not.toContain(
      'kernel:resource-changed',
    );

    const filled = run(unset, ABILITY_CONTENT, abilityTickDraft({ moment: 'round-start' }));

    expect(unitOf(filled.state, 'archers-1').resources).toStrictEqual({ 'demo:mana': 5 });
  });

  it('counts one ability given by an item and by the creature together', () => {
    const equipped = withArchers(READY, { inventory: [{ count: 1, id: 9, item: 'demo:bow', slot: 'hands' }] });
    const content = withLimit();
    const once = used(equipped, useItem(9, [PIKEMEN]), content);

    expect(reason(execute(once.state, useAbility('demo:volley', [PIKEMEN]), content)))
      .toStrictEqual(['kernel:use-limit', { ability: 'demo:volley', per: 'turn' }]);
  });
});

function withLimit(): typeof ABILITY_CONTENT {
  const volley = ABILITY_CONTENT.abilities['demo:volley'];

  if (volley === undefined) throw new Error('No volley');

  const limited = { ...volley, limits: { perTurn: 1 } };

  return { ...ABILITY_CONTENT, abilities: { ...ABILITY_CONTENT.abilities, 'demo:volley': limited } };
}

function withRestore(restore: 'round' | 'turn'): typeof ABILITY_CONTENT {
  const archer = ABILITY_CONTENT.creatures['demo:archer'];

  if (archer === undefined) throw new Error('No archer');

  const resources = { 'demo:mana': { initial: 'full', limit: 'demo:mana', restore } } as const;

  return { ...ABILITY_CONTENT, creatures: { ...ABILITY_CONTENT.creatures, 'demo:archer': { ...archer, resources } } };
}
