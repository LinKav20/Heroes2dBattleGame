import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../content/index.ts';
import type { CommandKind, StepKind, TurnOrderVariant } from '../../extensions/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { BattleState, Command, ExtensionCommand, GameCommand, TurnHolder } from '../../model/index.ts';
import { act, answerRoll, begin, endTurn, wait, type Drive } from '../../tests/scenarios/driver.ts';
import { arena, node, PASS, SEED, SPEED, WORLD_EXTENSIONS, WORLD_KERNEL } from '../../tests/scenarios/world.ts';

describe('a simulation of a command', () => {
  it('rolls every die at its lowest or highest side, marked simulated, and never moves the generator', () => {
    const { drive, state } = duel();
    const lowest = WORLD_KERNEL.simulate(state, GAMBLE, drive.content, 'lowest');
    const highest = WORLD_KERNEL.simulate(state, GAMBLE, drive.content, 'highest');

    expect(lowest).toStrictEqual({
      ok: false,
      rejection: { code: 'rule-violation', params: {}, reason: 'acme:unlucky' },
    });

    expect(highest.ok && highest.events.filter(({ type }) => type === 'kernel:roll-made').map(({ payload }) => payload))
      .toStrictEqual([{ dice: [6], name: 'demo:damage', result: 6, source: 'simulated' }]);

    expect(highest.ok && highest.state.rng).toStrictEqual(state.rng);

    expect(highest.ok && highest.state.units.find(({ id }) => id === 'knight-1')?.spentActions)
      .toStrictEqual({ 'core:action': 1 });
  });

  it('rolls dice from outside at once instead of asking for them', () => {
    const { drive, state } = duel({ ruleset: { randomSources: { 'demo:damage': 'external' } } });
    const asked = WORLD_KERNEL.execute(state, GAMBLE, drive.content);
    const simulated = WORLD_KERNEL.simulate(state, GAMBLE, drive.content, 'highest');

    expect(asked.ok && asked.state.inputRequest?.kind).toBe('roll');
    expect(simulated.ok && simulated.state.inputRequest).toBeUndefined();
    expect(simulated.ok && simulated.events.some(({ type }) => type === 'kernel:input-requested')).toBe(false);
  });

  it('still asks for a choice', () => {
    const { drive, state } = duel();
    const simulated = CHOOSING.kernel.simulate(state, CHOOSE, drive.content, 'lowest');

    expect(simulated.ok && simulated.state.inputRequest).toMatchObject({ kind: 'choice', name: 'acme:pick' });
  });

  it('leaves out a step that needs a value when it has no rolls, a roll and a choice alike', () => {
    const { drive, state } = duel();
    const rolled = CHOOSING.kernel.simulate(state, GAMBLE, drive.content, 'none');
    const chosen = CHOOSING.kernel.simulate(state, CHOOSE, drive.content, 'none');

    expect(rolled.ok && rolled.events.map(({ type }) => type).includes('kernel:roll-made')).toBe(false);
    expect(rolled.ok && rolled.state.units.find(({ id }) => id === 'knight-1')?.spentActions).toStrictEqual({});
    expect(chosen.ok && chosen.state.inputRequest).toBeUndefined();
    expect(chosen.ok && chosen.state.variables.picked).toBeUndefined();
  });

  it('runs on a projection, where the kernel runs no command', () => {
    const { drive, state } = duel();
    const projection = WORLD_KERNEL.project(state, drive.content, { kind: 'sides', sides: ['attacker'] });

    expect(() => WORLD_KERNEL.execute(projection, GAMBLE, drive.content))
      .toThrow('A projection does not run commands.');

    expect(WORLD_KERNEL.simulate(projection, GAMBLE, drive.content, 'highest').ok).toBe(true);
  });

  it('forecasts a command with the lowest and the highest rolls, the same as the two simulations', () => {
    const { drive, state } = duel();
    const forecast = WORLD_KERNEL.forecast(state, GAMBLE, drive.content);

    expect(forecast).toStrictEqual({
      highest: WORLD_KERNEL.simulate(state, GAMBLE, drive.content, 'highest'),
      lowest: WORLD_KERNEL.simulate(state, GAMBLE, drive.content, 'lowest'),
    });

    expect(WORLD_KERNEL.forecast(state, endTurn('knight-1'), drive.content).lowest)
      .toStrictEqual(WORLD_KERNEL.forecast(state, endTurn('knight-1'), drive.content).highest);
  });

  it('refuses the content of another battle, as the queue, the available actions and the attributes do', () => {
    const { drive, state } = duel();
    const other = { ...drive.content, contentHash: 'other' };
    const calls = [
      () => WORLD_KERNEL.simulate(state, GAMBLE, other, 'lowest'),
      () => WORLD_KERNEL.forecast(state, GAMBLE, other),
      () => WORLD_KERNEL.turnQueue(state, other, 1),
      () => WORLD_KERNEL.availableActions(state, other),
      () => WORLD_KERNEL.attributes(state, other, { kind: 'unit', unit: 'knight-1' }),
    ];

    for (const call of calls) {
      expect(call).toThrow(/but the battle was started with/);
    }
  });
});

