import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { giveUpDraft } from '../../battle/drafts.ts';
import { ContentError } from '../../content/index.ts';
import { ReactionIndex } from '../../effects/index.ts';
import { RUNNER_EVENTS } from '../../events/index.ts';
import { AttributeCache, MAX_DICE_PER_ROLL, MAX_DIE_SIDES } from '../../expressions/index.ts';
import type { FormulaExtension, StepDraft, StepKind } from '../../extensions/index.ts';
import { FieldCache } from '../../geometry/index.ts';
import { canonicalJson } from '../../json/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { AppliedEffect, BattleState, Command, InputValue, Rejection, Unit } from '../../model/index.ts';
import { accepted, CONTENT, deepFreeze, effect, FACING_GRID, SPEED_ORDER, unitOf } from '../../tests/fixtures.ts';
import { runDrafts } from '../../tests/run-drafts.ts';
import {
  MAX_STACK_DEPTH,
  MAX_STEPS_PER_COMMAND,
  type ExecuteAccepted,
  type ExecuteResult,
} from '../index.ts';
import {
  applyAll,
  ask,
  compute,
  DAMAGE,
  DUEL_EXTENSIONS,
  duelState,
  KERNEL,
  LUCK,
  sequence,
  strike,
  TRAP,
} from './helpers.ts';

