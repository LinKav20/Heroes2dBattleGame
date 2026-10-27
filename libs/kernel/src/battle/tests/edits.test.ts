import { describe, expect, it } from 'vitest';
import type { ContentRegistry, Effect, Scenario } from '../../content/index.ts';
import type { ExecuteAccepted } from '../../execution/index.ts';
import type { OperationExtension } from '../../extensions/index.ts';
import { canSee, type Visibility } from '../../ids/index.ts';
import { hashJson } from '../../json/index.ts';
import type { AppliedEffect, BattleState, Command, StateEdit } from '../../model/index.ts';
import { effect, node, unitOf } from '../../tests/fixtures.ts';
import { turnCheckDraft } from '../index.ts';
import {
  BRACE,
  CONTENT,
  CREATED,
  KERNEL,
  kernelWith,
  move,
  ORDER,
  play,
  PLACED,
  reason,
  SCENARIO,
  SIDES,
  withScenario,
} from './helpers.ts';

describe('state edits', () => {
  it('set the creatures and the health of a unit, seen as the unit is', () => {
    const result = play(PLACED, edit({ count: 7, health: 3, type: 'set-health', unit: 'pikemen-1' }));

    expect(result.events.filter(({ type }) => type === 'kernel:health-changed').map(({ payload, visibleTo }) =>
      [payload, visibleTo])).toStrictEqual([[{ count: 7, health: 3, unit: 'pikemen-1' }, 'all']]);

    expect(unitOf(result.state, 'pikemen-1')).toMatchObject({ count: 7, health: 3 });
  });

  it.each([
    { change: { count: 21, health: 5 }, field: 'count', name: 'more creatures than the unit started with' },
    { change: { count: -1, health: 5 }, field: 'count', name: 'fewer than no creatures' },
    { change: { count: 1.5, health: 5 }, field: 'count', name: 'a part of a creature' },
    { change: { count: 3, health: 0 }, field: 'health', name: 'no health for living creatures' },
    { change: { count: 3, health: 11 }, field: 'health', name: 'more than the full health of a creature' },
    { change: { count: 0, health: 4 }, field: 'health', name: 'health for no creatures' },
  ])('refuse to set $name', ({ change, field }) => {
    const command = edit({ ...change, type: 'set-health', unit: 'pikemen-1' });

    expect(reason(KERNEL.execute(PLACED, command, CONTENT))).toStrictEqual(['kernel:invalid-command', { field }]);
  });

  it('bring a dead unit back only where it can stand', () => {
    const dead = play(PLACED, edit({ count: 0, health: 0, type: 'set-health', unit: 'archers-1' })).state;
    const back = play(dead, edit({ count: 2, health: 10, type: 'set-health', unit: 'archers-1' })).state;
    const taken = play(dead, edit({ cell: '0,1', type: 'move-unit', unit: 'pikemen-1' })).state;
    const lost = withoutCell(dead, 'archers-1');

    expect(unitOf(back, 'archers-1')).toMatchObject({ cell: '0,1', count: 2, health: 10 });
    const revive = edit({ count: 2, health: 10, type: 'set-health', unit: 'archers-1' });

    expect(reason(KERNEL.execute(taken, revive, CONTENT))).toStrictEqual(['kernel:cannot-stand', { cell: '0,1' }]);
    expect(reason(KERNEL.execute(lost, revive, CONTENT))).toStrictEqual(['kernel:not-on-field', { unit: 'archers-1' }]);
  });

  it('end the battle when an edit kills the last unit of a side', () => {
    const result = play(PLACED, edit({ count: 0, health: 0, type: 'set-health', unit: 'pikemen-1' }));

    expect(result.state.phase).toMatchObject({ kind: 'ended', outcome: { condition: 'rout', side: 'attacker' } });

    expect(reason(KERNEL.execute(result.state, edit({ count: 1, health: 1, type: 'set-health', unit: 'pikemen-1' }),
      CONTENT))).toStrictEqual(['kernel:battle-over', {}]);
  });

  it('end the turn of a unit that an edit kills, and give the next turn', () => {
    expect(PLACED.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });

    const result = play(PLACED, edit({ count: 0, health: 0, type: 'set-health', unit: 'archers-1' }));

    expect(result.events.map(({ type }) => type)).toContain('kernel:turn-ended');
    expect(result.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('set a resource of a unit from 0 to its limit, and refuse others', () => {
    const result = play(PLACED, edit({ resource: 'demo:mana', type: 'set-resource', unit: 'archers-1', value: 2 }));

    expect(unitOf(result.state, 'archers-1').resources['demo:mana']).toBe(2);

    expect(result.events.filter(({ type }) => type === 'kernel:resource-changed').map(({ payload }) => payload))
      .toStrictEqual([{ resource: 'demo:mana', unit: 'archers-1', value: 2 }]);

    expect([
      edit({ resource: 'demo:mana', type: 'set-resource', unit: 'archers-1', value: 6 }),
      edit({ resource: 'demo:mana', type: 'set-resource', unit: 'archers-1', value: -1 }),
      edit({ resource: 'demo:gold', type: 'set-resource', unit: 'archers-1', value: 1 }),
      edit({ resource: 'demo:mana', type: 'set-resource', unit: 'pikemen-1', value: 1 }),
      edit({ resource: 'demo:mana', type: 'set-resource', unit: 'nobody-1', value: 1 }),
    ].map((command) => reason(KERNEL.execute(PLACED, command, CONTENT)))).toStrictEqual([
      ['kernel:invalid-command', { field: 'value' }],
      ['kernel:invalid-command', { field: 'value' }],
      ['kernel:invalid-command', { field: 'resource' }],
      ['kernel:invalid-command', { field: 'resource' }],
      ['kernel:invalid-command', { field: 'unit' }],
    ]);
  });

  it('apply an effect to a unit or a side as an operation does, and refuse what is not there', () => {
    const steady = edit({ effect: 'demo:steady', params: { level: 2 }, target: PIKEMEN, type: 'apply-effect' });
    const unit = play(PLACED, steady);
    const side = play(PLACED, edit({
      effect: 'demo:blessing',
      params: {},
      target: { kind: 'side', side: 'defender' },
      type: 'apply-effect',
    }));

    expect(unitOf(unit.state, 'pikemen-1').effects.map(({ effect: name, params }) => [name, params]))
      .toStrictEqual([['demo:poison', {}], ['demo:steady', { level: 2 }]]);

    expect(side.state.sides.find(({ id }) => id === 'defender')?.effects.map(({ effect: name }) => name))
      .toStrictEqual(['demo:blessing']);

    expect([
      edit({ effect: 'demo:nothing', params: {}, target: PIKEMEN, type: 'apply-effect' }),
      edit({ effect: 'demo:steady', params: {}, target: { kind: 'unit', unit: 'nobody-1' }, type: 'apply-effect' }),
      edit({ effect: 'demo:steady', params: {}, target: { kind: 'side', side: 'nobody' }, type: 'apply-effect' }),
    ].map((command) => reason(KERNEL.execute(PLACED, command, CONTENT)))).toStrictEqual([
      ['kernel:invalid-command', { field: 'effect' }],
      ['kernel:invalid-command', { field: 'target' }],
      ['kernel:invalid-command', { field: 'target' }],
    ]);
  });

  it('remove an applied effect of a unit, and refuse one the holder does not have', () => {
    const poison = unitOf(PLACED, 'pikemen-1').effects[0]?.id ?? -1;
    const result = play(PLACED, edit({ effect: poison, target: PIKEMEN, type: 'remove-effect' }));

    expect(result.events.map(({ type }) => type)).toContain('kernel:effect-removed');
    expect(unitOf(result.state, 'pikemen-1').effects).toStrictEqual([]);

    expect([
      edit({ effect: poison + 100, target: PIKEMEN, type: 'remove-effect' }),
      edit({ effect: poison, target: { kind: 'unit', unit: 'archers-1' }, type: 'remove-effect' }),
      edit({ effect: poison, target: { kind: 'unit', unit: 'nobody-1' }, type: 'remove-effect' }),
    ].map((command) => reason(KERNEL.execute(PLACED, command, CONTENT)))).toStrictEqual([
      ['kernel:invalid-command', { field: 'effect' }],
      ['kernel:invalid-command', { field: 'effect' }],
      ['kernel:invalid-command', { field: 'target' }],
    ]);
  });

  it('move a unit at once, bring the zones up to date, and turn a unit where it stands', () => {
    const moved = play(PLACED, edit({ cell: '2,2', type: 'move-unit', unit: 'archers-1' }));
    const turned = play(PLACED, edit({ cell: '0,1', facing: 'west', type: 'move-unit', unit: 'archers-1' }));

    expect(moved.events.filter(({ type }) => type === 'kernel:unit-moved').map(({ payload }) => payload))
      .toStrictEqual([{ path: ['2,2'], unit: 'archers-1' }]);

    expect(unitOf(moved.state, 'archers-1')).toMatchObject({ cell: '2,2', spentActions: {}, zones: ['embers'] });
    expect(unitOf(turned.state, 'archers-1')).toMatchObject({ cell: '0,1', facing: 'west' });
  });

  it.each([
    { change: { cell: '9,9' }, expected: ['kernel:invalid-command', { field: 'cell' }], name: 'off the field' },
    { change: { cell: '2,0' }, expected: ['kernel:cannot-stand', { cell: '2,0' }], name: 'onto a rock' },
    { change: { cell: '4,1' }, expected: ['kernel:cannot-stand', { cell: '4,1' }], name: 'onto another unit' },
    { change: { cell: '0,1' }, expected: ['kernel:invalid-command', { field: 'cell' }], name: 'where it stands' },
    {
      change: { cell: '1,1', facing: 'north' },
      expected: ['kernel:invalid-command', { field: 'facing' }],
      name: 'facing a direction the field does not have',
    },
  ])('refuse to move a unit $name', ({ change, expected }) => {
    const command = edit({ type: 'move-unit', unit: 'archers-1', ...change });

    expect(reason(KERNEL.execute(PLACED, command, CONTENT))).toStrictEqual(expected);
  });

  it('refuse to move a dead unit, one off the field and one not in the battle', () => {
    const dead = play(PLACED, edit({ count: 0, health: 0, type: 'set-health', unit: 'archers-1' })).state;

    expect([
      reason(KERNEL.execute(dead, edit({ cell: '1,1', type: 'move-unit', unit: 'archers-1' }), CONTENT)),
      reason(KERNEL.execute(CREATED, edit({ cell: '1,1', type: 'move-unit', unit: 'archers-1' }), CONTENT)),
      reason(KERNEL.execute(PLACED, edit({ cell: '1,1', type: 'move-unit', unit: 'nobody-1' }), CONTENT)),
    ]).toStrictEqual([
      ['kernel:unit-dead', { unit: 'archers-1' }],
      ['kernel:not-on-field', { unit: 'archers-1' }],
      ['kernel:invalid-command', { field: 'unit' }],
    ]);
  });

  it('let neither effects nor scenario triggers react to an edit, though both react to a move', () => {
    const content = watched();
    const state = KERNEL.createState({ scenario: 'demo:duel' }, content);
    const placed = [
      { cell: '0,1', kind: 'game', type: 'place-unit', unit: 'archers-1' },
      { kind: 'game', side: 'attacker', type: 'finish-deployment' },
    ].reduce<BattleState>((current, command) => play(current, command as Command, content).state, state);
    const edited = play(placed, edit({ cell: '1,1', type: 'move-unit', unit: 'archers-1' }), content).state;
    const walked = play(placed, move('archers-1', '1,1'), content).state;

    expect([edited.variables.moved, edited.variables.watched]).toStrictEqual([false, false]);
    expect([walked.variables.moved, walked.variables.watched]).toStrictEqual([true, true]);
  });

  it('bring the marks of activity up to date without reactions, so a changed condition starts no chain', () => {
    const content = trapped();
    const placed = placedWith(content);
    const toggle = edit({ effect: 'acme:toggle', params: {}, target: PIKEMEN, type: 'apply-effect' });
    const edited = play(placed, toggle, content);
    const walked = play(placed, move('archers-1', '1,1'), content);
    const fragile = unitOf(edited.state, 'pikemen-1').effects.find(({ effect: name }) => name === 'demo:fragile');

    expect(fragile?.active).toBe(true);
    expect(edited.events.map(({ type }) => type)).toContain('kernel:effect-changed');
    expect(unitOf(edited.state, 'pikemen-1')).toMatchObject({ count: 20, health: 10 });
    expect([edited.state.phase.kind, edited.state.variables.noticed]).toStrictEqual(['turn', false]);

    expect(unitOf(walked.state, 'pikemen-1').count).toBe(0);
    expect([walked.state.phase.kind, walked.state.variables.noticed]).toStrictEqual(['ended', true]);
  });

  it('let the end of the turn and the next turn that an edit causes go as usual', () => {
    const result = play(PLACED, edit({ count: 0, health: 0, type: 'set-health', unit: 'archers-1' }));
    const types = result.events.map(({ type }) => type);
    const fired = result.events
      .filter(({ type }) => type === 'kernel:trigger-fired')
      .map(({ payload }) => (payload as { readonly trigger: string }).trigger);

    expect(types.indexOf('kernel:turn-ended')).toBeLessThan(types.lastIndexOf('kernel:trigger-fired'));
    expect(fired).toStrictEqual(['turn-later', 'turn']);
    expect(result.state.variables.order).toBe('first');
  });

  it.each([
    { answer: 1, name: 'the answer', rejected: false },
    { answer: 2, name: 'the abort after the answer', rejected: true },
  ])('bring auras and zones up to date after $name to an edit that applies an effect and waits for a roll', (row) => {
    const content = beacons();
    const placed = placedWith(content);
    const beacon = edit({ effect: 'acme:beacon', params: {}, target: ARCHERS, type: 'apply-effect' });
    const paused = play(placed, beacon, content);
    const answered = play(paused.state, roll(paused.state.inputRequest?.id ?? -1, row.answer), content);
    const types = answered.events.map(({ type }) => type);

    expect(paused.state.inputRequest).toMatchObject({ kind: 'roll', name: 'acme:roll' });
    expect(types.includes('kernel:command-aborted')).toBe(row.rejected);
    expect(answered.state.variables.lit).toBe(row.rejected ? false : Number.MAX_SAFE_INTEGER);
    expect(unitOf(answered.state, 'archers-1').effects.map(({ effect: name }) => name)).toContain('acme:beacon');
    expect(unitOf(answered.state, 'pikemen-1').auras).toStrictEqual(['demo:blessing']);
    expect(KERNEL.attributes(answered.state, content, PIKEMEN)['core:speed']).toBe(3);
    expect(answered.state.variables.noticed).toBe(false);
  });

  it.each([
    { answer: 1, name: 'the answer', rejected: false },
    { answer: 2, name: 'the abort after the answer', rejected: true },
  ])('bring auras and zones up to date after $name to an edit that removes an effect and waits for a roll', (row) => {
    const content = beacons();
    const placed = placedWith(content);
    const lit = play(placed, edit({ effect: 'acme:lamp', params: {}, target: ARCHERS, type: 'apply-effect' }), content);
    const lamp = unitOf(lit.state, 'archers-1').effects.find(({ effect: name }) => name === 'acme:lamp')?.id ?? -1;
    const paused = play(lit.state, edit({ effect: lamp, target: ARCHERS, type: 'remove-effect' }), content);
    const answered = play(paused.state, roll(paused.state.inputRequest?.id ?? -1, row.answer), content);

    expect(unitOf(lit.state, 'pikemen-1').auras).toStrictEqual(['demo:blessing']);
    expect(paused.state.inputRequest).toMatchObject({ kind: 'roll', name: 'acme:roll' });
    expect(answered.events.some(({ type }) => type === 'kernel:command-aborted')).toBe(row.rejected);
    expect(unitOf(answered.state, 'archers-1').effects.map(({ effect: name }) => name)).not.toContain('acme:lamp');
    expect(unitOf(answered.state, 'pikemen-1').auras).toStrictEqual([]);
    expect(KERNEL.attributes(answered.state, content, PIKEMEN)['core:speed']).toBe(2);
    expect(answered.state.variables.noticed).toBe(false);
  });

  it('keep the operations of an effect that an edit applies or removes quiet, so triggers do not notice them', () => {
    const content = stinging();
    const placed = placedWith(content);
    const stung = play(placed, applying('acme:sting'), content);
    const armed = play(placed, applying('acme:thorn'), content);
    const thorn = unitOf(armed.state, 'pikemen-1').effects.find(({ effect: name }) => name === 'acme:thorn')?.id ?? -1;
    const pricked = play(armed.state, edit({ effect: thorn, target: PIKEMEN, type: 'remove-effect' }), content);

    expect(unitOf(stung.state, 'pikemen-1')).toMatchObject({ count: 20, health: 9 });
    expect(stung.events.map(({ type }) => type)).toContain('kernel:health-changed');
    expect(stung.state.variables.noticed).toBe(false);
    expect(unitOf(pricked.state, 'pikemen-1')).toMatchObject({ count: 20, health: 9 });
    expect(pricked.state.variables.noticed).toBe(false);
  });

  it('keep the operations of an effect that an edit applies quiet after a pause and the answer', () => {
    const content = stinging();
    const placed = placedWith(content);
    const paused = play(placed, applying('acme:jab'), content);
    const answered = play(paused.state, roll(paused.state.inputRequest?.id ?? -1, 2), content);

    expect(paused.state.inputRequest).toMatchObject({ kind: 'roll', name: 'acme:roll' });
    expect(unitOf(answered.state, 'pikemen-1')).toMatchObject({ count: 20, health: 8 });
    expect(answered.state.variables.noticed).toBe(false);
  });

  it('change only the state during deployment, without checking outcomes', () => {
    const result = play(CREATED, edit({ count: 0, health: 0, type: 'set-health', unit: 'pikemen-1' }));

    expect(result.events.map(({ type }) => type)).toStrictEqual(['kernel:health-changed']);
    expect(result.state.phase.kind).toBe('deployment');
  });

  it('bring the marks of activity up to date during deployment, but not the zones', () => {
    const moved = play(CREATED, edit({ cell: '2,2', type: 'move-unit', unit: 'pikemen-1' }));
    const content = trapped();
    const toggle = edit({ effect: 'acme:toggle', params: {}, target: PIKEMEN, type: 'apply-effect' });
    const toggled = play(KERNEL.createState({ scenario: 'demo:duel' }, content), toggle, content);
    const marks = toggled.events
      .filter(({ type }) => type === 'kernel:effect-changed')
      .map(({ payload }) => (payload as { readonly effect: AppliedEffect }).effect);

    expect(moved.events.map(({ type }) => type)).toStrictEqual(['kernel:unit-moved']);
    expect(unitOf(moved.state, 'pikemen-1')).toMatchObject({ cell: '2,2', zones: [] });
    expect(toggled.state.phase.kind).toBe('deployment');
    expect(marks.map(({ active, effect: name }) => [name, active])).toStrictEqual([['demo:fragile', true]]);
  });

  it('check where a creature of two cells stands with the direction it faces after the edit', () => {
    const content = withBigArchers();
    const state = KERNEL.createState({ scenario: 'demo:duel' }, content);
    const across = play(state, edit({ cell: '1,0', facing: 'west', type: 'move-unit', unit: 'archers-1' }), content);

    expect([
      edit({ cell: '3,0', facing: 'west', type: 'move-unit', unit: 'archers-1' }),
      edit({ cell: '1,0', type: 'move-unit', unit: 'archers-1' }),
    ].map((command) => reason(KERNEL.execute(state, command, content)))).toStrictEqual([
      ['kernel:cannot-stand', { cell: '3,0' }],
      ['kernel:cannot-stand', { cell: '1,0' }],
    ]);

    expect(unitOf(across.state, 'archers-1')).toMatchObject({ cell: '1,0', facing: 'west' });
  });

  it('bring a dead creature of two cells back only if all its cells are free', () => {
    const content = withBigArchers();
    const state = KERNEL.createState({ scenario: 'demo:duel' }, content);
    const dead = play(state, edit({ count: 0, health: 0, type: 'set-health', unit: 'archers-1' }), content).state;
    const blocked = play(dead, edit({ cell: '4,0', type: 'move-unit', unit: 'pikemen-1' }), content).state;
    const revive = edit({ count: 2, health: 10, type: 'set-health', unit: 'archers-1' });

    expect(reason(KERNEL.execute(blocked, revive, content))).toStrictEqual(['kernel:cannot-stand', { cell: '3,0' }]);
    expect(unitOf(play(dead, revive, content).state, 'archers-1')).toMatchObject({ cell: '3,0', count: 2 });
  });

  it('end the turn that an operation of an applied effect ends in the check after the edit, as usual', () => {
    const content = withEffects(CONTENT, effect('acme:rest', {
      duration: { kind: 'instant' },
      onApply: [node('acme:end-turn', {})],
    }));
    const placed = [
      { cell: '0,1', kind: 'game', type: 'place-unit', unit: 'archers-1' },
      { kind: 'game', side: 'attacker', type: 'finish-deployment' },
    ].reduce<BattleState>(
      (current, command) => play(current, command as Command, content, RESTING).state,
      RESTING.createState({ scenario: 'demo:duel' }, content),
    );
    const rest = edit({ effect: 'acme:rest', params: {}, target: ARCHERS, type: 'apply-effect' });
    const result = play(placed, rest, content, RESTING);
    const types = result.events.map(({ type }) => type);
    const fired = result.events
      .filter(({ type }) => type === 'kernel:trigger-fired')
      .map(({ payload }) => (payload as { readonly trigger: string }).trigger);

    expect(types.filter((type) => type === 'kernel:turn-ended')).toHaveLength(1);
    expect(types.indexOf('kernel:effect-applied')).toBeLessThan(types.indexOf('kernel:turn-ended'));
    expect(fired).toStrictEqual(['turn-later', 'turn']);
    expect(result.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('give the events of a hidden unit only to the sides that see it, and keep the contract of projections', () => {
    const content = withScenario({
      sides: SCENARIO.sides.map((side) => (side.id === 'attacker'
        ? { ...side, units: side.units.map((unit) => ({ ...unit, visibleTo: ['attacker'] })) }
        : side)),
    });
    const placed = placedWith(content);
    const commands = [
      edit({ count: 7, health: 3, type: 'set-health', unit: 'archers-1' }),
      edit({ resource: 'demo:mana', type: 'set-resource', unit: 'archers-1', value: 2 }),
      edit({ effect: 'demo:steady', params: {}, target: ARCHERS, type: 'apply-effect' }),
    ];
    const results = commands.map((command) => play(placed, command, content));
    const changed = results.flatMap(({ events }) => events)
      .filter(({ type }) => type === 'kernel:health-changed' || type === 'kernel:resource-changed')
      .map(({ type, visibleTo }) => [type, visibleTo]);

    expect(changed).toStrictEqual([['kernel:health-changed', ['attacker']], ['kernel:resource-changed', ['attacker']]]);

    for (const result of results) {
      expect(projectionProblems(placed, result, content)).toStrictEqual([]);
    }
  });

  it('keep the contract of projections', () => {
    const commands = [
      edit({ count: 0, health: 0, type: 'set-health', unit: 'archers-1' }),
      edit({ cell: '2,2', type: 'move-unit', unit: 'archers-1' }),
      edit({ effect: 'demo:steady', params: {}, target: PIKEMEN, type: 'apply-effect' }),
    ];

    for (const command of commands) {
      expect(projectionProblems(PLACED, play(PLACED, command), CONTENT)).toStrictEqual([]);
    }
  });

  it('refuse an edit of a type the kernel does not know, naming its type', () => {
    const odd = { edit: { type: 'set-mood', unit: 'archers-1' }, kind: 'edit' } as unknown as Command;

    expect(reason(KERNEL.execute(PLACED, odd, CONTENT))).toStrictEqual(['kernel:invalid-command', { field: 'type' }]);
  });
});

const ARCHERS = { kind: 'unit', unit: 'archers-1' } as const;

const PIKEMEN = { kind: 'unit', unit: 'pikemen-1' } as const;

const VIEWS: readonly Visibility[] = [
  { kind: 'full' },
  { kind: 'sides', sides: ['attacker'] },
  { kind: 'sides', sides: ['defender'] },
  { kind: 'sides', sides: [] },
];

const END_TURN: OperationExtension = {
  kind: 'operation',
  name: 'acme:end-turn',
  run: () => ({ events: [], kind: 'done', steps: [turnCheckDraft({ end: true })] }),
  schema: { type: 'object' },
};

const RESTING = kernelWith(ORDER, SIDES, BRACE, END_TURN);

function edit(change: StateEdit): Command {
  return { edit: change, kind: 'edit' };
}

function withoutCell(state: BattleState, id: string): BattleState {
  return {
    ...state,
    units: state.units.map((unit) => {
      if (unit.id !== id) return unit;

      const { cell, ...rest } = unit;

      return cell === undefined ? unit : rest;
    }),
  };
}

function watched(): ContentRegistry {
  const watch = effect('acme:watch', {
    duration: { kind: 'battle' },
    triggers: [{
      on: 'kernel:unit-moved',
      ops: [node('kernel:set-variable', { value: true, variable: 'watched' })],
      priority: 0,
    }],
  });

  return {
    ...CONTENT,
    effects: { ...CONTENT.effects, [watch.name]: watch },
    scenarios: {
      'demo:duel': {
        ...SCENARIO,
        sides: SCENARIO.sides.map((side) => (side.id === 'defender'
          ? { ...side, units: side.units.map((unit) => ({ ...unit, effects: [...unit.effects, watch.name] })) }
          : side)),
        variables: { moved: false, watched: false },
      },
    },
  };
}

function roll(request: number, value: number): Command {
  return { kind: 'answer', request, value: { dice: [value], kind: 'roll' } };
}

function placedWith(content: ContentRegistry): BattleState {
  return [
    { cell: '0,1', kind: 'game', type: 'place-unit', unit: 'archers-1' },
    { kind: 'game', side: 'attacker', type: 'finish-deployment' },
  ].reduce<BattleState>(
    (current, command) => play(current, command as Command, content).state,
    KERNEL.createState({ scenario: 'demo:duel' }, content),
  );
}

function withEffects(content: ContentRegistry, ...effects: readonly Effect[]): ContentRegistry {
  return { ...content, effects: { ...content.effects, ...Object.fromEntries(effects.map((one) => [one.name, one])) } };
}

function noticing(on: string): Partial<Scenario> {
  return {
    triggers: [...SCENARIO.triggers, {
      id: 'noticed',
      on,
      ops: [node('kernel:set-variable', { value: true, variable: 'noticed' })],
      priority: 0,
    }],
    variables: { ...SCENARIO.variables, noticed: false },
  };
}

function trapped(): ContentRegistry {
  const toggle = effect('acme:toggle', {
    duration: { kind: 'instant' },
    onApply: [node('kernel:set-variable', { value: true, variable: 'moved' })],
  });

  return withEffects(withScenario({
    ...noticing('kernel:effect-changed'),
    sides: SCENARIO.sides.map((side) => (side.id === 'defender'
      ? { ...side, units: side.units.map((unit) => ({ ...unit, effects: ['demo:fragile', 'demo:trap'] })) }
      : side)),
  }), toggle);
}

function beacons(): ContentRegistry {
  const aura = { affects: 'all', area: { shape: 'radius', size: 5 }, effect: 'demo:blessing' } as const;
  const lit = node('kernel:set-variable', {
    value: node('kernel:multiply', {
      values: [Number.MAX_SAFE_INTEGER, node('kernel:dice', { count: 1, name: 'acme:roll', sides: 6 })],
    }),
    variable: 'lit',
  });
  const beacon = effect('acme:beacon', { aura, duration: { kind: 'battle' }, onApply: [lit] });
  const lamp = effect('acme:lamp', { aura, duration: { kind: 'battle' }, onRemove: [lit] });
  const content = withScenario(
    { ...noticing('kernel:auras-changed'), variables: { ...SCENARIO.variables, lit: false, noticed: false } },
    { randomSources: { 'acme:roll': 'external' } },
  );

  return withEffects(content, beacon, lamp);
}

function applying(name: string): Command {
  return edit({ effect: name, params: {}, target: PIKEMEN, type: 'apply-effect' });
}

function hit(amount: unknown): ReturnType<typeof node> {
  return node('kernel:damage', { amount, to: 'self' });
}

function stinging(): ContentRegistry {
  const sting = effect('acme:sting', { duration: { kind: 'instant' }, onApply: [hit(1)] });
  const thorn = effect('acme:thorn', { duration: { kind: 'battle' }, onRemove: [hit(1)] });
  const jab = effect('acme:jab', {
    duration: { kind: 'instant' },
    onApply: [hit(node('kernel:dice', { count: 1, name: 'acme:roll', sides: 6 }))],
  });
  const content = withScenario(noticing('kernel:health-changed'), { randomSources: { 'acme:roll': 'external' } });

  return withEffects(content, sting, thorn, jab);
}

function withBigArchers(): ContentRegistry {
  const archer = CONTENT.creatures['demo:archer'];

  if (archer === undefined) throw new Error('No archer');

  const sides = SCENARIO.sides.map((side) => (side.id === 'attacker'
    ? { ...side, units: side.units.map((unit) => ({ ...unit, cell: '3,0', facing: 'east' })) }
    : side));

  return { ...withScenario({ sides }), creatures: { ...CONTENT.creatures, 'demo:archer': { ...archer, size: 2 } } };
}

function projectionProblems(before: BattleState, result: ExecuteAccepted, content: ContentRegistry): readonly string[] {
  return VIEWS.flatMap((visibility) => {
    const projected = KERNEL.projectEvents(before, result.events, content, visibility);
    const applied = projected.reduce(
      (current, event) => KERNEL.applyEvent(current, event),
      KERNEL.project(before, content, visibility),
    );
    const expected = KERNEL.project(result.state, content, visibility);
    const leaked = visibility.kind === 'sides'
      && projected.some(({ visibleTo }) => !canSee(visibility, visibleTo));

    return [
      ...(hashJson(applied) === hashJson(expected) ? [] : [`${JSON.stringify(visibility)} gets another projection`]),
      ...(leaked ? [`${JSON.stringify(visibility)} gets an event it does not see`] : []),
    ];
  });
}