describe('a simulation on a projection for sides', () => {
  it('counts its own firings of triggers, so a chain of triggers with a limit ends', () => {
    const { drive, state } = chained();
    const projection = WORLD_KERNEL.project(state, drive.content, BOTH);
    const move = moveOf(state, drive);
    const simulated = WORLD_KERNEL.simulate(projection, move, drive.content, 'lowest');
    const { highest, lowest } = WORLD_KERNEL.forecast(projection, move, drive.content);

    expect(projection.triggers).toStrictEqual({});

    for (const result of [simulated, lowest, highest]) {
      expect(result.ok && [result.state.variables.probe, result.state.triggers, result.state.visibility])
        .toStrictEqual([2, { once: { fired: 1 }, 'on-move': { fired: 1 } }, BOTH]);
    }

    expect(WORLD_KERNEL.availableActions(projection, drive.content)).toContainEqual(move);
  });

  it('keeps the counts of triggers closed in the replay of the battle', () => {
    const { drive, state } = chained();
    const move = moveOf(state, drive);
    const played = act(state, move, drive);
    const events = WORLD_KERNEL.projectEvents(state, played.events, drive.content, BOTH);
    const replayed = events.reduce(
      (current, event) => WORLD_KERNEL.applyEvent(current, event),
      WORLD_KERNEL.project(state, drive.content, BOTH),
    );

    expect(played.state.triggers).toStrictEqual({ once: { fired: 1 }, 'on-move': { fired: 1 } });
    expect(replayed.triggers).toStrictEqual({});
    expect(replayed).toStrictEqual(WORLD_KERNEL.project(played.state, drive.content, BOTH));
  });

  it('counts the firings that wait for the answer to a request it opened when it simulates the answer', () => {
    const { drive, state } = marked();
    const projection = MARKING.kernel.project(state, drive.content, BOTH);
    const asked = MARKING.kernel.simulate(projection, MARK, drive.content, 'lowest');

    expect(asked.ok && [asked.state.variables.hits, asked.state.triggers, asked.state.inputRequest?.kind])
      .toStrictEqual([0, {}, 'choice']);

    if (!asked.ok || asked.state.inputRequest === undefined) throw new Error('No request');

    const { id } = asked.state.inputRequest;
    const answer: Command = { kind: 'answer', request: id, value: { kind: 'choice', option: 'yes' } };
    const answered = MARKING.kernel.simulate(asked.state, answer, drive.content, 'lowest');

    expect(answered.ok && [answered.state.variables.hits, answered.state.triggers, answered.state.visibility])
      .toStrictEqual([1, { count: { fired: 1 } }, BOTH]);
  });

  it('throws for an answer to a request of the battle, whose waiting steps the projection does not keep', () => {
    const { drive, state } = duel({ ruleset: { randomSources: { 'demo:damage': 'external' } } });
    const asked = act(state, GAMBLE, drive).state;
    const projection = WORLD_KERNEL.project(asked, drive.content, BOTH);
    const answer = answerRoll(asked.inputRequest?.id ?? 0, 6);

    expect(projection.inputRequest).toStrictEqual(asked.inputRequest);
    expect(WORLD_KERNEL.simulate(asked, answer, drive.content, 'lowest').ok).toBe(true);
    expect(() => WORLD_KERNEL.simulate(projection, answer, drive.content, 'lowest')).toThrow(TypeError);
  });
});