describe('execute', () => {
  it('rolls with the generator, applies every event and runs the steps a step adds', () => {
    const before = duelState('generator');
    const { events, state } = accepted(KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT));

    expect(events.map(({ type }) => type)).toStrictEqual([
      'kernel:roll-made',
      'kernel:health-changed',
      'kernel:health-changed',
      'acme-duel:noted',
    ]);

    expect(events.map(({ id }) => id)).toStrictEqual([0, 1, 2, 3]);
    expect(events[0]?.payload).toMatchObject({ counter: 1, name: DAMAGE, source: 'generator' });
    expect(state.rng?.counter).toBe(1);
    expect(state.extensions['acme-duel:log']).toStrictEqual(['archers-1']);
    expect(applyAll(KERNEL, before, events)).toStrictEqual(state);
  });

  it('links the events of an added step to the first event of the step that added it', () => {
    const { events } = accepted(KERNEL.execute(duelState('generator'), strike('archers-1', 'pikemen-1'), CONTENT));

    expect(events.map(({ cause }) => cause)).toStrictEqual([undefined, undefined, 1, 1]);
  });

  it('gives the state that the events give, for any series of strikes', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 12 }), (sides) => {
        let state = duelState('generator');

        for (const archersStrike of sides) {
          const command = archersStrike ? strike('archers-1', 'pikemen-1') : strike('pikemen-1', 'archers-1');
          const result = KERNEL.execute(state, command, CONTENT);

          if (!result.ok) continue;

          expect(applyAll(KERNEL, state, result.events)).toStrictEqual(result.state);
          expect(JSON.parse(canonicalJson(result.state))).toStrictEqual(result.state);

          state = result.state;
        }
      }),
    );
  });

  it('changes neither the state nor the command', () => {
    const state = deepFreeze(duelState('external'));
    const command = deepFreeze(strike('archers-1', 'pikemen-1'));
    const paused = accepted(KERNEL.execute(state, command, CONTENT)).state;
    const answer = deepFreeze(answerRoll(8, [3]));

    expect(() => KERNEL.execute(deepFreeze(paused), answer, CONTENT)).not.toThrow();
    expect(() => KERNEL.execute(deepFreeze(duelState('generator')), command, CONTENT)).not.toThrow();
  });

  it('opens an input request for a roll from outside, saves the steps and stops', () => {
    const before = duelState('external');
    const { events, state } = accepted(KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT));

    expect(events.map(({ type, visibleTo }) => [type, visibleTo])).toStrictEqual([
      ['kernel:input-requested', ['attacker']],
      ['kernel:steps-saved', []],
    ]);

    expect(state.inputRequest).toStrictEqual({
      count: 1,
      id: 8,
      kind: 'roll',
      name: DAMAGE,
      side: 'attacker',
      sides: 6,
    });

    expect(state.steps).toStrictEqual([
      ACTION_END,
      { params: { attacker: 'archers-1', target: 'pikemen-1' }, type: 'acme-duel:strike', version: 1 },
    ]);

    expect(state.nextRequestId).toBe(9);
    expect(state.nextId).toBe(before.nextId);
    expect(state.rng?.counter).toBe(0);
  });

  it('goes on from the same step after the answer and takes back the saved steps', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;
    const { events, state } = accepted(KERNEL.execute(paused, answerRoll(8, [4]), CONTENT));

    expect(events.map(({ type }) => type)).toStrictEqual([
      'kernel:input-closed',
      'kernel:roll-made',
      'kernel:health-changed',
      'kernel:health-changed',
      'acme-duel:noted',
    ]);

    expect(events[1]?.payload).toStrictEqual({ dice: [4], name: DAMAGE, result: 4, source: 'external' });
    expect(state.steps).toStrictEqual([]);
    expect('inputRequest' in state).toBe(false);
    expect(applyAll(KERNEL, paused, events)).toStrictEqual(state);
  });

  it('gives the same result after the paused battle is saved and loaded (В-3)', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;
    const loaded: unknown = JSON.parse(canonicalJson(paused));
    const direct = KERNEL.execute(paused, answerRoll(8, [5]), CONTENT);
    const restored = KERNEL.execute(loaded as BattleState, answerRoll(8, [5]), CONTENT);

    expect(restored).toStrictEqual(direct);
  });

  it('plays the same battle with generator rolls and with the same values entered by hand (В-4)', () => {
    const before = duelState('generator');
    const generated = accepted(KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT));
    const roll = generated.events[0]?.payload;
    const dice = isRecordWithDice(roll) ? roll.dice : [];
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;
    const manual = accepted(KERNEL.execute(paused, answerRoll(8, dice.map(Number)), CONTENT));

    expect(gameEvents(manual)).toStrictEqual(gameEvents(generated));
    expect(manual.state.units).toStrictEqual(generated.state.units);
    expect(manual.state.extensions).toStrictEqual(generated.state.extensions);
    expect(manual.state.nextId).toBe(generated.state.nextId);
    expect(manual.state.steps).toStrictEqual(generated.state.steps);
  });

  it('rolls the same values again from the same state (В-5)', () => {
    const before = duelState('generator');
    const first = KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT);
    const again = KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT);

    expect(again).toStrictEqual(first);
  });

  it('rolls all dice of a need at once and runs the step again with every roll', () => {
    const { events, state } = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:gamble'), CONTENT));

    expect(state.rng?.counter).toBe(4);

    expect(events.map(({ payload }) => payload)).toStrictEqual([
      expect.objectContaining({ counter: 2, dice: [expect.any(Number), expect.any(Number)] }),
      expect.objectContaining({ counter: 4, dice: [expect.any(Number), expect.any(Number)] }),
    ]);
  });

  it('keeps the visibility of a hidden roll whoever rolls it', () => {
    const generated = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:trap'), CONTENT));
    const paused = accepted(KERNEL.execute(duelState('external'), sequence('acme-duel:trap'), CONTENT));
    const answered = accepted(KERNEL.execute(paused.state, answerRoll(8, [13]), CONTENT));

    expect(generated.events.map(({ type, visibleTo }) => [type, visibleTo])).toStrictEqual([['kernel:roll-made', []]]);
    expect(paused.state.inputRequest).toMatchObject({ name: TRAP, visibleTo: [] });

    expect(answered.events.map(({ type, visibleTo }) => [type, visibleTo])).toStrictEqual([
      ['kernel:input-closed', 'all'],
      ['kernel:roll-made', []],
    ]);
  });

  it('asks for a choice and a target and checks the answers', () => {
    const choosing = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:choose'), CONTENT)).state;
    const chosen = accepted(KERNEL.execute(choosing, answer(8, { kind: 'choice', option: 'right' }), CONTENT));
    const aiming = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:aim'), CONTENT)).state;
    const target = { kind: 'unit', unit: 'pikemen-1' } as const;
    const aimed = accepted(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [target] }), CONTENT));

    expect(choosing.inputRequest).toMatchObject({ name: 'acme-duel:path', options: ['left', 'right'] });
    expect(chosen.state.variables.path).toBe('right');
    expect(unitOf(aimed.state, 'pikemen-1').flags).toStrictEqual(['acme-duel:aimed']);

    expect(KERNEL.execute(choosing, answer(8, { kind: 'choice', option: 'up' }), CONTENT))
      .toStrictEqual(INVALID_ANSWER);

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [] }), CONTENT)).toStrictEqual(INVALID_ANSWER);

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [target, target] }), CONTENT))
      .toStrictEqual(INVALID_ANSWER);

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [{ kind: 'unit', unit: 'ghost' }] }), CONTENT))
      .toStrictEqual(INVALID_ANSWER);

    expect(KERNEL.execute(aiming, answer(8, { kind: 'choice', option: 'left' }), CONTENT))
      .toStrictEqual(INVALID_ANSWER);
  });

  it('accepts cells and sides as targets', () => {
    const aiming = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:aim-anything'), CONTENT)).state;
    const targets = [{ kind: 'side', side: 'defender' }, { cell: '1,1', kind: 'cell' }] as const;

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets }), CONTENT).ok).toBe(true);

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [targets[0], targets[0]] }), CONTENT))
      .toStrictEqual(INVALID_ANSWER);
  });

  it('keeps only the fields it knows from an answer', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), sequence('acme-duel:gamble'), CONTENT)).state;
    const value: unknown = { dice: [1, 2], kind: 'roll', note: 'extra' };
    const again = accepted(KERNEL.execute(paused, answer(8, value as InputValue), CONTENT));

    expect(again.state.steps[1]?.inputs).toStrictEqual([{ dice: [1, 2], kind: 'roll', name: LUCK, result: 3 }]);
  });

  it.each([
    { dice: [7], name: 'a die above its sides' },
    { dice: [0], name: 'a die below 1' },
    { dice: [2, 3], name: 'too many dice' },
    { dice: [2.5], name: 'a fractional die' },
  ])('rejects $name in a roll', ({ dice }) => {
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;

    expect(KERNEL.execute(paused, answerRoll(8, dice), CONTENT)).toStrictEqual(INVALID_ANSWER);
  });

  it('rejects an answer when no request or another request is open', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;

    expect(KERNEL.execute(duelState('external'), answerRoll(8, [1]), CONTENT)).toStrictEqual(nothingToAnswer(8));
    expect(KERNEL.execute(paused, answerRoll(9, [1]), CONTENT)).toStrictEqual(nothingToAnswer(9));
  });

  it('rejects a game command while an input request is open', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;

    expect(KERNEL.execute(paused, strike('pikemen-1', 'archers-1'), CONTENT))
      .toStrictEqual(violation('kernel:input-pending'));
  });

  it.each<{ readonly name: string; readonly command: Command; readonly rejection: Rejection }>([
    {
      command: { kind: 'game', target: 'pikemen-1', type: 'attack', unit: 'archers-1' },
      name: 'a command of the kernel without a planner',
      rejection: rule('kernel:not-available'),
    },
    {
      command: { edit: { count: 1, health: 1, type: 'set-health', unit: 'archers-1' }, kind: 'edit' },
      name: 'a state edit',
      rejection: rule('kernel:not-available'),
    },
    {
      command: { kind: 'game', name: 'acme-duel:dance', payload: {}, type: 'extension' },
      name: 'an unknown command',
      rejection: rule('kernel:unknown-command', { name: 'acme-duel:dance' }),
    },
    {
      command: { kind: 'game', name: 'acme-duel:refuse', payload: {}, type: 'extension' },
      name: 'a refused plan',
      rejection: rule('acme-duel:refused'),
    },
    {
      command: strike('archers-1', 'ghosts-1'),
      name: 'a plan without a target',
      rejection: rule('acme-duel:no-target', { target: 'ghosts-1' }),
    },
    {
      command: sequence('acme-duel:gamble', 'acme-duel:fail'),
      name: 'a failing step',
      rejection: rule('acme-duel:failed'),
    },
    { command: sequence('acme-duel:loop'), name: 'too many steps', rejection: rule('kernel:step-limit') },
    { command: sequence('acme-duel:deep'), name: 'too deep a stack', rejection: rule('kernel:step-limit') },
    {
      command: sequence(...Array.from({ length: MAX_STACK_DEPTH }, () => 'acme-duel:pair')),
      name: 'a plan deeper than the stack',
      rejection: rule('kernel:step-limit'),
    },
  ])('rejects $name as a whole', ({ command, rejection }) => {
    expect(KERNEL.execute(duelState('generator'), command, CONTENT)).toStrictEqual({ ok: false, rejection });
  });

  it('accepts a plan exactly as deep as the stack with the step that ends the action', () => {
    const command = sequence(...Array.from({ length: MAX_STACK_DEPTH - 1 }, () => 'acme-duel:mark'));

    expect(KERNEL.execute(duelState('generator'), command, CONTENT).ok).toBe(true);
  });

  it('runs no more steps than the limit allows', () => {
    let runs = 0;
    const counting = withStep({
      kind: 'step',
      migrations: [],
      name: 'acme-duel:loop',
      run: () => {
        runs += 1;

        return { events: [], kind: 'done', steps: [{ params: {}, type: 'acme-duel:loop' }] };
      },
      version: 1,
    });

    counting.execute(duelState('generator'), sequence('acme-duel:loop'), CONTENT);

    expect(runs).toBe(MAX_STEPS_PER_COMMAND);
  });

  it('stops at the depth of the stack long before the limit of steps', () => {
    let runs = 0;
    const counting = withStep({
      kind: 'step',
      migrations: [],
      name: 'acme-duel:deep',
      run: () => {
        runs += 1;

        const deeper = { params: {}, type: 'acme-duel:deep' };

        return { events: [], kind: 'done', steps: [deeper, deeper] };
      },
      version: 1,
    });

    expect(counting.execute(duelState('generator'), sequence('acme-duel:deep'), CONTENT))
      .toStrictEqual(violation('kernel:step-limit'));

    expect(runs).toBe(MAX_STACK_DEPTH - 1);
  });

  it('runs the steps a step adds in the order it lists them', () => {
    const { events } = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:pair'), CONTENT));

    expect(events.map(({ payload }) => payload)).toStrictEqual([
      { value: true, variable: 'first' },
      { value: true, variable: 'second' },
    ]);
  });

  it('rolls with the generator when the ruleset names no source for the value', () => {
    const before = duelState('generator');
    const unnamed = { ...before, ruleset: { ...before.ruleset, randomSources: {} } };
    const { events } = accepted(KERNEL.execute(unnamed, strike('archers-1', 'pikemen-1'), CONTENT));

    expect(events[0]?.payload).toMatchObject({ source: 'generator' });
  });

  it('saves the waiting steps without their causes', () => {
    const { events, state } = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:chain'), CONTENT));

    expect(events.map(({ cause, type }) => [type, cause])).toStrictEqual([
      ['kernel:variable-set', undefined],
      ['kernel:input-requested', 0],
      ['kernel:steps-saved', 0],
    ]);

    expect(state.steps).toStrictEqual([ACTION_END, { params: {}, type: 'acme-duel:choose', version: 1 }]);
  });

  it('checks the number of targets and repeated targets', () => {
    const aiming = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:aim-two'), CONTENT)).state;
    const archers = { kind: 'unit', unit: 'archers-1' } as const;
    const pikemen = { kind: 'unit', unit: 'pikemen-1' } as const;

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [archers, pikemen] }), CONTENT).ok).toBe(true);

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [archers] }), CONTENT))
      .toStrictEqual(INVALID_ANSWER);

    expect(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [archers, archers] }), CONTENT))
      .toStrictEqual(INVALID_ANSWER);
  });

  it('rejects a roll from the generator after it runs out', () => {
    const exhausted = { ...duelState('generator'), rng: { counter: Number.MAX_SAFE_INTEGER, seed: '5'.repeat(64) } };

    expect(KERNEL.execute(exhausted, strike('archers-1', 'pikemen-1'), CONTENT))
      .toStrictEqual({ ok: false, rejection: rule('kernel:rng-exhausted', { name: DAMAGE }) });
  });
});

