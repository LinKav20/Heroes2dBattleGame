import { describe, expect, it } from 'vitest';
import type { BattleEvent, ExtensionCommand, FinishDeploymentCommand } from '../../model/index.ts';
import { asRecord, node } from '../../tests/fixtures.ts';
import { KERNEL, place, play, withScenario } from './helpers.ts';

describe('scenario triggers', () => {
  it('checks the triggers of events before an input request right above the end of the action', () => {
    const content = withScenario({
      triggers: [{
        condition: node('kernel:variable-is', { value: true, variable: 'acted' }),
        id: 'echo',
        limit: 1,
        on: 'kernel:variable-set',
        ops: [node('kernel:set-variable', { value: true, variable: 'echo' })],
        priority: 0,
      }],
      variables: { acted: false },
    });
    const created = KERNEL.createState({ scenario: 'demo:duel' }, content);
    const randomSources = { 'core:morale': 'external' } as const;
    const external = { ...created, ruleset: { ...created.ruleset, randomSources } };
    const ready = play(play(external, place('archers-1', '0,1'), content).state, finish(), content).state;
    const paused = play(ready, act(), content);
    const answered = play(paused.state, { kind: 'answer', request: 1, value: { dice: [3], kind: 'roll' } }, content);

    expect(paused.state.steps.map(({ type }) => type)).toStrictEqual([
      'kernel:action-end',
      'kernel:outcome-check',
      'kernel:scenario-check',
      'acme:mark',
      'acme:ask',
    ]);

    expect(answered.events.filter(({ type }) => type === 'kernel:variable-set' || type === 'kernel:trigger-fired')
      .map(({ payload }) => asRecord(payload).variable ?? asRecord(payload).trigger))
      .toStrictEqual(['asked', 'after', 'echo', 'echo']);

    expect(paused.state.variables.echo).toBeUndefined();
    expect(answered.state.variables).toMatchObject({ acted: true, asked: true, echo: true });
    expect(answered.state.triggers.echo).toStrictEqual({ fired: 1 });
  });
});

describe('the check of scenario triggers', () => {
  it('migrates the events of its firings and keeps its parameters when nothing changes', () => {
    const kind = KERNEL.registries.steps.get('kernel:scenario-check');
    const old: BattleEvent = { id: 0, payload: { unit: 'archers-1' }, type: 'acme:hit', version: 1, visibleTo: 'all' };
    const params = { firings: [{ trigger: 'turn' }, { event: old, trigger: 'hit' }] };

    if (kind?.migrateEvents === undefined) throw new Error('No migration of events');

    expect(kind.migrateEvents(params, (event) => ({ ...event, version: 2 }))).toStrictEqual({
      firings: [{ trigger: 'turn' }, { event: { ...old, version: 2 }, trigger: 'hit' }],
    });

    expect(kind.migrateEvents(params, (event) => event)).toBe(params);
  });
});

function finish(): FinishDeploymentCommand {
  return { kind: 'game', side: 'attacker', type: 'finish-deployment' };
}

function act(): ExtensionCommand {
  return { kind: 'game', name: 'acme:act', payload: {}, type: 'extension' };
}
