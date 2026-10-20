import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  abilityDefinition,
  creatureDefinition,
  hashJson,
  itemDefinition,
  standsOnField,
  type AbilityRequest,
  type BattleEvent,
  type BattleState,
  type Command,
  type ContentRegistry,
  type FieldGeometry,
  type Target,
  type Unit,
} from '../../index.ts';
import {
  answerRoll,
  at,
  cell,
  checkInvariants,
  defend,
  deployed,
  DRIVE,
  endTurn,
  frozen,
  move,
  use,
  useItem,
  useOfSide,
  wait,
  type Drive,
} from './driver.ts';
import { created, PASS, SKIRMISH, WORLD, worldWith } from './world.ts';

interface Played {
  readonly events: readonly BattleEvent[];
  readonly state: BattleState;
}

type Arena = 'brawl' | 'pass' | 'sides' | 'skirmish';

describe('random battles', () => {
  it.each(ARENAS)('at the %s keep every invariant, whatever the players try', (arena) => {
    fc.assert(fc.property(CHOICES, fc.boolean(), (choices, external) => {
      play(start(arena, external), choices, drive(arena));
    }), { numRuns: 25, seed: seedOf(1) });
  });

  it.each(ARENAS)('at the %s give the same battle for the same commands', (arena) => {
    fc.assert(fc.property(CHOICES, fc.boolean(), (choices, external) => {
      const first = play(start(arena, external), choices, drive(arena));
      const second = play(start(arena, external), choices, drive(arena), false);

      expect(hashJson(second.state)).toBe(hashJson(first.state));

      expect(first.events.reduce((state, event) => DRIVE.kernel.applyEvent(state, event), start(arena, external)))
        .toStrictEqual(first.state);
    }), { numRuns: 6, seed: seedOf(2) });
  });

  it.each(ARENAS)('at the %s accept what the rules allow and refuse the rest for the right reason', (arena) => {
    fc.assert(fc.property(CHOICES, fc.boolean(), (choices, external) => {
      const current = drive(arena);
      let state = start(arena, external);
      let allowed = 0;

      for (const choice of choices) {
        if (state.phase.kind === 'ended') break;

        allowed += checkLegality(state, choice, current);

        const result = current.kernel.execute(state, commandFor(state, choice, current), current.content);

        if (result.ok) state = result.state;
      }

      checkLegality(state, 0, current);
      expect(allowed).toBeGreaterThan(0);
    }), { numRuns: 15, seed: seedOf(5) });
  });

  it('end in the end by an outcome of the scenario, when the players only end their turns', () => {
    fc.assert(fc.property(CHOICES, (choices) => {
      let { state } = play(start('brawl', false), choices, drive('brawl'));

      while (state.phase.kind !== 'ended') {
        state = finished(state, drive('brawl'));
      }

      expect(['draw', 'retreat', 'surrender', 'victory']).toContain(state.phase.outcome.kind);
      expect(state.round).toBeLessThanOrEqual(7);
    }), { numRuns: 10, seed: seedOf(3) });
  });

  it('reach deaths, ticks of effects, input requests and every outcome, so the invariants are checked on them', () => {
    const seen = new Set<string>();

    fc.assert(fc.property(CHOICES, fc.boolean(), (choices, external) => {
      const { events, state } = play(start('skirmish', external), choices, drive('skirmish'));

      events.forEach((event) => seen.add(event.type));
      seen.add(`round-${String(Math.min(state.round, 3))}`);

      if (state.phase.kind === 'ended') seen.add(`${state.phase.outcome.kind}:${state.phase.outcome.condition ?? ''}`);

      if (state.units.some(({ count }) => count === 0)) seen.add('death');
    }), { numRuns: 60, seed: seedOf(4) });

    expect([...seen]).toStrictEqual(expect.arrayContaining([
      'death',
      'kernel:ability-uses-changed',
      'kernel:auras-changed',
      'kernel:command-aborted',
      'kernel:effect-applied',
      'kernel:effect-not-applied',
      'kernel:effect-removed',
      'kernel:input-closed',
      'kernel:input-requested',
      'kernel:item-changed',
      'kernel:roll-made',
      'kernel:zones-changed',
      'round-3',
      'victory:rout',
      'victory:wiped-out',
    ]));
  });
});

const ARENAS: readonly Arena[] = ['pass', 'brawl', 'skirmish', 'sides'];

