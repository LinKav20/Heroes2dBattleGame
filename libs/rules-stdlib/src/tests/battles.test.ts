import {
  creatureDefinition,
  hashJson,
  standsOnField,
  type BattleEvent,
  type BattleState,
  type Command,
  type ContentRegistry,
  type FieldGeometry,
  type ScenarioUnit,
  type Unit,
} from '@heroes2dgame/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AttackedPayload, MoraleRolledPayload } from '../index.ts';
import {
  attack,
  checkInvariants,
  contentWith,
  endTurn,
  EXTERNAL,
  frozen,
  KERNEL,
  roll,
  RULESET,
  shoot,
  started,
  wait,
  withUnits,
} from './world.ts';

interface Trace {
  readonly chain: string;
  readonly outcome: unknown;
  readonly seen: readonly string[];
  readonly steps: number;
}

interface Fought {
  readonly events: readonly BattleEvent[];
  readonly commands: readonly Command[];
  readonly state: BattleState;
}

interface RandomBattle extends Fought {
  readonly hidden: readonly string[];
}

type Arena = 'initiative' | 'sides' | 'speed';

describe('whole battles of the standard rules', { timeout: 60_000 }, () => {
  it.each(ORDERS)('stay the same by the %s order with rolls of the generator', (arena) => {
    expect(trace(arena, false)).toStrictEqual(TRACES[arena].generator);
  });

  it.each(ORDERS)('stay the same by the %s order with rolls from outside', (arena) => {
    expect(trace(arena, true)).toStrictEqual(TRACES[arena].external);
  });

  it.each(ORDERS)('by the %s order keep every invariant, whatever the players try', (arena) => {
    fc.assert(fc.property(CHOICES, fc.boolean(), (choices, external) => {
      randomBattle(arena, external, choices);
    }), { numRuns: 15, seed: 1301 });
  });

  it('reach deaths, later rounds, ends, waiting, defense, morale, luck, every kind of strike and of hiding', () => {
    const seen = new Set<string>();

    fc.assert(fc.property(fc.constantFrom(...ORDERS), CHOICES, fc.boolean(), (arena, choices, external) => {
      const battle = randomBattle(arena, external, choices);

      [...seenIn(battle), ...battle.hidden].forEach((mark) => seen.add(mark));
    }), { numRuns: 30, seed: 1302 });

    expect([...seen].sort()).toStrictEqual(expect.arrayContaining(REACHED));
  });
});

const ORDERS: readonly Arena[] = ['speed', 'initiative', 'sides'];

const CHOICES = fc.array(fc.nat(), { maxLength: 200, minLength: 40 });

const SPIRITS: Readonly<Record<string, Partial<ScenarioUnit>>> = {
  'archers-1': { effects: ['demo:misfortune'] },
  'griffins-1': { effects: ['demo:despair'] },
  'pikemen-1': { effects: ['demo:bless', 'demo:fortune'] },
};

const ARENAS = arenas(SPIRITS);

const HIDDEN = arenas({
  ...SPIRITS,
  'griffins-1': { ...SPIRITS['griffins-1'], visibleTo: ['defender'] },
  'pikemen-1': { ...SPIRITS['pikemen-1'], visibleTo: ['attacker'] },
});

const REACHED = [
  'attacked:melee',
  'attacked:retaliation',
  'attacked:shot',
  'command:defend',
  'command:wait',
  'data:attacker',
  'data:defender',
  'death',
  'ended',
  'hidden:attacker',
  'hidden:defender',
  'luck:bad',
  'luck:good',
  'morale:bad',
  'morale:good',
  'round-3',
  'turn:attacker',
  'turn:defender',
];