describe('the queue of turns', () => {
  it('names the holders in the order the turns come when every holder ends its turn', () => {
    const { drive, state } = duel();
    const played = playedTurns(state, drive, 7);

    expect(played.length).toBe(7);
    expect(WORLD_KERNEL.turnQueue(state, drive.content, 7).map(holderName)).toStrictEqual(played);
  });

  it('goes on after a wait and is shorter when the battle ends in the middle of it', () => {
    const { drive, state } = duel();
    const waited = act(state, wait('knight-1'), drive).state;
    const played = playedTurns(waited, drive, 100);

    expect(played.length).toBeLessThan(100);
    expect(WORLD_KERNEL.turnQueue(waited, drive.content, 100).map(holderName)).toStrictEqual(played);
  });

  it('is empty for no turns or an ended battle and refuses a number that is not a whole number from 0', () => {
    const { drive, state } = duel();
    const ended = act(state, { kind: 'game', side: 'attacker', type: 'surrender' }, drive).state;

    expect(WORLD_KERNEL.turnQueue(state, drive.content, 0)).toStrictEqual([]);
    expect(WORLD_KERNEL.turnQueue(ended, drive.content, 5)).toStrictEqual([]);
    expect(() => WORLD_KERNEL.turnQueue(state, drive.content, -1)).toThrow(RangeError);
    expect(() => WORLD_KERNEL.turnQueue(state, drive.content, 1.5)).toThrow(RangeError);
  });

  it('leaves out the rest of a command that waits for an answer in a turn, and the holder ends the turn', () => {
    const { drive, state } = duel({ ruleset: { randomSources: { 'demo:damage': 'external' } } });
    const asked = act(state, GAMBLE, drive).state;

    expect(asked.inputRequest).toBeDefined();

    expect(WORLD_KERNEL.turnQueue(asked, drive.content, 3))
      .toStrictEqual(WORLD_KERNEL.turnQueue(state, drive.content, 3));
  });

  it('goes on through a roll between turns, leaving the roll out, and is empty there on a projection', () => {
    const state = omened();
    const asked = omenOf(state, endTurn('knight-1'));
    const queue = OMENS.kernel.turnQueue(state, OMENS.content, 6);
    const projection = OMENS.kernel.project(asked, OMENS.content, BOTH);

    expect([asked.phase.kind, asked.inputRequest?.kind]).toStrictEqual(['between-turns', 'roll']);
    expect(queue).toStrictEqual(WORLD_KERNEL.turnQueue(duel().state, CHOOSING.content, 6));
    expect(OMENS.kernel.turnQueue(asked, OMENS.content, 5)).toStrictEqual(queue.slice(1));
    expect(OMENS.kernel.turnQueue(projection, OMENS.content, 5)).toStrictEqual([]);
  });

  it('counts the firings of triggers on a projection for sides, so a chain at the end of a turn ends', () => {
    const { drive, state } = begin(ECHOING);
    const turn = holderFirst(state, drive);
    const projection = WORLD_KERNEL.project(turn, drive.content, BOTH);

    expect(WORLD_KERNEL.turnQueue(projection, drive.content, 6))
      .toStrictEqual(WORLD_KERNEL.turnQueue(turn, drive.content, 6));
  });

  it('names the side in the turn of a unit the projection does not show, and only the units it shows', () => {
    const { drive, state } = begin(HIDDEN);
    const turn = holderFirst(state, drive);
    const queue = WORLD_KERNEL.turnQueue(WORLD_KERNEL.project(turn, drive.content, DEFENDER), drive.content, 6);

    expect(turn.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'knight-1' });
    expect(queue.length).toBe(6);
    expect(queue[0]).toStrictEqual({ kind: 'side', side: 'attacker' });
    expect(new Set(queue.slice(1).map(holderName))).toStrictEqual(new Set(['archers-1', 'golem-1']));
  });
});