describe('formulas in steps', () => {
  const twoDice = { count: 2, name: DAMAGE, sides: 6, type: 'kernel:dice' };
  const doubled = { type: 'kernel:multiply', values: [twoDice, 2] };

  it('roll the dice of a formula with the generator and run the step again with the roll', () => {
    const { events, state } = accepted(KERNEL.execute(duelState('generator'), compute(doubled), CONTENT));
    const [roll, result] = events;

    expect(events.map(({ type }) => type)).toStrictEqual(['kernel:roll-made', 'kernel:variable-set']);
    expect(roll?.payload).toMatchObject({ name: DAMAGE, source: 'generator' });
    expect(state.variables.result).toBe(2 * (roll?.payload as { readonly result: number }).result);
    expect(result?.cause).toBeUndefined();
  });

  it('ask the side of self for the dice of a formula from outside', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), compute(doubled), CONTENT)).state;
    const answered = accepted(KERNEL.execute(paused, answerRoll(8, [2, 5]), CONTENT));

    expect(paused.inputRequest).toStrictEqual({
      count: 2,
      id: 8,
      kind: 'roll',
      name: DAMAGE,
      side: 'attacker',
      sides: 6,
      unit: 'archers-1',
    });

    expect(answered.state.variables.result).toBe(14);
  });

  it('reject the command when a formula leaves the safe range', () => {
    const huge = { type: 'kernel:multiply', values: [Number.MAX_SAFE_INTEGER, 2] };

    expect(KERNEL.execute(duelState('generator'), compute(huge), CONTENT)).toStrictEqual({
      ok: false,
      rejection: rule('kernel:out-of-range', { formula: 'kernel:multiply' }),
    });
  });

  it('throw for an error of the content', () => {
    expect(() => KERNEL.execute(duelState('generator'), compute({ left: 1, right: 0, type: 'kernel:divide' }), CONTENT))
      .toThrow('divides by 0');
  });

  it('keep the values of attributes across rolls of the generator, which change only its counter', () => {
    const counter = { evaluations: 0 };
    const counting: FormulaExtension = {
      evaluate: () => {
        counter.evaluations += 1;

        return { kind: 'value', value: 1 };
      },
      kind: 'formula',
      name: 'acme-duel:count',
      schema: { type: 'object' },
    };
    const kernel = createKernel({ extensions: [...DUEL_EXTENSIONS, FACING_GRID, SPEED_ORDER, counting] });
    const counted = effect('acme-duel:counted', {
      duration: { kind: 'battle' },
      modifiers: [{ attribute: 'core:speed', operation: 'add', value: { type: 'acme-duel:count' } }],
    });
    const content = { ...CONTENT, effects: { ...CONTENT.effects, 'acme-duel:counted': counted } };
    const base = duelState('generator');
    const state = {
      ...base,
      units: base.units.map((unit) => ({ ...unit, effects: [countedOf(unit)] })),
    };
    const speed = { attribute: 'core:speed', of: 'self', type: 'kernel:attribute' };
    const formula = { type: 'kernel:add', values: [speed, twoDice, twoDice, twoDice, speed] };
    const { events } = accepted(kernel.execute(state, compute(formula), content));

    expect(events.filter(({ type }) => type === 'kernel:roll-made')).toHaveLength(3);
    expect(counter.evaluations).toBe(1);
  });
});

