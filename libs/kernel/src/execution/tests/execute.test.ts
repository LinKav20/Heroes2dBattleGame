import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RUNNER_EVENTS } from '../../events/index.ts';
import type { StepKind } from '../../extensions/index.ts';
import { canonicalJson } from '../../json/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { BattleState, Command, InputValue, Rejection } from '../../model/index.ts';
import { CONTENT, deepFreeze } from '../../tests/fixtures.ts';
import {
  MAX_DICE_PER_ROLL,
  MAX_DIE_SIDES,
  MAX_STACK_DEPTH,
  MAX_STEPS_PER_COMMAND,
  type ExecuteAccepted,
  type ExecuteResult,
} from '../index.ts';
import {
  applyAll,
  ask,
  DAMAGE,
  DUEL_EXTENSIONS,
  duelState,
  KERNEL,
  sequence,
  strike,
  TRAP,
  unitOf,
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

    expect(again.state.steps[0]?.inputs).toStrictEqual([{ dice: [1, 2], kind: 'roll', result: 3 }]);
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
      command: { kind: 'game', type: 'wait', unit: 'archers-1' },
      name: 'a command of the kernel',
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
      command: sequence(...Array.from({ length: MAX_STACK_DEPTH + 1 }, () => 'acme-duel:pair')),
      name: 'a plan deeper than the stack',
      rejection: rule('kernel:step-limit'),
    },
  ])('rejects $name as a whole', ({ command, rejection }) => {
    expect(KERNEL.execute(duelState('generator'), command, CONTENT)).toStrictEqual({ ok: false, rejection });
  });

  it('accepts a plan exactly as deep as the stack', () => {
    const command = sequence(...Array.from({ length: MAX_STACK_DEPTH }, () => 'acme-duel:mark'));

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

    expect(runs).toBe(MAX_STACK_DEPTH);
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

    expect(state.steps).toStrictEqual([{ params: {}, type: 'acme-duel:choose', version: 1 }]);
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

describe('the end of the battle', () => {
  it('stops the command: the remaining steps do not run and no request opens', () => {
    const before = duelState('generator');
    const { events, state } = accepted(KERNEL.execute(before, sequence('acme-duel:end', 'acme-duel:mark'), CONTENT));

    expect(events.map(({ type }) => type)).toStrictEqual(['kernel:battle-ended']);
    expect(state.phase).toStrictEqual({ kind: 'ended', outcome: { kind: 'draw', winners: [] } });
    expect(state.steps).toStrictEqual([]);
    expect('inputRequest' in state).toBe(false);
    expect(applyAll(KERNEL, before, events)).toStrictEqual(state);
  });

  it('rejects game commands and has nothing to answer afterwards', () => {
    const ended = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:end'), CONTENT)).state;

    expect(KERNEL.execute(ended, strike('archers-1', 'pikemen-1'), CONTENT))
      .toStrictEqual(violation('kernel:battle-over'));

    expect(KERNEL.execute(ended, answerRoll(8, [1]), CONTENT)).toStrictEqual(nothingToAnswer(8));
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
    { command: sequence('acme-duel:ghost'), error: 'The kernel has no kind of event "acme-duel:unknown".' },
    { command: sequence('acme-duel:summon'), error: 'The kernel has no kind of step "acme-duel:unknown".' },
    { command: sequence('acme-duel:grumble'), error: 'a reason needs a full name with the prefix of a package' },
    {
      command: { kind: 'game', name: 'acme-duel:mumble', payload: {}, type: 'extension' } as const,
      error: '"acme-duel:mumble" rejects the command with the reason "refused"',
    },
  ])('throw when a step or a plan breaks the contract: $error', ({ command, error }) => {
    expect(() => KERNEL.execute(duelState('generator'), command, CONTENT)).toThrow(error);
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
    const [saved] = paused.steps;

    if (saved === undefined) throw new Error('No saved step');

    const older = { ...paused, steps: [{ ...saved, version: 2 }] };
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

const INVALID_ANSWER: ExecuteResult = { ok: false, rejection: rule('kernel:invalid-answer', { request: 8 }) };

function accepted(result: ExecuteResult): ExecuteAccepted {
  if (!result.ok) throw new Error(`Rejected: ${JSON.stringify(result.rejection)}`);

  return result;
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
