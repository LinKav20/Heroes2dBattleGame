import { describe, expect, it } from 'vitest';
import { ContentError } from '../../content/index.ts';
import type { CommandKind, StepKind } from '../../extensions/index.ts';
import { turnRejection, type ExtensionCommand } from '../../model/index.ts';
import { asRecord, node, unitOf } from '../../tests/fixtures.ts';
import { moveDraft, plannedMove, settledValue, turnCheckDraft } from '../index.ts';
import {
  battleWith,
  CONTENT,
  finish,
  KERNEL,
  kernelWith,
  mark,
  ORDER,
  place,
  play,
  PLACED,
  reason,
  RULESET,
  SCENARIO,
  startWith,
  variant,
  withScenario,
} from './helpers.ts';

describe('what packages with extensions see', () => {
  it('lets a step of a package ask the variant of a mechanic that the ruleset chose', () => {
    const asking: StepKind = {
      kind: 'step',
      migrations: [],
      name: 'acme:ask-order',
      run: (context) => {
        const order = context.mechanic('kernel:turn-order');
        const none = context.mechanic('acme:morale') === undefined;
        const round = order?.context.state.round ?? 0;

        return {
          events: [],
          kind: 'done',
          steps: [mark('order', order?.variant.name ?? ''), mark('round', round), mark('none', none)],
        };
      },
      version: 1,
    };
    const command: CommandKind = {
      kind: 'command',
      name: 'acme:ask',
      plan: () => ({ kind: 'steps', steps: [{ params: {}, type: 'acme:ask-order' }] }),
      schema: { type: 'object' },
    };
    const kernel = kernelWith(ORDER, asking, { ...command, name: 'acme:ask-order-command' });
    const ask: ExtensionCommand = { kind: 'game', name: 'acme:ask-order-command', payload: {}, type: 'extension' };
    const asked = play(PLACED, ask, CONTENT, kernel);

    expect(asked.state.variables).toMatchObject({ none: true, order: 'acme:in-order', round: 1 });
  });

  it('gives a command of a package what it needs to plan a move, reasons of the turn and a way to end it', () => {
    const scout: CommandKind = {
      kind: 'command',
      name: 'acme:scout',
      plan: ({ expressions, field, payload, state }) => {
        const unit = String(asRecord(payload).unit);
        const turn = turnRejection(state, { kind: 'unit', unit });

        if (turn !== undefined) return { kind: 'reject', reason: turn.rejection.reason };

        const move = plannedMove({ expressions, field, state }, { kind: 'game', to: '1,2', type: 'move', unit });

        return move.kind === 'value'
          ? { endsTurn: true, kind: 'steps', steps: [moveDraft(move.value), mark('scouted')] }
          : { kind: 'reject', reason: 'acme:cannot-scout' };
      },
      schema: { type: 'object' },
    };
    const free = withScenario({}, { turn: { ...RULESET.turn, movement: { actions: {}, points: 'core:speed' } } });
    const kernel = kernelWith(ORDER, scout);
    const scouted = play(startWith(kernel, free), command('archers-1'), free, kernel);

    expect(reason(kernel.execute(startWith(kernel, free), command('pikemen-1'), free))).toStrictEqual([
      'kernel:not-your-turn',
      {},
    ]);

    expect(scouted.events.find(({ type }) => type === 'kernel:unit-moved')?.payload)
      .toStrictEqual({ path: ['1,1', '1,2'], unit: 'archers-1' });

    expect(unitOf(scouted.state, 'archers-1').spentActions).toStrictEqual({ 'core:speed': 2 });
    expect(scouted.state.variables.scouted).toBe(true);
    expect(scouted.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('turns an evaluation that cannot fail into its value, and a failure into an error of content or package', () => {
    expect(settledValue({ kind: 'value', value: 3 }, 'acme:x')).toBe(3);
    expect(() => settledValue({ kind: 'reject', reason: 'kernel:out-of-range' }, 'acme:x')).toThrow(ContentError);
    expect(() => settledValue({ kind: 'reject', reason: 'acme:no' }, 'acme:x')).toThrow(TypeError);
    expect(() => settledValue({ kind: 'reject', reason: 'acme:no' }, 'acme:x')).not.toThrow(ContentError);
  });
});

describe('ending the turn from a step', () => {
  it('ends the turn after the rest of the command when a step added by another step asks for it', () => {
    const early: StepKind = {
      kind: 'step',
      migrations: [],
      name: 'acme:early',
      run: () => ({ events: [], kind: 'done', steps: [turnCheckDraft({ end: true }), mark('after')] }),
      version: 1,
    };
    const go: CommandKind = {
      kind: 'command',
      name: 'acme:go',
      plan: () => ({ kind: 'steps', steps: [{ params: {}, type: 'acme:early' }, mark('last')] }),
      schema: { type: 'object' },
    };
    const kernel = kernelWith(ORDER, early, go);
    const gone = play(PLACED, { kind: 'game', name: 'acme:go', payload: {}, type: 'extension' }, CONTENT, kernel);
    const types = gone.events.map(({ payload, type }) => asRecord(payload).variable ?? type);

    expect(types.slice(0, 3)).toStrictEqual(['after', 'last', 'kernel:turn-ended']);
    expect(gone.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('shows a placed unit at the start of the battle only to the sides that see the unit', () => {
    const hidden = SCENARIO.sides.map((side) => (side.id === 'attacker'
      ? { ...side, units: side.units.map((unit) => ({ ...unit, visibleTo: ['attacker'] })) }
      : side));
    const content = withScenario({ sides: hidden });
    const created = KERNEL.createState({ scenario: 'demo:duel' }, content);
    const started = play(play(created, place('archers-1', '0,1'), content).state, finish(), content);

    expect(started.events.filter(({ type }) => type === 'kernel:unit-placed').map(({ visibleTo }) => visibleTo))
      .toStrictEqual([['attacker']]);
  });
});

describe('the course of the battle and packages', () => {
  it('treats a rejecting hook as an error of the package, and an endless loop of triggers as one of content', () => {
    const refusing = variant('acme:refusing', { roundStart: () => [{ params: {}, type: 'acme:fail' }] });
    const loop = {
      condition: node('kernel:not', { condition: node('kernel:variable-is', { value: 'never', variable: 'moved' }) }),
      id: 'loop',
      on: 'kernel:variable-set',
      ops: [node('kernel:set-variable', { value: true, variable: 'moved' })],
      priority: 0,
    };
    const looping = withScenario({ triggers: [loop] });
    const thrown = catched(() => battleWith(refusing));

    expect(thrown).toBeInstanceOf(TypeError);
    expect(asRecord(thrown).name).toBe('TypeError');
    expect(() => play(PLACED, turnEnd(), looping, kernelWith(ORDER))).toThrow(ContentError);

    expect(() => play(PLACED, turnEnd(), looping, kernelWith(ORDER)))
      .toThrow(/goes beyond .* at "kernel:scenario-check" in round 1, phase "turn", for example/u);

    expect(unitOf(PLACED, 'archers-1').count).toBe(10);
  });
});

function command(unit: string): ExtensionCommand {
  return { kind: 'game', name: 'acme:scout', payload: { unit }, type: 'extension' };
}

function turnEnd(): { readonly kind: 'game'; readonly type: 'end-turn'; readonly unit: string } {
  return { kind: 'game', type: 'end-turn', unit: 'archers-1' };
}

function catched(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}