describe('the end of the battle', () => {
  it('stops the command: the remaining steps do not run and no request opens', () => {
    const before = duelState('generator');
    const { events, state } = ended(before, { params: {}, type: 'acme-duel:mark' });

    expect(events.map(({ type }) => type)).toStrictEqual(['kernel:battle-ended']);

    expect(state.phase).toStrictEqual({
      kind: 'ended',
      outcome: { kind: 'surrender', side: 'attacker', winners: ['defender'] },
    });

    expect(state.steps).toStrictEqual([]);
    expect('inputRequest' in state).toBe(false);
    expect(applyAll(KERNEL, before, events)).toStrictEqual(state);
  });

  it('rejects game commands and has nothing to answer afterwards', () => {
    const over = ended(duelState('generator')).state;

    expect(KERNEL.execute(over, strike('archers-1', 'pikemen-1'), CONTENT))
      .toStrictEqual(violation('kernel:battle-over'));

    expect(KERNEL.execute(over, answerRoll(8, [1]), CONTENT)).toStrictEqual(nothingToAnswer(8));
  });
});

describe('a command that the rules forbid after an answer', () => {
  it('accepts the answer, closes the request and aborts the rest of the command', () => {
    const command = sequence('acme-duel:choose', 'acme-duel:fail');
    const paused = accepted(KERNEL.execute(duelState('generator'), command, CONTENT)).state;
    const { events, state } = accepted(KERNEL.execute(paused, answer(8, { kind: 'choice', option: 'left' }), CONTENT));

    expect(events.map(({ type, visibleTo }) => [type, visibleTo])).toStrictEqual([
      ['kernel:input-closed', ['attacker']],
      ['kernel:command-aborted', ['attacker']],
    ]);

    expect(events[1]?.payload).toStrictEqual({ rejection: rule('acme-duel:failed') });
    expect(state.variables).toStrictEqual(paused.variables);
    expect(state.steps).toStrictEqual([]);
    expect('inputRequest' in state).toBe(false);
    expect(applyAll(KERNEL, paused, events)).toStrictEqual(state);
  });

  it('aborts a command that reaches a limit after the answer', () => {
    const command = sequence('acme-duel:choose', 'acme-duel:loop');
    const paused = accepted(KERNEL.execute(duelState('generator'), command, CONTENT)).state;
    const { events } = accepted(KERNEL.execute(paused, answer(8, { kind: 'choice', option: 'left' }), CONTENT));

    expect(events.at(-1)?.payload).toStrictEqual({ rejection: rule('kernel:step-limit') });
  });
});