const FRAGILE = {
  'archers-1': { count: 1, health: 4 },
  'ghosts-1': { count: 1, health: 3 },
  'golem-1': { health: 4 },
  'griffins-1': { count: 1, health: 6 },
  'knight-1': { health: 8 },
  'mage-1': { health: 4 },
};

const CHOICES = fc.array(fc.nat({ max: 1_000_000 }), { maxLength: 300, minLength: 30 });

const BRAWL_CELLS: Readonly<Record<string, string>> = {
  'archers-1': '1,1',
  'ghosts-1': '4,0',
  'griffins-1': '4,3',
  'knight-1': '2,2',
  'mage-1': '1,3',
};

const BRAWL: ContentRegistry = worldWith({
  sides: PASS.sides.map((side) => ({
    ...side,
    units: side.units.map((unit) => ({
      ...unit,
      cell: BRAWL_CELLS[unit.id] ?? unit.cell ?? '',
      effects: unit.id === 'golem-1' ? ['demo:bleed'] : unit.effects,
    })),
  })),
}, { mechanics: { ...SKIRMISH.mechanics, 'kernel:turn-order': { variant: 'acme:tide' } } });

const SIDE_TURNS: ContentRegistry = {
  ...BRAWL,
  rulesets: {
    'demo:skirmish': {
      ...SKIRMISH,
      mechanics: { ...SKIRMISH.mechanics, 'kernel:turn-order': { variant: 'acme:sides' } },
      turnOwner: 'side',
    },
  },
};

function drive(arena: Arena): Drive {
  if (arena === 'pass') return DRIVE;

  return { ...DRIVE, content: arena === 'sides' ? SIDE_TURNS : BRAWL };
}

function start(arena: Arena, external: boolean): BattleState {
  const options = {
    ...(external ? { ruleset: { randomSources: { 'demo:damage': 'external' as const } } } : {}),
    ...(arena === 'skirmish' ? { units: FRAGILE } : {}),
  };

  if (arena === 'pass') return deployed(created(WORLD, options));

  const { content } = drive(arena);
  const result = DRIVE.kernel.execute(created(content, options), { kind: 'game', type: 'start-battle' }, content);

  if (!result.ok) throw new Error('The brawl does not start');

  return result.state;
}

function seedOf(offset: number): number {
  return Number(process.env.FC_SEED ?? 20_261_019) + offset;
}

function play(first: BattleState, choices: readonly number[], current: Drive, check = true): Played {
  let state = first;
  const events: BattleEvent[] = [];

  for (const choice of choices) {
    if (state.phase.kind === 'ended') break;

    const command = commandFor(state, choice, current);
    const result = current.kernel.execute(frozen(state), frozen(command), frozen(current.content));

    if (!result.ok) {
      expect(result.rejection.reason, JSON.stringify(command)).toMatch(/^(?:kernel|acme):/u);
      continue;
    }

    if (check) checkInvariants(state, command, result, current);

    events.push(...result.events);
    state = result.state;
  }

  return { events, state };
}

function checkLegality(state: BattleState, choice: number, current: Drive): number {
  for (const [command, reason] of illegalCommands(state, choice)) {
    const result = current.kernel.execute(state, command, current.content);

    expect(result.ok ? undefined : result.rejection.reason, JSON.stringify(command)).toBe(reason);
  }

  const legal = legalCommands(state, choice, current);

  for (const command of legal) {
    const result = current.kernel.execute(state, command, current.content);

    expect(result.ok ? undefined : result.rejection, JSON.stringify(command)).toBeUndefined();
  }

  return legal.length;
}

function legalCommands(state: BattleState, choice: number, current: Drive): readonly Command[] {
  const { inputRequest: request, phase } = state;

  if (phase.kind === 'ended') return [];

  if (request !== undefined) {
    return request.kind === 'roll' ? [answerRoll(request.id, ...Array.from({ length: request.count }, () => 1))] : [];
  }

  const actor = actorOf(state, choice);

  if (actor === undefined) return [];

  const field = current.kernel.field(state, current.content);
  const allowed = aimedUses(state, actor, field, current.content).filter((command) => allows(state, command, current));
  const budget = (creatureDefinition(current.content, actor.creature).attributes['core:move'] ?? 0)
    - (actor.spentActions['core:move'] ?? 0);
  const steps = phase.kind !== 'turn' || phase.unit === undefined ? [] : field.reachable(actor.id, Math.max(0, budget));
  const walk = pick(steps, choice);

  return [
    endTurnOf(state),
    ...[pick(allowed, choice)].filter((command) => command !== undefined),
    ...(walk === undefined ? [] : [move(actor.id, walk.cell)]),
  ];
}