const GAMBLE: ExtensionCommand = { kind: 'game', name: 'acme:gamble', payload: {}, type: 'extension' };

const CHOOSE: ExtensionCommand = { kind: 'game', name: 'acme:choose', payload: {}, type: 'extension' };

const CHOOSE_COMMAND: CommandKind = {
  kind: 'command',
  name: 'acme:choose',
  plan: () => ({ kind: 'steps', steps: [{ params: {}, type: 'acme:pick' }] }),
  schema: { type: 'object' },
};

const PICK_STEP: StepKind = {
  kind: 'step',
  migrations: [],
  name: 'acme:pick',
  run: ({ inputs }) => (inputs.length === 0
    ? { kind: 'need', need: { kind: 'choice', name: 'acme:pick', options: ['yes', 'no'] } }
    : { events: [], kind: 'done' }),
  version: 1,
};

const CHOOSING: Drive = {
  content: arena({ 'golem-1': '6,2', 'knight-1': '1,2' }),
  kernel: createKernel({ extensions: [...WORLD_EXTENSIONS, CHOOSE_COMMAND, PICK_STEP] }),
};

const BOTH = { kind: 'sides', sides: ['attacker', 'defender'] } as const;

const DEFENDER = { kind: 'sides', sides: ['defender'] } as const;

const MARK: ExtensionCommand = { kind: 'game', name: 'acme:mark', payload: {}, type: 'extension' };

const MARK_COMMAND: CommandKind = {
  kind: 'command',
  name: 'acme:mark',
  plan: () => ({
    kind: 'steps',
    steps: [{ params: {}, type: 'acme:note' }, { params: {}, type: 'acme:pick' }, { params: {}, type: 'acme:note' }],
  }),
  schema: { type: 'object' },
};

const NOTE_STEP: StepKind = {
  kind: 'step',
  migrations: [],
  name: 'acme:note',
  run: () => ({
    events: [{ payload: { value: 1, variable: 'probe' }, type: 'kernel:variable-set', visibleTo: 'all' }],
    kind: 'done',
  }),
  version: 1,
};

const MARKING: Drive = {
  content: arena({ 'golem-1': '6,2', 'knight-1': '1,2' }, {}, {
    triggers: [{
      condition: node('kernel:event-is', { path: ['variable'], value: 'probe' }),
      id: 'count',
      limit: 1,
      on: 'kernel:variable-set',
      ops: [node('kernel:set-variable', {
        value: node('kernel:add', { values: [node('kernel:variable', { variable: 'hits' }), 1] }),
        variable: 'hits',
      })],
      priority: 0,
    }],
    variables: { drums: 0, 'first-blood': false, hits: 0, probe: 0, turns: 0 },
  }),
  kernel: createKernel({ extensions: [...WORLD_EXTENSIONS, MARK_COMMAND, NOTE_STEP, PICK_STEP] }),
};

const CHAINED: ContentRegistry = arena({ 'golem-1': '6,2', 'knight-1': '1,2' }, {}, {
  triggers: [
    {
      id: 'on-move',
      limit: 1,
      on: 'kernel:unit-moved',
      ops: [node('kernel:set-variable', { value: 1, variable: 'probe' })],
      priority: 0,
    },
    {
      condition: node('kernel:compare', {
        left: node('kernel:variable', { variable: 'probe' }),
        operator: '>',
        right: 0,
      }),
      id: 'once',
      limit: 1,
      on: 'kernel:variable-set',
      ops: [node('kernel:set-variable', {
        value: node('kernel:add', { values: [node('kernel:variable', { variable: 'probe' }), 1] }),
        variable: 'probe',
      })],
      priority: 0,
    },
  ],
  variables: { drums: 0, 'first-blood': false, probe: 0, turns: 0 },
});

const ECHOING: ContentRegistry = arena({ 'golem-1': '6,2', 'knight-1': '1,2' }, {}, {
  triggers: [
    {
      id: 'on-end',
      limit: 1,
      on: 'kernel:turn-end',
      ops: [node('kernel:set-variable', { value: 1, variable: 'probe' })],
      priority: 0,
    },
    ...(CHAINED.scenarios['demo:pass']?.triggers.filter(({ id }) => id === 'once') ?? []),
  ],
  variables: { drums: 0, 'first-blood': false, probe: 0, turns: 0 },
});

