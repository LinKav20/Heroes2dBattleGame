import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../json/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { BattleState, Command, RollInput } from '../../model/index.ts';
import { CONTENT } from '../../model/tests/helpers.ts';
import { MAX_STACK_DEPTH, MAX_STEPS_PER_COMMAND, type ExecuteAccepted, type ExecuteResult } from '../index.ts';
import { applyAll, DAMAGE, DUEL_EXTENSIONS, duelState, KERNEL, sequence, strike, unitOf } from './helpers.ts';

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
    expect(events[0]?.payload).toMatchObject({ counter: 1, source: 'generator', value: DAMAGE });
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

  it('opens an input request for a roll from outside, saves the steps and stops', () => {
    const before = duelState('external');
    const { events, state } = accepted(KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT));

    expect(events.map(({ type, visibleTo }) => [type, visibleTo])).toStrictEqual([
      ['kernel:input-requested', ['attacker']],
      ['kernel:steps-saved', []],
    ]);

    expect(state.inputRequest).toStrictEqual({
      dice: 1,
      id: 8,
      kind: 'roll',
      side: 'attacker',
      sides: 6,
      value: DAMAGE,
    });

    expect(state.steps).toStrictEqual([
      { params: { attacker: 'archers-1', target: 'pikemen-1' }, type: 'acme-duel:strike', version: 1 },
    ]);

    expect(state.rng?.counter).toBe(0);
  });

  it('goes on from the same step after the answer and empties the saved steps', () => {
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;
    const { events, state } = accepted(KERNEL.execute(paused, answerRoll(8, [4]), CONTENT));

    expect(events.map(({ type }) => type)).toStrictEqual([
      'kernel:input-closed',
      'kernel:roll-made',
      'kernel:health-changed',
      'kernel:health-changed',
      'acme-duel:noted',
      'kernel:steps-saved',
    ]);

    expect(events[1]?.payload).toStrictEqual({ dice: [4], result: 4, source: 'external', value: DAMAGE });
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
    const generated = accepted(KERNEL.execute(duelState('generator'), strike('archers-1', 'pikemen-1'), CONTENT));
    const dice = (generated.events[0]?.payload as RollInput).dice;
    const paused = accepted(KERNEL.execute(duelState('external'), strike('archers-1', 'pikemen-1'), CONTENT)).state;
    const manual = accepted(KERNEL.execute(paused, answerRoll(8, dice), CONTENT));

    expect(manual.state.units).toStrictEqual(generated.state.units);
    expect(manual.state.extensions).toStrictEqual(generated.state.extensions);
  });

  it('rolls the same values again from the same state (В-5)', () => {
    const before = duelState('generator');
    const first = KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT);
    const again = KERNEL.execute(before, strike('archers-1', 'pikemen-1'), CONTENT);

    expect(again).toStrictEqual(first);
  });

  it('asks for every die and adds the roll of each request to the inputs of the step', () => {
    const { state } = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:gamble'), CONTENT));

    expect(state.rng?.counter).toBeGreaterThanOrEqual(4);
  });

  it('asks for a choice and a target and checks the answers', () => {
    const choosing = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:choose'), CONTENT)).state;
    const chosen = accepted(KERNEL.execute(choosing, answer(8, { kind: 'choice', option: 'right' }), CONTENT));
    const aiming = accepted(KERNEL.execute(duelState('generator'), sequence('acme-duel:aim'), CONTENT)).state;
    const target = { kind: 'unit', unit: 'pikemen-1' } as const;
    const aimed = accepted(KERNEL.execute(aiming, answer(8, { kind: 'target', targets: [target] }), CONTENT));

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

    expect(KERNEL.execute(paused, strike('pikemen-1', 'archers-1'), CONTENT)).toStrictEqual(violation('input-pending'));
  });

  it.each<{ readonly name: string; readonly command: Command; readonly params: object }>([
    {
      command: { kind: 'game', type: 'wait', unit: 'archers-1' },
      name: 'a command of the kernel',
      params: { reason: 'not-available' },
    },
    {
      command: { kind: 'game', name: 'acme-duel:dance', payload: {}, type: 'extension' },
      name: 'an unknown command',
      params: { name: 'acme-duel:dance', reason: 'unknown-command' },
    },
    {
      command: { kind: 'game', name: 'acme-duel:refuse', payload: {}, type: 'extension' },
      name: 'a refused plan',
      params: { reason: 'refused' },
    },
    { command: strike('archers-1', 'ghosts-1'), name: 'a plan without a target', params: { reason: 'no-target' } },
    { command: sequence('acme-duel:gamble', 'acme-duel:fail'), name: 'a failing step', params: { reason: 'failed' } },
    { command: sequence('acme-duel:loop'), name: 'too many steps', params: { reason: 'step-limit' } },
    { command: sequence('acme-duel:deep'), name: 'too deep a stack', params: { reason: 'step-limit' } },
  ])('rejects $name as a whole', ({ command, params }) => {
    expect(KERNEL.execute(duelState('generator'), command, CONTENT)).toStrictEqual({
      ok: false,
      rejection: { code: 'rule-violation', params },
    });
  });

  it('runs no more steps than the limit allows', () => {
    let runs = 0;
    const counting = createKernel({
      extensions: [
        ...DUEL_EXTENSIONS.filter(({ name }) => name !== 'acme-duel:loop'),
        {
          kind: 'step',
          migrations: [],
          name: 'acme-duel:loop',
          run: () => {
            runs += 1;

            return { events: [], kind: 'done', steps: [{ params: {}, type: 'acme-duel:loop' }] };
          },
          version: 1,
        },
      ],
    });

    counting.execute(duelState('generator'), sequence('acme-duel:loop'), CONTENT);

    expect(runs).toBe(MAX_STEPS_PER_COMMAND);
  });

  it('stops at the depth of the stack long before the limit of steps', () => {
    let runs = 0;
    const counting = createKernel({
      extensions: [
        ...DUEL_EXTENSIONS.filter(({ name }) => name !== 'acme-duel:deep'),
        {
          kind: 'step',
          migrations: [],
          name: 'acme-duel:deep',
          run: () => {
            runs += 1;

            const deeper = { params: {}, type: 'acme-duel:deep' };

            return { events: [], kind: 'done', steps: [deeper, deeper] };
          },
          version: 1,
        },
      ],
    });

    expect(counting.execute(duelState('generator'), sequence('acme-duel:deep'), CONTENT))
      .toStrictEqual(violation('step-limit'));

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

  it('rejects a roll from the generator without a generator or after it runs out', () => {
    const { rng: unused, ...withoutRng } = duelState('generator');
    const exhausted = { ...duelState('generator'), rng: { counter: Number.MAX_SAFE_INTEGER, seed: '5'.repeat(64) } };

    expect(unused).toBeDefined();

    expect(KERNEL.execute(withoutRng, strike('archers-1', 'pikemen-1'), CONTENT)).toStrictEqual(
      { ok: false, rejection: { code: 'rule-violation', params: { reason: 'no-generator', value: DAMAGE } } },
    );

    expect(KERNEL.execute(exhausted, strike('archers-1', 'pikemen-1'), CONTENT)).toStrictEqual(
      { ok: false, rejection: { code: 'rule-violation', params: { reason: 'rng-exhausted', value: DAMAGE } } },
    );
  });
});

const INVALID_ANSWER: ExecuteResult = {
  ok: false,
  rejection: { code: 'rule-violation', params: { reason: 'invalid-answer', request: 8 } },
};

function accepted(result: ExecuteResult): ExecuteAccepted {
  if (!result.ok) throw new Error(`Rejected: ${JSON.stringify(result.rejection)}`);

  return result;
}

function answerRoll(request: number, dice: readonly number[]): Command {
  return { kind: 'answer', request, value: { dice, kind: 'roll' } };
}

function answer(request: number, value: Extract<Command, { readonly kind: 'answer' }>['value']): Command {
  return { kind: 'answer', request, value };
}

function nothingToAnswer(request: number): ExecuteResult {
  return { ok: false, rejection: { code: 'nothing-to-answer', params: { request } } };
}

function violation(reason: string): ExecuteResult {
  return { ok: false, rejection: { code: 'rule-violation', params: { reason } } };
}
