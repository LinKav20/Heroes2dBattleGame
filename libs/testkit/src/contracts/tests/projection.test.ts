import {
  canSee,
  type BattleEvent,
  type BattleState,
  type ContentRegistry,
  type Kernel,
  type Visibility,
  type VisibleTo,
} from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { projectionProblems } from '../index.ts';

interface World {
  readonly sides: ReadonlyArray<{ readonly id: string }>;
  readonly units: ReadonlyArray<{ readonly id: string; readonly visibleTo: VisibleTo }>;
  readonly log: readonly string[];
  readonly names?: readonly string[];
  readonly rng?: { readonly counter: number };
  readonly extensions?: Readonly<Record<string, unknown>>;
}

interface Toy {
  readonly applyEvent: (state: World, event: BattleEvent) => World;
  readonly project: (state: World, visibility: Visibility) => World;
  readonly projectEvents: (state: World, events: readonly BattleEvent[], visibility: Visibility) => BattleEvent[];
}

const FOR_FULL = 'for {"kind":"full"}';

const FOR_NONE = 'for {"kind":"sides","sides":[]}';

const FOR_A = 'for {"kind":"sides","sides":["a"]}';

const FOR_B = 'for {"kind":"sides","sides":["b"]}';

const FOR_BOTH = 'for {"kind":"sides","sides":["a","b"]}';

const NAMES_UNIT_A = 'the projection or its events name the unit "unit-a" it does not see';