describe('errors of extensions', () => {
  it.each([
    { name: 'a roll without dice', need: { count: 0, kind: 'roll', name: DAMAGE, sides: 6 } },
    { name: 'too many dice', need: { count: MAX_DICE_PER_ROLL + 1, kind: 'roll', name: DAMAGE, sides: 6 } },
    { name: 'a die without sides', need: { count: 1, kind: 'roll', name: DAMAGE, sides: 0 } },
    { name: 'a die with too many sides', need: { count: 1, kind: 'roll', name: DAMAGE, sides: MAX_DIE_SIDES + 1 } },
    { name: 'a choice without options', need: { kind: 'choice', name: 'acme-duel:path', options: [] } },
    { name: 'repeated options', need: { kind: 'choice', name: 'acme-duel:path', options: ['a', 'a'] } },
    { name: 'a choice without targets', need: { count: 1, kind: 'target', name: 'acme-duel:aim', targets: [] } },
    {
      name: 'more targets than offered',
      need: { count: 2, kind: 'target', name: 'acme-duel:aim', targets: [{ kind: 'side', side: 'defender' }] },
    },
    {
      name: 'repeated targets',
      need: {
        count: 1,
        kind: 'target',
        name: 'acme-duel:aim',
        targets: [{ kind: 'side', side: 'defender' }, { kind: 'side', side: 'defender' }],
      },
    },
    { name: 'an unknown kind of value', need: { kind: 'wish', name: 'acme-duel:wish' } },
  ])('throw for $name', ({ need }) => {
    expect(() => KERNEL.execute(duelState('external'), ask(need), CONTENT)).toThrow(TypeError);
    expect(() => KERNEL.execute(duelState('generator'), ask(need), CONTENT)).toThrow('"acme-duel:ask" needs');
  });

  it('throw for the largest allowed roll only when it is too large', () => {
    const largest = { count: MAX_DICE_PER_ROLL, kind: 'roll', name: DAMAGE, sides: MAX_DIE_SIDES };

    expect(KERNEL.execute(duelState('generator'), ask(largest), CONTENT).ok).toBe(true);
  });

  it.each([
    { command: sequence('acme-duel:cheat'), error: 'only the kernel gives this event' },
    { command: sequence('acme-duel:usurp'), error: 'but only the kernel leads the course of the battle' },
    { command: sequence('acme-duel:ghost'), error: 'The kernel has no kind of event "acme-duel:unknown".' },
    { command: sequence('acme-duel:summon'), error: 'The kernel has no kind of step "acme-duel:unknown".' },
    { command: sequence('acme-duel:grumble'), error: 'a reason needs a full name with the prefix of a package' },
    {
      command: { kind: 'game', name: 'acme-duel:mumble', payload: {}, type: 'extension' } as const,
      error: '"acme-duel:mumble" rejects the command with the reason "refused"',
    },
    { command: sequence('acme-duel:pretend'), error: 'with the reason "kernel:battle-over"' },
    { command: sequence('acme-duel:silent'), error: 'with the reason 7' },
    {
      command: { kind: 'game', name: 'acme-duel:overflow', payload: {}, type: 'extension' } as const,
      error: '"acme-duel:overflow" rejects the command with the reason "kernel:out-of-range"',
    },
    { command: sequence('acme-duel:haunt'), error: 'which does not fit the state: There is no unit "ghosts-1".' },
  ])('throw when a step or a plan breaks the contract: $error', ({ command, error }) => {
    expect(() => KERNEL.execute(duelState('generator'), command, CONTENT)).toThrow(error);
    expect(thrown(() => KERNEL.execute(duelState('generator'), command, CONTENT))).toMatchObject({ name: 'TypeError' });
  });

  it('tell an error of content by its name and the place it names', () => {
    const error = new ContentError('The node is wrong.', { definition: 'core:poison', node: 'kernel:dice' });

    expect(error).toBeInstanceOf(TypeError);
    expect(error).toMatchObject({ definition: 'core:poison', message: 'The node is wrong.', name: 'ContentError' });
    expect(new ContentError('Plain.')).not.toHaveProperty('node');
  });

  it('throw when the ruleset rolls with a generator that the battle does not have', () => {
    const { rng: unused, ...withoutRng } = duelState('generator');

    expect(unused).toBeDefined();
    expect(() => KERNEL.execute(withoutRng, strike('archers-1', 'pikemen-1'), CONTENT)).toThrow('has none');
  });

  it('throw for a step that returns an unknown result or a plan of an unknown kind', () => {
    const odd: unknown = { kind: 'maybe' };
    const kernel = createKernel({
      extensions: [
        ...DUEL_EXTENSIONS,
        { kind: 'step', migrations: [], name: 'acme-odd:step', run: () => odd as never, version: 1 },
        { kind: 'command', name: 'acme-odd:command', plan: () => odd as never, schema: {} },
      ],
    });

    expect(() => kernel.execute(duelState('generator'), sequence('acme-odd:step'), CONTENT))
      .toThrow('returned an unknown result');

    const command = { kind: 'game', name: 'acme-odd:command', payload: {}, type: 'extension' } as const;

    expect(() => kernel.execute(duelState('generator'), command, CONTENT)).toThrow('returned an unknown plan');
  });

  it('throw for a saved step of another version and for saved steps without a request', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;
    const saved = paused.steps.at(-1);

    if (saved === undefined) throw new Error('No saved step');

    const older = { ...paused, steps: [...paused.steps.slice(0, -1), { ...saved, version: 2 }] };
    const { inputRequest: open, ...stray } = paused;

    expect(open).toBeDefined();

    expect(() => KERNEL.execute(older, answerRoll(8, [1]), CONTENT))
      .toThrow('The step "acme-duel:strike" is not in the current version; migrate it first.');

    expect(() => KERNEL.execute(stray, strike('archers-1', 'pikemen-1'), CONTENT))
      .toThrow('The battle has saved steps, but no input request is open.');

    expect(() => KERNEL.execute({ ...paused, steps: [] }, answerRoll(8, [1]), CONTENT))
      .toThrow('no step waits for it');
  });

  it('throw for content of another battle', () => {
    expect(() => KERNEL.execute(duelState('generator'), sequence(), { ...CONTENT, contentHash: 'b'.repeat(64) }))
      .toThrow('but the battle was started with');
  });
});

