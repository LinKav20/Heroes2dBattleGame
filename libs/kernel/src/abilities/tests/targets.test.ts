import { describe, expect, it } from 'vitest';
import type { Ability, ContentRegistry } from '../../content/index.ts';
import { MAX_STACK_DEPTH, type ExecuteAccepted } from '../../execution/index.ts';
import type { BattleState, Command } from '../../model/index.ts';
import { ABILITY_CONTENT, READY, used, useAbility, VOLLEY } from '../../tests/abilities.ts';
import { ARCHERS, KERNEL, PIKEMEN, run, withUnitEffects } from '../../tests/battle.ts';
import { accepted, applied, effect, node, unitOf } from '../../tests/fixtures.ts';

describe('kernel:ability-targets', () => {
  it('takes every target when its turn comes, after the reactions to the use, and passes over one that died', () => {
    const doomed = withUnitEffects(READY, 'pikemen-1', [applied(9, 'demo:doom')]);
    const result = used(doomed, useAbility('demo:volley', [PIKEMEN, ARCHERS]), DOOMED);

    expect(healthChanges(result)).toStrictEqual([
      { count: 0, health: 0, unit: 'pikemen-1' },
      { count: 10, health: 6, unit: 'archers-1' },
    ]);
  });

  it('saves the targets left when an operation waits for a roll from outside, and pays once', () => {
    const first = used(EXTERNAL, useAbility('demo:volley', [PIKEMEN, ARCHERS]), ROLLED);
    const second = answered(first.state, 3);
    const last = answered(second.state, 4);
    const saved = first.state.steps.find(({ type }) => type === 'kernel:ability-targets');

    expect(saved?.params)
      .toStrictEqual({ ability: 'demo:volley', next: 1, targets: [PIKEMEN, ARCHERS], user: ARCHERS });

    expect(healthChanges(second)).toStrictEqual([{ count: 20, health: 7, unit: 'pikemen-1' }]);
    expect(second.state.inputRequest).toBeDefined();
    expect(healthChanges(last)).toStrictEqual([{ count: 10, health: 3, unit: 'archers-1' }]);
    expect(last.state.steps).toStrictEqual([]);
    expect(unitOf(last.state, 'archers-1').spentActions).toStrictEqual({ 'core:action': 1 });

    expect(unitOf(last.state, 'archers-1').abilityUses)
      .toStrictEqual([{ ability: 'demo:volley', battle: 1, cooldown: 0, round: 1, turn: 1 }]);
  });

  it('keeps the operations of one target at a time on the stack', () => {
    const many = Math.floor(MAX_STACK_DEPTH / 2) + 2;
    const busy = withAbility({ ...VOLLEY, ops: Array.from({ length: many }, () => STRIKE) });
    const result = used(READY, useAbility('demo:volley', [PIKEMEN, ARCHERS]), busy);

    expect(many * 2).toBeGreaterThan(MAX_STACK_DEPTH);
    expect(unitOf(result.state, 'pikemen-1').count).toBeLessThan(20);
    expect(unitOf(result.state, 'archers-1').count).toBe(0);
  });

  it('cannot be put on the stack by a package, like the step that uses an ability', () => {
    const use = { params: { ability: 'demo:shout', targets: [], user: ARCHERS }, type: 'kernel:ability-use' };
    const params = { ability: 'demo:shout', next: 0, targets: [], user: ARCHERS };
    const targets = { params, type: 'kernel:ability-targets' };

    expect(() => run(READY, ABILITY_CONTENT, use))
      .toThrow('"acme:run" adds the step "kernel:ability-use", but only the kernel adds such steps.');

    expect(() => run(READY, ABILITY_CONTENT, targets)).toThrow('adds the step "kernel:ability-targets"');
  });
});

const STRIKE = node('kernel:damage', { amount: 1, to: 'target' });

const KILL_SELF = node('kernel:damage', { amount: 1000, to: 'self' });

const DOOMED: ContentRegistry = {
  ...ABILITY_CONTENT,
  effects: {
    ...ABILITY_CONTENT.effects,
    'demo:doom': effect('demo:doom', {
      triggers: [{ on: 'kernel:ability-used', ops: [KILL_SELF], priority: 0 }],
    }),
  },
};

const ROLLED = withAbility({
  ...VOLLEY,
  cost: { actions: { 'core:action': 1 }, resources: {} },
  ops: [node('kernel:damage', {
    amount: node('kernel:dice', { count: 1, name: 'core:damage-roll', sides: 6 }),
    to: 'target',
  })],
});

const EXTERNAL: BattleState = {
  ...READY,
  ruleset: { ...READY.ruleset, randomSources: { ...READY.ruleset.randomSources, 'core:damage-roll': 'external' } },
};

function answered(state: BattleState, die: number): ExecuteAccepted {
  const request = state.inputRequest?.id ?? 0;
  const answer: Command = { kind: 'answer', request, value: { dice: [die], kind: 'roll' } };

  return accepted(KERNEL.execute(state, answer, ROLLED));
}

function healthChanges(result: ExecuteAccepted): readonly unknown[] {
  return result.events.filter(({ type }) => type === 'kernel:health-changed').map(({ payload }) => payload);
}

function withAbility(changed: Ability): ContentRegistry {
  return { ...ABILITY_CONTENT, abilities: { ...ABILITY_CONTENT.abilities, [changed.name]: changed } };
}