describe('projectionProblems', () => {
  it('finds nothing in a kernel that keeps the contract', () => {
    expect(problems(TOY)).toStrictEqual([]);
  });

  it.each([
    {
      breaks: 'gives an event the actor does not see',
      expected: withoutA(
        'the events do not give the projection of the state after them',
        NAMES_UNIT_A,
        'the actor gets the event "kernel:note" it does not see',
      ),
      toy: { ...TOY, projectEvents: (state: World, events: readonly BattleEvent[]) => [...events] },
    },
    {
      breaks: 'drops an event',
      expected: withoutA('the events do not keep their numbers'),
      toy: {
        ...TOY,
        projectEvents: (state: World, events: readonly BattleEvent[], visibility: Visibility) =>
          events.filter(({ visibleTo }) => canSee(visibility, visibleTo)),
      },
    },
    {
      breaks: 'numbers the events anew',
      expected: inEveryView('the events do not keep their numbers'),
      toy: {
        ...TOY,
        projectEvents: (state: World, events: readonly BattleEvent[], visibility: Visibility) =>
          TOY.projectEvents(state, events, visibility).map((event) => ({ ...event, id: event.id + 1 })),
      },
    },
    {
      breaks: 'gives events that do not lead to the projection after them',
      expected: withoutA('the events do not give the projection of the state after them'),
      toy: {
        ...TOY,
        applyEvent: (state: World, event: BattleEvent) =>
          (event.type === 'kernel:hidden' ? { ...state, log: [...state.log, '?'] } : TOY.applyEvent(state, event)),
      },
    },
    {
      breaks: 'gives events that do not apply to the projection',
      expected: withoutA('the events do not apply to the projection: TypeError: No such event'),
      toy: {
        ...TOY,
        applyEvent: (state: World, event: BattleEvent) => {
          if (event.type === 'kernel:hidden') throw new TypeError('No such event');

          return TOY.applyEvent(state, event);
        },
      },
    },
    {
      breaks: 'keeps the random number generator in a projection',
      expected: [`${FOR_FULL} the projection has the random number generator`],
      toy: {
        ...TOY,
        project: (state: World, visibility: Visibility) =>
          (visibility.kind === 'full' ? state : TOY.project(state, visibility)),
      },
    },
    {
      breaks: 'gives an event the actor does not see marked as seen by all and without units',
      expected: withoutA('the actor gets the event "kernel:note" it does not see'),
      toy: {
        ...TOY,
        projectEvents: (state: World, events: readonly BattleEvent[], visibility: Visibility) =>
          events.map((event): BattleEvent => (canSee(visibility, event.visibleTo)
            ? event
            : { ...event, payload: { dice: [2, 3] }, type: 'kernel:roll-made', visibleTo: 'all' })),
      },
    },
  ])('finds a kernel that $breaks', ({ expected, toy }) => {
    expect(problems(toy)).toStrictEqual(expected);
  });

  it.each([
    { allowed: true, original: 'kernel:input-requested', shown: requested('hidden') },
    { allowed: false, original: 'kernel:input-requested', shown: requested('choose') },
    { allowed: true, original: 'kernel:input-closed', shown: { payload: {}, type: 'kernel:input-closed' } },
    { allowed: true, original: 'kernel:turn-ended', shown: { payload: {}, type: 'kernel:phase-changed' } },
    { allowed: false, original: 'kernel:roll-made', shown: { payload: {}, type: 'kernel:phase-changed' } },
    { allowed: true, original: 'kernel:note', shown: dataChange(0) },
    { allowed: false, original: 'kernel:note', shown: { payload: {}, type: 'kernel:roll-made' } },
  ])('takes $shown.type in place of $original the actor does not see: $allowed', ({ allowed, original, shown }) => {
    const toy: Toy = {
      ...TOY,
      projectEvents: (state, events, visibility) => events.map((event) => (canSee(visibility, event.visibleTo)
        ? event
        : { ...shown, id: event.id, version: 1, visibleTo: 'all' })),
    };
    const event: BattleEvent = { id: 0, payload: { unit: 'unit-a' }, type: original, version: 1, visibleTo: ['a'] };

    expect(problems(toy, BEFORE, [event]))
      .toStrictEqual(allowed ? [] : withoutA(`the actor gets the event ${JSON.stringify(original)} it does not see`));
  });

  it('finds no leak in public strings that equal the name of a hidden unit', () => {
    const units = [...BEFORE.units, { id: 'b', visibleTo: ['b'] }];
    const before: World = { ...BEFORE, names: ['unit-a', 'b'], units };

    expect(problems(TOY, before)).toStrictEqual([]);
  });

  it.each([
    { as: 'the unit of an effect', extra: { effects: [{ sourceUnit: 'unit-a' }] } },
    { as: 'the field `unit` of a holder', extra: { holder: { kind: 'unit', unit: 'unit-a' } } },
    { as: 'a unit object', extra: { summoned: { creature: 'acme:imp', id: 'unit-a' } } },
  ])('finds a hidden unit named as $as in a projection', ({ extra }) => {
    const toy: Toy = { ...TOY, project: (state, visibility) => ({ ...TOY.project(state, visibility), ...extra }) };

    expect(problems(toy)).toStrictEqual(withoutA(NAMES_UNIT_A));
  });

  it('finds a hidden event that carries more than the counters', () => {
    const toy: Toy = {
      ...TOY,
      projectEvents: (state, events, visibility) => TOY.projectEvents(state, events, visibility).map((event) =>
        (event.type === 'kernel:hidden' ? { ...event, payload: { count: 1, health: 11, nextId: 3 } } : event)),
    };

    expect(problems(toy)).toStrictEqual(withoutA('a hidden event carries more than the counters'));
  });

  it('checks every set of sides, so a leak for two sides of three is found', () => {
    const before: World = { ...BEFORE, sides: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    const toy: Toy = {
      ...TOY,
      project: (state, visibility) => (visibility.kind === 'sides' && visibility.sides.length === 2
        ? { ...TOY.project(state, visibility), rng: { counter: 0 } }
        : TOY.project(state, visibility)),
    };

    expect(problems(toy, before)).toStrictEqual([
      'for {"kind":"sides","sides":["a","b"]} the projection has the random number generator',
      'for {"kind":"sides","sides":["a","c"]} the projection has the random number generator',
      'for {"kind":"sides","sides":["b","c"]} the projection has the random number generator',
    ]);
  });

  it.each([
    { set: 'the empty set of sides', sides: 0, view: FOR_NONE },
    { set: 'the set of all sides', sides: 2, view: FOR_BOTH },
  ])('checks $set', ({ sides, view }) => {
    const toy: Toy = {
      ...TOY,
      project: (state, visibility) => (visibility.kind === 'sides' && visibility.sides.length === sides
        ? { ...TOY.project(state, visibility), rng: { counter: 0 } }
        : TOY.project(state, visibility)),
    };

    expect(problems(toy)).toStrictEqual([`${view} the projection has the random number generator`]);
  });

  it('allows one trailing change of data numbered after the last event, and nothing else after them', () => {
    expect(problems(trailing(1, 2))).toStrictEqual([]);
    expect(problems(trailing(2, 2))).toStrictEqual(inEveryView('the events do not keep their numbers'));
    expect(problems(trailing(1, 3))).toStrictEqual(inEveryView('the events do not keep their numbers'));
  });

  it('finds a trailing event of another kind even with the right number and no change of the state', () => {
    const noop: Toy = {
      ...TOY,
      projectEvents: (state, events, visibility) => [
        ...TOY.projectEvents(state, events, visibility),
        { id: 2, payload: {}, type: 'acme:tick', version: 1, visibleTo: 'all' },
      ],
    };

    expect(problems(noop)).toStrictEqual(inEveryView('the events do not keep their numbers'));
  });

  it('reads no references in the data and the events of packages, whatever their fields are called', () => {
    const world: World = { ...BEFORE, units: [...BEFORE.units, { id: 'meters', visibleTo: ['a'] }] };
    const measured: Toy = {
      ...TOY,
      projectEvents: (state, events, visibility) => [
        ...TOY.projectEvents(state, events, visibility),
        {
          id: 2,
          payload: { changed: { 'acme:size': { unit: 'meters' } }, removed: [] },
          type: 'kernel:data-changed',
          version: 1,
          visibleTo: 'all',
        },
      ],
    };
    const packaged: Toy = {
      ...TOY,
      projectEvents: (state, events, visibility) => TOY.projectEvents(state, events, visibility)
        .map((event) => (event.type === 'kernel:note' && canSee(visibility, event.visibleTo)
          ? { ...event, payload: { ...event.payload as object, size: { unit: 'meters' } }, type: 'acme:measure' }
          : event)),
    };
    const stored: Toy = {
      ...TOY,
      project: (state, visibility) => ({
        ...TOY.project(state, visibility),
        extensions: { 'acme:size': { unit: 'meters' } },
      }),
    };

    expect(problems(measured, world)).toStrictEqual([]);
    expect(problems(packaged, world)).toStrictEqual([]);
    expect(problems(stored, world)).toStrictEqual([]);
  });
});

const TOY: Toy = {
  applyEvent: (state, event) => {
    if (!['acme:measure', 'kernel:note'].includes(event.type)) return state;

    const { unit } = event.payload as { readonly unit: string };

    return { ...state, log: [...state.log, unit] };
  },
  project: (state, visibility) => {
    const units = state.units.filter(({ visibleTo }) => canSee(visibility, visibleTo));
    const seen = new Set(units.map(({ id }) => id));
    const { log, names, sides } = state;

    return { log: log.filter((unit) => seen.has(unit)), sides, units, ...(names === undefined ? {} : { names }) };
  },
  projectEvents: (state, events, visibility) => events.map((event) => (canSee(visibility, event.visibleTo)
    ? event
    : { id: event.id, payload: { nextId: 2, nextRequestId: 1 }, type: 'kernel:hidden', version: 1, visibleTo: 'all' })),
};

const BEFORE: World = {
  log: [],
  rng: { counter: 0 },
  sides: [{ id: 'a' }, { id: 'b' }],
  units: [{ id: 'unit-a', visibleTo: ['a'] }, { id: 'unit-all', visibleTo: 'all' }],
};

const EVENTS: readonly BattleEvent[] = [note(0, 'unit-all', 'all'), note(1, 'unit-a', ['a'])];

function problems(toy: Toy, world: World = BEFORE, events: readonly BattleEvent[] = EVENTS): readonly string[] {
  const kernel: unknown = {
    applyEvent: toy.applyEvent,
    project: (state: World, content: ContentRegistry, visibility: Visibility) => toy.project(state, visibility),
    projectEvents: (state: World, batch: readonly BattleEvent[], content: ContentRegistry, visibility: Visibility) =>
      toy.projectEvents(state, batch, visibility),
  };
  const before: unknown = world;
  const content: unknown = {};

  return projectionProblems(kernel as Kernel, content as ContentRegistry, before as BattleState, events);
}

function withoutA(...found: readonly string[]): readonly string[] {
  return [FOR_NONE, FOR_B].flatMap((view) => found.map((problem) => `${view} ${problem}`));
}

function inEveryView(problem: string): readonly string[] {
  return [FOR_FULL, FOR_NONE, FOR_A, FOR_B, FOR_BOTH].map((view) => `${view} ${problem}`);
}

function note(id: number, unit: string, visibleTo: VisibleTo): BattleEvent {
  return { id, payload: { unit }, type: 'kernel:note', version: 1, visibleTo };
}

function requested(kind: string): Pick<BattleEvent, 'payload' | 'type'> {
  return { payload: { request: { id: 0, kind, side: 'a' } }, type: 'kernel:input-requested' };
}

function dataChange(id: number): BattleEvent {
  return { id, payload: { changed: {}, removed: [] }, type: 'kernel:data-changed', version: 1, visibleTo: 'all' };
}

function trailing(count: number, id: number): Toy {
  return {
    ...TOY,
    projectEvents: (state, events, visibility) => [
      ...TOY.projectEvents(state, events, visibility),
      ...Array.from({ length: count }, () => dataChange(id)),
    ],
  };
}