const ACTION_END = {
  flow: true,
  params: { holder: { kind: 'unit', unit: 'archers-1' } },
  type: 'kernel:action-end',
  version: 1,
};

const INVALID_ANSWER: ExecuteResult = { ok: false, rejection: rule('kernel:invalid-answer', { request: 8 }) };

function ended(state: BattleState, ...after: readonly StepDraft[]): ExecuteAccepted {
  const caches = { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };
  const steps = [giveUpDraft({ kind: 'surrender', side: 'attacker' }), ...after];

  return accepted(runDrafts(KERNEL.registries, caches, state, steps, CONTENT));
}

function answerRoll(request: number, dice: readonly number[]): Command {
  return { kind: 'answer', request, value: { dice, kind: 'roll' } };
}

function answer(request: number, value: InputValue): Command {
  return { kind: 'answer', request, value };
}

function rule(reason: string, params: Rejection['params'] = {}): Rejection {
  return { code: 'rule-violation', params, reason };
}

function nothingToAnswer(request: number): ExecuteResult {
  return { ok: false, rejection: { code: 'nothing-to-answer', params: { request }, reason: 'kernel:no-open-request' } };
}

function violation(reason: string): ExecuteResult {
  return { ok: false, rejection: rule(reason) };
}

function gameEvents(result: ExecuteAccepted): unknown[] {
  return result.events
    .filter(({ type }) => !RUNNER_EVENTS.some((runner) => runner === type))
    .map(({ payload, type, visibleTo }) => ({ payload, type, visibleTo }));
}

function isRecordWithDice(value: unknown): value is { readonly dice: readonly number[] } {
  return typeof value === 'object' && value !== null && 'dice' in value && Array.isArray(value.dice);
}

function withStep(replacement: StepKind): ReturnType<typeof createKernel> {
  return createKernel({
    extensions: [...DUEL_EXTENSIONS.filter(({ name }) => name !== replacement.name), replacement],
  });
}

function countedOf(unit: Unit): AppliedEffect {
  const id = unit.id === 'archers-1' ? 50 : 51;

  return { active: true, effect: 'acme-duel:counted', id, params: {}, stacks: 1, visibleTo: 'all' };
}

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}