const HIDDEN: ContentRegistry = arena(
  { 'archers-1': '1,1', 'golem-1': '6,2', 'knight-1': '1,2' },
  { 'knight-1': { visibleTo: ['attacker'] } },
);

const PROBE = node('kernel:variable', { variable: 'probe' });

const OMEN_STEP: StepKind = {
  kind: 'step',
  migrations: [],
  name: 'acme:omen',
  run: ({ inputs }) => (inputs.length === 0
    ? { kind: 'need', need: { count: 1, kind: 'roll', name: 'demo:damage', sides: 6 } }
    : {
        events: [{ payload: { value: 1, variable: 'probe' }, type: 'kernel:variable-set', visibleTo: 'all' }],
        kind: 'done',
      }),
  version: 1,
};

const OMENS_ORDER: TurnOrderVariant = {
  ...SPEED,
  name: 'acme:omens',
  turnEnd: () => [{ params: {}, type: 'acme:omen' }],
};

const OMENS: Drive = {
  content: arena({ 'golem-1': '6,2', 'knight-1': '1,2' }, {}, {
    outcomes: [
      ...PASS.outcomes,
      {
        condition: node('kernel:compare', { left: PROBE, operator: '>', right: 0 }),
        id: 'omen',
        outcome: 'victory',
        side: 'defender',
      },
    ],
    variables: { drums: 0, 'first-blood': false, probe: 0, turns: 0 },
  }),
  kernel: createKernel({ extensions: [...WORLD_EXTENSIONS, OMEN_STEP, OMENS_ORDER] }),
};

function omened(): BattleState {
  const state = OMENS.kernel.createState({
    ruleset: {
      mechanics: { 'kernel:turn-order': { variant: 'acme:omens' } },
      randomSources: { 'demo:damage': 'external' },
    },
    scenario: 'demo:pass',
    seed: SEED,
  }, OMENS.content);

  return omenOf(state, { kind: 'game', type: 'start-battle' });
}

function omenOf(state: BattleState, command: Command): BattleState {
  const result = OMENS.kernel.execute(state, command, OMENS.content);

  if (!result.ok) throw new Error(`${JSON.stringify(command)} rejected`);

  return result.state;
}

function playedTurns(state: BattleState, drive: Drive, turns: number): readonly string[] {
  const played: string[] = [];
  let current = state;

  while (played.length < turns && current.phase.kind === 'turn') {
    const holder = current.phase.unit ?? '';

    played.push(holder);
    current = act(current, endTurn(holder), drive).state;
  }

  return played;
}

function holderName(holder: TurnHolder): string {
  return holder.kind === 'unit' ? holder.unit : holder.side;
}

function chained(): { drive: Drive; state: BattleState } {
  const { drive, state } = begin(CHAINED);

  return { drive, state: holderFirst(state, drive) };
}

function marked(): { drive: Drive; state: BattleState } {
  const { state } = begin(MARKING.content);

  return { drive: MARKING, state: holderFirst(state, MARKING) };
}

function moveOf(state: BattleState, drive: Drive): GameCommand {
  const from = state.units.find(({ id }) => id === 'knight-1')?.cell;
  const reachable = drive.kernel.field(state, drive.content).reachable('knight-1', 1);
  const to = reachable.find(({ cell }) => cell !== from)?.cell;

  return { kind: 'game', to: to ?? '', type: 'move', unit: 'knight-1' };
}

function duel(options: Parameters<typeof begin>[1] = {}): { drive: Drive; state: BattleState } {
  const { state } = begin(CHOOSING.content, options);

  return { drive: CHOOSING, state: holderFirst(state, CHOOSING) };
}

function holderFirst(state: BattleState, drive: Drive): BattleState {
  let current = state;

  while (current.phase.kind === 'turn' && current.phase.unit !== 'knight-1') {
    current = act(current, endTurn(current.phase.unit ?? ''), drive).state;
  }

  return current;
}