const TRACES: Readonly<Record<Arena, { readonly external: Trace; readonly generator: Trace }>> = {
  initiative: {
    external: {
      chain: '9f8beaf8decac543',
      outcome: victory('rout', 'attacker'),
      seen: [
        'attacked:melee',
        'attacked:retaliation',
        'attacked:shot',
        'command:attack',
        'command:end-turn',
        'command:move',
        'command:shoot',
        'death',
        'ended',
        'luck:bad',
        'luck:good',
        'round-3',
      ],
      steps: 48,
    },
    generator: {
      chain: '0b8ec9f1c413f1f2',
      outcome: victory('wiped-out', 'defender'),
      seen: [
        'attacked:melee',
        'attacked:retaliation',
        'attacked:shot',
        'command:attack',
        'command:end-turn',
        'command:move',
        'command:shoot',
        'death',
        'ended',
        'luck:bad',
        'luck:good',
        'round-3',
      ],
      steps: 22,
    },
  },
  sides: {
    external: {
      chain: '9d0e3044682e6f0a',
      outcome: victory('wiped-out', 'defender'),
      seen: [
        'attacked:melee',
        'attacked:retaliation',
        'attacked:shot',
        'command:attack',
        'command:end-turn',
        'command:move',
        'command:shoot',
        'death',
        'ended',
        'luck:bad',
        'round-3',
      ],
      steps: 66,
    },
    generator: {
      chain: '8cdfe63f7e4d8745',
      outcome: victory('rout', 'attacker'),
      seen: [
        'attacked:melee',
        'attacked:retaliation',
        'attacked:shot',
        'command:attack',
        'command:end-turn',
        'command:move',
        'command:shoot',
        'death',
        'ended',
        'luck:good',
        'round-3',
      ],
      steps: 19,
    },
  },
  speed: {
    external: {
      chain: 'ba718d857d4832f2',
      outcome: victory('rout', 'attacker'),
      seen: [
        'attacked:melee',
        'attacked:retaliation',
        'attacked:shot',
        'command:attack',
        'command:end-turn',
        'command:move',
        'command:shoot',
        'death',
        'ended',
        'luck:bad',
        'morale:bad',
        'morale:good',
        'round-3',
      ],
      steps: 43,
    },
    generator: {
      chain: '946be95b52b50fb8',
      outcome: victory('wiped-out', 'defender'),
      seen: [
        'attacked:melee',
        'attacked:retaliation',
        'attacked:shot',
        'command:attack',
        'command:end-turn',
        'command:move',
        'command:shoot',
        'death',
        'ended',
        'luck:bad',
        'round-3',
      ],
      steps: 18,
    },
  },
};

function trace(arena: Arena, external: boolean): Trace {
  const content = ARENAS[arena];
  const hashes: string[] = [];
  const events: BattleEvent[] = [];
  const commands: Command[] = [];
  let state = start(content, external);

  while (state.phase.kind !== 'ended' && hashes.length < 500) {
    const before = state;
    const tried = candidates(before, content, false).map((command) => ({ command, result: execute(before, command) }));
    const accepted = tried.find(({ result }) => result.ok);

    if (!accepted?.result.ok) throw new Error(`No command fits at step ${String(hashes.length)}`);

    checkInvariants(before, accepted.command, accepted.result, content);
    state = accepted.result.state;
    events.push(...accepted.result.events);
    commands.push(accepted.command);
    hashes.push(hashJson([state, accepted.result.events]).slice(0, 16));
  }

  return {
    chain: hashJson(hashes).slice(0, 16),
    outcome: state.phase.kind === 'ended' ? state.phase.outcome : undefined,
    seen: seenIn({ commands, events, state }),
    steps: hashes.length,
  };

  function execute(before: BattleState, command: Command): ReturnType<typeof KERNEL.execute> {
    return KERNEL.execute(frozen(before), frozen(command), frozen(content));
  }
}

function randomBattle(arena: Arena, external: boolean, choices: readonly number[]): RandomBattle {
  const content = HIDDEN[arena];
  const hidden: string[] = [];
  const events: BattleEvent[] = [];
  const commands: Command[] = [];
  let state = start(content, external);

  for (const choice of choices) {
    if (state.phase.kind === 'ended') break;

    const options = [...candidates(state, content, true, choice)];

    while (options.length > 0) {
      const [command] = options.splice(choice % options.length, 1);

      if (command === undefined) break;

      const result = KERNEL.execute(frozen(state), frozen(command), frozen(content));

      if (result.ok) {
        checkInvariants(state, command, result, content);
        hidden.push(...hiddenIn(state, result.events, content));
        events.push(...result.events);
        commands.push(command);
        state = result.state;

        break;
      }

      expect(result.rejection.reason).toMatch(/^(?:kernel|rules-stdlib):/u);
    }
  }

  return { commands, events, hidden: [...new Set(hidden)].sort(), state };
}