function allows(state: BattleState, command: Command, current: Drive): boolean {
  if (command.kind !== 'game' || command.type !== 'use-ability' || command.unit === undefined) return false;

  const request: AbilityRequest = {
    ability: command.ability,
    targets: command.targets,
    user: { kind: 'unit', unit: command.unit },
  };

  return current.kernel.checkAbility(state, request, current.content) === undefined;
}

function illegalCommands(state: BattleState, choice: number): ReadonlyArray<readonly [Command, string]> {
  const { phase } = state;
  const anyone = pick(state.units, choice)?.id ?? 'nobody-1';
  const dead = state.units.filter(({ count }) => count === 0);

  if (phase.kind === 'ended') {
    return [[endTurn(anyone), 'kernel:battle-over'], [answerRoll(1, 1), 'kernel:no-open-request']];
  }

  if (state.inputRequest !== undefined) {
    return [
      [endTurn(anyone), 'kernel:input-pending'],
      [answerRoll(state.inputRequest.id + 1, 1), 'kernel:no-open-request'],
    ];
  }

  const refused: Array<readonly [Command, string]> = [
    [answerRoll(state.nextRequestId, 1), 'kernel:no-open-request'],
    [endTurn('nobody-1'), 'kernel:invalid-command'],
    ...dead.slice(0, 1).map((one) => [move(one.id, '0,0'), 'kernel:unit-dead'] as const),
  ];

  if (phase.kind !== 'turn') return refused;

  const other = state.units.find((one) => standsOnField(one) && one.side !== phase.side);
  const elsewhere: Command | undefined = phase.unit === undefined
    ? other && { kind: 'game', side: other.side, type: 'end-turn' }
    : other && endTurn(other.id);

  return elsewhere === undefined ? refused : [...refused, [elsewhere, 'kernel:not-your-turn']];
}

function finished(state: BattleState, current: Drive): BattleState {
  const command = state.inputRequest === undefined ? endTurnOf(state) : answerRoll(state.inputRequest.id, 3);
  const result = current.kernel.execute(state, command, current.content);

  if (!result.ok) throw new Error(`${JSON.stringify(command)} rejected: ${JSON.stringify(result.rejection)}`);

  checkInvariants(state, command, result, current);

  return result.state;
}

function commandFor(state: BattleState, choice: number, current: Drive): Command {
  const request = state.inputRequest;

  if (request !== undefined) return answerRoll(request.id, choice % 23 === 0 ? 7 : 1 + (choice % 6));

  const kind = choice % 20;
  const rest = Math.floor(choice / 20);
  const actor = actorOf(state, rest);

  if (actor === undefined) return endTurnOf(state);
  const field = current.kernel.field(state, current.content);
  const aimed = aimedUses(state, actor, field, current.content);
  const closer = approach(state, actor, field, current.content);

  if (kind < 6) return pick(aimed.length > 0 ? aimed : closer, rest) ?? endTurn(actor.id);

  if (kind < 9) return pick(closer, rest) ?? endTurn(actor.id);

  return pick(randomCommands(state, actor, field, current.content, kind, rest), rest) ?? endTurn(actor.id);
}

function actorOf(state: BattleState, choice: number): Unit | undefined {
  const { phase } = state;

  if (phase.kind !== 'turn') return undefined;

  if (phase.unit !== undefined) return state.units.find((one) => one.id === phase.unit);

  const own = state.units.filter((one) => one.side === phase.side && standsOnField(one));

  return own[choice % Math.max(1, own.length)];
}

function endTurnOf(state: BattleState): Command {
  const { phase } = state;

  if (phase.kind !== 'turn') throw new Error('Nobody has the turn');

  return phase.unit === undefined ? { kind: 'game', side: phase.side, type: 'end-turn' } : endTurn(phase.unit);
}

