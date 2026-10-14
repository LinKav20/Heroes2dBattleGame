import { describe, expect, it } from 'vitest';
import { ContentError } from '../../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../../events/index.ts';
import type { InputValue } from '../../model/index.ts';
import { accepted, applied, effect, node, unitOf } from '../../tests/fixtures.ts';
import {
  AFTER_ROUND_5,
  contentWith,
  emit,
  KERNEL,
  mark,
  run,
  runSteps,
  BARE_STATE,
  types,
  withUnitEffects,
} from './helpers.ts';

describe('the marks of activity', () => {
  const content = contentWith(
    effect('acme:night', { activeWhile: AFTER_ROUND_5 }),
    effect('acme:alarm', {
      duration: { kind: 'battle' },
      triggers: [{ on: 'kernel:effect-changed', ops: [mark('alarm')], priority: 0 }],
    }),
    effect('acme:quiet', {
      activeWhile: node('kernel:variable-is', { value: false, variable: 'reinforcements-arrived' }),
    }),
    effect('acme:herald', {
      duration: { kind: 'battle' },
      triggers: [{ on: 'kernel:effect-changed', ops: [mark('reinforcements-arrived')], priority: 0 }],
    }),
    effect('acme:fog', {
      activeWhile: node('kernel:has-tag', { of: 'target', tag: 'Creature' }),
      duration: { kind: 'battle' },
    }),
  );

  it('are brought up to date when the command ends after a step gave events', () => {
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:night')]);
    const result = run(state, content, emit([FLAGS]));

    expect(types(result)).toStrictEqual(['kernel:flags-changed', 'kernel:effect-changed']);
    expect(unitOf(result.state, 'pikemen-1').effects[0]?.active).toBe(false);
    expect(types(run(state, content, emit([])))).toStrictEqual([]);
    expect(types(run(state, content))).toStrictEqual([]);
  });

  it('are brought up to date again after the reactions to the changes of marks', () => {
    const state = withUnitEffects(
      withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:night'), applied(6, 'acme:herald')]),
      'archers-1',
      [applied(7, 'acme:quiet')],
    );
    const result = run(state, content, emit([FLAGS]));

    expect(types(result)).toStrictEqual([
      'kernel:flags-changed',
      'kernel:effect-changed',
      'kernel:variable-set',
      'kernel:effect-changed',
      'kernel:variable-set',
    ]);

    expect(unitOf(result.state, 'archers-1').effects[0]?.active).toBe(false);
  });

  it('treat a roll in a condition of activity as an error of the content', () => {
    const lucky = node('kernel:compare', {
      left: node('kernel:dice', { count: 1, name: 'core:damage-roll', sides: 6 }),
      operator: '>',
      right: 3,
    });
    const named = contentWith(effect('acme:fickle', { activeWhile: lucky }));
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:fickle')]);

    expect(() => run(state, named, emit([FLAGS]))).toThrow(ContentError);
  });

  it('belong only to the effects of units', () => {
    const sides = BARE_STATE.sides.map((side) => ({ ...side, effects: [applied(5, 'acme:fog')] }));
    const state = { ...BARE_STATE, sides };

    expect(types(run(state, content, emit([])))).toStrictEqual([]);
    expect(run(state, content, emit([])).state.sides[0]?.effects[0]?.active).toBe(true);
  });

  it('are brought up to date without reactions when the battle ends', () => {
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:night'), applied(6, 'acme:alarm')]);
    const ended = kernelEventDraft(KERNEL_EVENTS.battleEnded, { outcome: { kind: 'draw', winners: [] } }, 'all');
    const result = run(state, content, emit([ended]), emit([], [mark('late')]));

    expect(types(result)).toStrictEqual(['kernel:battle-ended', 'kernel:effect-changed']);
  });

  it('are brought up to date without reactions when the rules forbid the rest of a command after an answer', () => {
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:night'), applied(6, 'acme:alarm')]);
    const paused = accepted(KERNEL.execute(state, runSteps([{ params: {}, type: 'acme:ask' }]), content));
    const value: InputValue = { dice: [3], kind: 'roll' };
    const answered = accepted(KERNEL.execute(paused.state, { kind: 'answer', request: 8, value }, content));

    expect(types(paused)).toStrictEqual(['kernel:input-requested', 'kernel:steps-saved']);

    expect(types(answered)).toStrictEqual([
      'kernel:input-closed',
      'kernel:roll-made',
      'kernel:command-aborted',
      'kernel:effect-changed',
    ]);
  });
});

const FLAGS = kernelEventDraft(KERNEL_EVENTS.flagsChanged, { flags: [], unit: 'archers-1' }, 'all');