function arenas(units: Readonly<Record<string, Partial<ScenarioUnit>>>): Readonly<Record<Arena, ContentRegistry>> {
  const scenario = withUnits(units);

  return {
    initiative: contentWith(scenario, {
      mechanics: {
        ...RULESET.mechanics,
        'kernel:turn-order': {
          params: { bonus: 'core:speed', roll: 'core:initiative', sides: 20, tie: 'core:attack' },
          variant: 'rules-stdlib:initiative',
        },
      },
    }),
    sides: contentWith(scenario, {
      mechanics: { ...RULESET.mechanics, 'kernel:turn-order': { variant: 'rules-stdlib:sides' } },
      turnOwner: 'side',
    }),
    speed: contentWith(scenario),
  };
}

function start(content: ContentRegistry, external: boolean): BattleState {
  return started(content, external ? { ruleset: EXTERNAL } : {});
}

function candidates(state: BattleState, content: ContentRegistry, free: boolean, seed = 0): readonly Command[] {
  const { inputRequest, phase } = state;

  if (inputRequest?.kind === 'roll') {
    return [roll(inputRequest.id, ...Array.from({ length: inputRequest.count }, (unused, index) =>
      1 + ((inputRequest.id * 7 + index * 3 + seed) % inputRequest.sides)))];
  }

  if (phase.kind !== 'turn') return [];

  const field = KERNEL.field(state, content);
  const actors = state.units.filter((one) => standsOnField(one)
    && (phase.unit === undefined ? one.side === phase.side : one.id === phase.unit));
  const commands: Command[] = [];

  for (const actor of actors) {
    const enemies = state.units.filter((one) => standsOnField(one) && one.side !== actor.side);
    const budget = creatureDefinition(content, actor.creature).attributes['core:speed'] ?? 0;
    const reachable = field.reachable(actor.id, budget).map(({ cell }) => cell);
    const here = actor.cell === undefined ? 99 : nearest(field, actor.cell, enemies);

    commands.push(
      ...enemies.map((one) => shoot(actor.id, one.id)),
      ...enemies.map((one) => attack(actor.id, one.id)),
      ...enemies.flatMap((one) => reachable
        .filter((cell) => field.distanceBetween([cell], field.cellsOf(one.id)) === 1)
        .map((cell) => attack(actor.id, one.id, cell))),
      ...reachable.filter((cell) => nearest(field, cell, enemies) < here)
        .toSorted((left, right) => nearest(field, left, enemies) - nearest(field, right, enemies))
        .map((to): Command => ({ kind: 'game', to, type: 'move', unit: actor.id })),
    );

    if (free) commands.push(wait(actor.id), { kind: 'game', type: 'defend', unit: actor.id });
  }

  commands.push(phase.unit === undefined
    ? { kind: 'game', side: phase.side, type: 'end-turn' }
    : endTurn(phase.unit));

  return commands;
}

function seenIn({ commands, events, state }: Fought): readonly string[] {
  const seen = new Set<string>([
    ...commands.flatMap((command) => (command.kind === 'game' ? [`command:${command.type}`] : [])),
    `round-${String(Math.min(state.round, 3))}`,
  ]);

  for (const { payload, type } of events) {
    if (type === 'rules-stdlib:attacked') {
      const { kind, luck } = payload as AttackedPayload;

      seen.add(`attacked:${kind}`);

      if (luck !== undefined) seen.add(`luck:${luck}`);
    }

    if (type === 'rules-stdlib:morale-rolled') seen.add(`morale:${(payload as MoraleRolledPayload).kind}`);
  }

  if (state.units.some(({ count }) => count === 0)) seen.add('death');

  if (state.phase.kind === 'ended') seen.add('ended');

  return [...seen].sort();
}

function hiddenIn(before: BattleState, events: readonly BattleEvent[], content: ContentRegistry): readonly string[] {
  return before.sides.flatMap(({ id }) => KERNEL.projectEvents(before, events, content, { kind: 'sides', sides: [id] })
    .flatMap(({ type }, index) => {
      if (type === 'kernel:hidden') return [`hidden:${id}`];

      if (type === 'kernel:data-changed') return [`data:${id}`];

      return type === 'kernel:phase-changed' && events[index]?.type === 'kernel:turn-ended' ? [`turn:${id}`] : [];
    }));
}

function nearest(field: FieldGeometry, cell: string, enemies: readonly Unit[]): number {
  return Math.min(...enemies.map((one) => field.distanceBetween([cell], field.cellsOf(one.id)) ?? 99));
}

function victory(condition: string, side: string): unknown {
  return { condition, kind: 'victory', side, winners: [side] };
}