function aimedUses(state: BattleState, actor: Unit, field: FieldGeometry, content: ContentRegistry): Command[] {
  const own = field.cellsOf(actor.id);
  const living = state.units.filter((one) => standsOnField(one));

  return creatureDefinition(content, actor.creature).abilities.flatMap((name) => {
    const { target } = abilityDefinition(content, name);
    const range = target.range ?? 0;

    if (target.kind === 'area') {
      return living
        .filter((one) => one.side !== actor.side)
        .flatMap((one) => field.cellsOf(one.id))
        .filter((id) => (field.distanceBetween(own, [id]) ?? range + 1) <= range)
        .map((id) => use(actor.id, name, cell(id)));
    }

    return living
      .filter((one) => (field.distanceBetween(own, field.cellsOf(one.id)) ?? range + 1) <= range)
      .filter((one) => one.id !== actor.id || name === 'demo:mend')
      .map((one) => use(actor.id, name, at(one.id)));
  });
}

function approach(state: BattleState, actor: Unit, field: FieldGeometry, content: ContentRegistry): Command[] {
  const enemies = state.units.filter((one) => standsOnField(one) && one.side !== actor.side);
  const budget = (creatureDefinition(content, actor.creature).attributes['core:move'] ?? 0)
    - (actor.spentActions['core:move'] ?? 0);
  const cells = field.reachable(actor.id, Math.max(0, budget)).map(({ cell: to }) => to);
  const distances = cells.map((to) => nearest(field, to, enemies));
  const best = Math.min(...distances);

  return cells.filter((to, index) => distances[index] === best).map((to) => move(actor.id, to));
}

function nearest(field: FieldGeometry, to: string, enemies: readonly Unit[]): number {
  return Math.min(...enemies.map((one) => field.distanceBetween([to], field.cellsOf(one.id)) ?? 99));
}

function randomCommands(
  state: BattleState,
  actor: Unit,
  field: FieldGeometry,
  content: ContentRegistry,
  kind: number,
  rest: number,
): readonly Command[] {
  const living = state.units.filter((one) => standsOnField(one));
  const other = living.find((one) => one.id !== actor.id) ?? actor;
  const anyCell = field.cells[rest % field.cells.length] ?? '0,0';

  switch (kind) {
    case 9: {
      return field.reachable(actor.id, 8).map(({ cell: to }) => move(actor.id, to, rest % 2 === 0 ? 'west' : 'east'));
    }

    case 10: {
      return [wait(actor.id)];
    }

    case 11: {
      return [defend(actor.id)];
    }

    case 12: {
      return [endTurn(actor.id), endTurnOf(state)];
    }

    case 13: {
      return actor.inventory.flatMap(({ id, item }) => (itemDefinition(content, item).abilities.includes('demo:quaff')
        ? [useItem(actor.id, id)]
        : living.map((one) => useItem(actor.id, id, at(one.id)))));
    }

    case 14: {
      return living
        .filter((one) => one.side === actor.side)
        .map((one) => useOfSide(actor.side, 'demo:rally', at(one.id)));
    }

    case 15: {
      return [endTurn(other.id), wait(other.id), move(other.id, anyCell), use(other.id, 'demo:strike', at(actor.id))];
    }

    case 16: {
      return [
        move(actor.id, anyCell),
        use(actor.id, 'demo:fireball', cell('9,9')),
        use(actor.id, 'demo:strike'),
        use(actor.id, 'demo:mend', at(actor.id), at(actor.id)),
        useItem(actor.id, 99),
        { kind: 'game', type: 'start-battle' },
        { kind: 'game', side: actor.side, type: 'finish-deployment' },
        answerRoll(1, 1),
      ];
    }

    case 17: {
      return creatureDefinition(content, actor.creature).abilities.flatMap((name) =>
        targetsOf(name, living, field.cells, content).map((targets) => use(actor.id, name, ...targets)));
    }

    default: {
      return rest % 400 === 0
        ? [{ kind: 'game', side: actor.side, type: 'retreat' }]
        : [{ kind: 'game', name: 'acme:gamble', payload: {}, type: 'extension' }, endTurn(actor.id)];
    }
  }
}

function targetsOf(
  name: string,
  living: readonly Unit[],
  cells: readonly string[],
  content: ContentRegistry,
): ReadonlyArray<readonly Target[]> {
  const { target } = abilityDefinition(content, name);

  if (target.kind === 'unit') return living.flatMap((one) => [[at(one.id)], living.map(({ id }) => at(id))]);

  if (target.kind === 'area' || target.kind === 'cell') return cells.map((id) => [cell(id)]);

  return [[]];
}

function pick<Value>(values: readonly Value[], choice: number): Value | undefined {
  return values[choice % Math.max(1, values.length)];
}
