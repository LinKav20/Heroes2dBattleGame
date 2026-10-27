import { describe, expect, it } from 'vitest';
import {
  CONTENT as DUEL,
  CREATED,
  KERNEL as DUEL_KERNEL,
  endTurn,
  place,
  play,
  SCENARIO,
  startWith,
  withScenario,
} from '../../battle/tests/helpers.ts';
import type { ContentRegistry } from '../../content/index.ts';
import type { BattleState, Command, Unit } from '../../model/index.ts';
import { withoutKey } from '../../shared/index.ts';
import { ABILITY_CONTENT, ability, READY } from '../../tests/abilities.ts';
import { ARCHERS, BARE_STATE, KERNEL, PIKEMEN } from '../../tests/battle.ts';
import { accepted, applied, CONTENT, effect, node, STATE, unitOf } from '../../tests/fixtures.ts';
import { ATTACKER, DEFENDER, event, FULL, hiddenEvent, NOBODY, placeOf, replayed, summoned } from './helpers.ts';

describe('the projection of events of the kernel', () => {
  it('gives an actor with full visibility every event, and a roll without the counter of the generator', () => {
    const healed = event(1, 'kernel:health-changed', { count: 20, health: 9, unit: 'pikemen-1' }, []);

    expect(KERNEL.projectEvents(STATE, [ROLL_MADE, healed], CONTENT, FULL))
      .toStrictEqual([{ ...ROLL_MADE, payload: { name: 'core:morale', result: 4, source: 'generator' } }, healed]);
  });

  it('replaces an event the sides do not see with a hidden one that moves only the counters it moved', () => {
    const poisoned = event(1, 'kernel:effect-applied', { effect: applied(8, 'core:poison'), holder: PIKEMEN }, [
      'defender',
    ]);
    const healed = event(2, 'kernel:health-changed', { count: 20, health: 9, unit: 'pikemen-1' }, ['defender']);

    expect(KERNEL.projectEvents(STATE, [ROLL_MADE, poisoned, healed], CONTENT, ATTACKER)).toStrictEqual([
      { ...ROLL_MADE, payload: { name: 'core:morale', result: 4, source: 'generator' } },
      hiddenEvent(1, { nextId: 9 }),
      hiddenEvent(2, {}),
    ]);
  });

  it('leaves out the cause of an event the sides see when they get the event of the cause hidden', () => {
    const hit = event(0, 'kernel:health-changed', { count: 20, health: 9, unit: 'pikemen-1' }, ['defender']);
    const answer = { ...event(1, 'kernel:health-changed', { count: 10, health: 9, unit: 'archers-1' }), cause: 0 };

    expect(KERNEL.projectEvents(STATE, [hit, answer], CONTENT, ATTACKER))
      .toStrictEqual([hiddenEvent(0, {}), withoutKey(answer, 'cause')]);

    expect(KERNEL.projectEvents(STATE, [hit, answer], CONTENT, DEFENDER)).toStrictEqual([hit, answer]);
  });

  it('shows a request the sides do not see as a hidden one and passes every closing of a request', () => {
    const open = withoutKey(STATE, 'inputRequest');
    const request = {
      count: 1,
      id: 8,
      kind: 'roll',
      name: 'core:morale',
      side: 'defender',
      sides: 6,
      unit: 'pikemen-1',
    };
    const asked = event(0, 'kernel:input-requested', { request }, ['defender']);
    const closed = event(0, 'kernel:input-closed', { request: 7 }, ['attacker']);

    expect(KERNEL.projectEvents(open, [asked], CONTENT, ATTACKER)).toStrictEqual([
      { ...asked, payload: { request: { id: 8, kind: 'hidden', side: 'defender' } }, visibleTo: 'all' },
    ]);

    expect(KERNEL.projectEvents(STATE, [closed], CONTENT, DEFENDER)).toStrictEqual([{ ...closed, visibleTo: 'all' }]);

    expect(replayed(KERNEL, CONTENT, open, [asked], ATTACKER)).toMatchObject({
      inputRequest: { id: 8, kind: 'hidden', side: 'defender' },
      nextRequestId: 9,
    });
  });

  it('shows the use of an ability without the units the sides do not see among its targets', () => {
    const use = { ability: 'demo:fire-arrow', battle: 2, cooldown: 2, round: 1, turn: 1 };
    const cell = { cell: '3,3', kind: 'cell' } as const;
    const used = event(0, 'kernel:ability-used', { holder: ARCHERS, targets: [PIKEMEN, cell], use });

    expect(KERNEL.projectEvents(STATE, [used], CONTENT, ATTACKER))
      .toStrictEqual([{ ...used, payload: { holder: ARCHERS, targets: [cell], use } }]);

    expect(KERNEL.projectEvents(STATE, [used], CONTENT, DEFENDER)).toStrictEqual([used]);
  });

  it('shows the end of a turn of a unit the sides do not see as the change of the phase it makes', () => {
    const content = withScenario({ sides: hiddenArchersSides() });
    const started = startWith(DUEL_KERNEL, content);
    const ended = play(started, endTurn('archers-1'), content);
    const projected = DUEL_KERNEL.projectEvents(started, ended.events, content, DEFENDER);
    const index = ended.events.findIndex(({ type }) => type === 'kernel:turn-ended');

    expect(DUEL_KERNEL.project(started, content, DEFENDER).phase).toStrictEqual({ kind: 'turn', side: 'attacker' });
    expect(projected[index]).toStrictEqual(event(index, 'kernel:phase-changed', PHASE_AFTER_TURN));

    expect(DUEL_KERNEL.projectEvents(started, ended.events, content, ATTACKER)[index])
      .toStrictEqual(ended.events[index]);

    expect(replayed(DUEL_KERNEL, content, started, ended.events, DEFENDER))
      .toStrictEqual(DUEL_KERNEL.project(ended.state, content, DEFENDER));
  });

  it('refuses a batch that does not fit the state for full visibility as for sides', () => {
    const stray = event(0, 'kernel:health-changed', { count: 1, health: 1, unit: 'nobody-1' });

    for (const visibility of [FULL, ATTACKER]) {
      expect(() => KERNEL.projectEvents(STATE, [stray], CONTENT, visibility)).toThrow(RangeError);
    }
  });
});

describe('the source of an effect in a projection', () => {
  it('leaves out a unit the sides do not see that applied an effect they see, in the state and in the events', () => {
    const before = hiddenArchersReady();
    const result = accepted(KERNEL.execute(before, TAG, MARKED));
    const full = unitOf(result.state, 'pikemen-1').effects.find(({ effect: name }) => name === 'acme:mark');
    const defender = KERNEL.project(result.state, MARKED, DEFENDER);
    const events = KERNEL.projectEvents(before, result.events, MARKED, DEFENDER);
    const shown = events.find(({ type }) => type === 'kernel:effect-applied');

    if (full === undefined) throw new Error('No mark');

    expect(full.sourceUnit).toBe('archers-1');
    expect(unitOf(defender, 'pikemen-1').effects).toStrictEqual([withoutKey(full, 'sourceUnit')]);
    expect(shown?.payload).toStrictEqual({ effect: withoutKey(full, 'sourceUnit'), holder: PIKEMEN });
    expect(JSON.stringify([defender, events]).includes('"archers-1"')).toBe(false);
    expect(replayed(KERNEL, MARKED, before, result.events, DEFENDER)).toStrictEqual(defender);
  });

  it('keeps the source for full visibility and for the sides that see it', () => {
    const before = hiddenArchersReady();
    const result = accepted(KERNEL.execute(before, TAG, MARKED));

    for (const visibility of [FULL, ATTACKER]) {
      const effects = unitOf(KERNEL.project(result.state, MARKED, visibility), 'pikemen-1').effects;
      const shown = KERNEL.projectEvents(before, result.events, MARKED, visibility)
        .find(({ type }) => type === 'kernel:effect-applied');

      expect(effects.map(({ sourceUnit }) => sourceUnit)).toStrictEqual(['archers-1']);

      expect((shown?.payload as { readonly effect: { readonly sourceUnit?: string } }).effect.sourceUnit)
        .toBe('archers-1');
    }
  });

  it('leaves the source out of a changed effect the sides see', () => {
    const changed = event(0, 'kernel:effect-changed', {
      effect: applied(3, 'core:poison', { remaining: 1, sourceUnit: 'pikemen-1' }),
      holder: ARCHERS,
    });

    expect(KERNEL.projectEvents(STATE, [changed], CONTENT, ATTACKER)).toStrictEqual([{
      ...changed,
      payload: { effect: applied(3, 'core:poison', { remaining: 1 }), holder: ARCHERS },
    }]);

    expect(KERNEL.projectEvents(STATE, [changed], CONTENT, DEFENDER)).toStrictEqual([changed]);

    expect(replayed(KERNEL, CONTENT, STATE, [changed], ATTACKER))
      .toStrictEqual(KERNEL.project(KERNEL.applyEvent(STATE, changed), CONTENT, ATTACKER));
  });
});

describe('moves of units during deployment in a projection', () => {
  it('hides a move and a turn of a unit another side places, and shows them to its own side', () => {
    const placed = play(CREATED, place('archers-1', '0,1', 'east')).state;

    for (const change of [{ cell: '0,2' }, { cell: '0,1', facing: 'west' }]) {
      const edited = play(placed, edit({ type: 'move-unit', unit: 'archers-1', ...change }));
      const hidden = DUEL_KERNEL.projectEvents(placed, edited.events, DUEL, DEFENDER);
      const own = DUEL_KERNEL.projectEvents(placed, edited.events, DUEL, ATTACKER);

      expect(edited.events.length).toBeGreaterThan(0);
      expect(hidden).toStrictEqual(edited.events.map(({ id }) => hiddenEvent(id, {})));
      expect(own).toStrictEqual(edited.events);

      expect(placeOf(DUEL_KERNEL.project(edited.state, DUEL, DEFENDER), 'archers-1'))
        .toStrictEqual([undefined, undefined]);

      expect(placeOf(DUEL_KERNEL.project(edited.state, DUEL, ATTACKER), 'archers-1'))
        .toStrictEqual([change.cell, change.facing ?? 'east']);

      for (const visibility of [DEFENDER, ATTACKER, NOBODY]) {
        expect(replayed(DUEL_KERNEL, DUEL, placed, edited.events, visibility))
          .toStrictEqual(DUEL_KERNEL.project(edited.state, DUEL, visibility));
      }
    }
  });

  it('shows a move of a unit whose cell the scenario fixed to every side that sees it', () => {
    const placed = play(CREATED, place('archers-1', '0,1')).state;
    const edited = play(placed, edit({ cell: '4,2', type: 'move-unit', unit: 'pikemen-1' }));

    expect(DUEL_KERNEL.projectEvents(placed, edited.events, DUEL, ATTACKER)).toStrictEqual(edited.events);
    expect(placeOf(DUEL_KERNEL.project(edited.state, DUEL, ATTACKER), 'pikemen-1')).toStrictEqual(['4,2', undefined]);

    expect(replayed(DUEL_KERNEL, DUEL, placed, edited.events, ATTACKER))
      .toStrictEqual(DUEL_KERNEL.project(edited.state, DUEL, ATTACKER));
  });
});

describe('a summoned unit in a projection', () => {
  it('shows the summoned unit as the projection shows units: without unseen zones, effects and sources', () => {
    const unit = summoned('attacker', 'all', {
      cell: '5,5',
      effects: [
        applied(20, 'core:poison', { sourceUnit: 'pikemen-1' }),
        applied(21, 'core:poison', { visibleTo: ['defender'] }),
      ],
      zones: ['swamp'],
    });
    const summon = event(0, 'kernel:unit-summoned', { unit });
    const [shown] = KERNEL.projectEvents(STATE, [summon], CONTENT, ATTACKER);
    const after = KERNEL.applyEvent(STATE, summon);

    expect(shown?.payload).toStrictEqual({
      unit: { ...unit, effects: [applied(20, 'core:poison')], zones: [] },
    });

    expect(KERNEL.projectEvents(STATE, [summon], CONTENT, DEFENDER)).toStrictEqual([summon]);
    expect(JSON.stringify(shown).includes('swamp') || JSON.stringify(shown).includes('pikemen-1')).toBe(false);

    expect(replayed(KERNEL, CONTENT, STATE, [summon], ATTACKER))
      .toStrictEqual(KERNEL.project(after, CONTENT, ATTACKER));
  });

  it('shows no cell and direction of a unit another side summons during deployment', () => {
    const deploying: BattleState = { ...BARE_STATE, phase: { kind: 'deployment', pending: ['defender'] } };
    const unit = summoned('defender', 'all', { cell: '3,3', facing: 'west' });
    const summon = event(0, 'kernel:unit-summoned', { unit });
    const [shown] = KERNEL.projectEvents(deploying, [summon], CONTENT, ATTACKER);
    const after = KERNEL.applyEvent(deploying, summon);

    expect((shown?.payload as { readonly unit: Unit }).unit)
      .toStrictEqual(withoutKey(withoutKey(unit, 'cell'), 'facing'));

    expect(replayed(KERNEL, CONTENT, deploying, [summon], ATTACKER))
      .toStrictEqual(KERNEL.project(after, CONTENT, ATTACKER));
  });
});

describe('the events of a projection', () => {
  it('kernel:hidden moves the counters forward and never back', () => {
    const projection = KERNEL.project(STATE, CONTENT, ATTACKER);

    expect(KERNEL.applyEvent(projection, hiddenEvent(0, { nextId: 10, nextRequestId: 9 })))
      .toStrictEqual({ ...projection, nextId: 10, nextRequestId: 9 });

    expect(KERNEL.applyEvent(projection, hiddenEvent(0, {}))).toStrictEqual(projection);
    expect(() => KERNEL.applyEvent(projection, hiddenEvent(0, { nextId: 7 }))).toThrow(RangeError);
    expect(() => KERNEL.applyEvent(projection, hiddenEvent(0, { nextRequestId: 1 }))).toThrow(RangeError);
  });

  it('kernel:data-changed sets and removes the data of extensions', () => {
    const projection = { ...KERNEL.project(STATE, CONTENT, FULL), extensions: { 'acme:a': 1, 'acme:b': 2 } };
    const changed = event(0, 'kernel:data-changed', { changed: { 'acme:b': 3, 'acme:c': 4 }, removed: ['acme:a'] });

    expect(KERNEL.applyEvent(projection, changed).extensions).toStrictEqual({ 'acme:b': 3, 'acme:c': 4 });
  });

  it('a full state takes neither the events only a projection has nor a hidden request', () => {
    const open = withoutKey(STATE, 'inputRequest');
    const changed = event(0, 'kernel:data-changed', { changed: {}, removed: [] });
    const asked = event(0, 'kernel:input-requested', { request: { id: 8, kind: 'hidden', side: 'defender' } });

    expect(() => KERNEL.applyEvent(STATE, hiddenEvent(0, {}))).toThrow('Only a projection takes kernel:hidden.');
    expect(() => KERNEL.applyEvent(STATE, changed)).toThrow('Only a projection takes kernel:data-changed.');
    expect(() => KERNEL.applyEvent(open, asked)).toThrow('Only a projection takes a hidden input request.');
    expect(KERNEL.applyEvent(KERNEL.project(open, CONTENT, ATTACKER), asked).inputRequest).toMatchObject({ id: 8 });
  });

  it('kernel:trigger-fired counts nothing in a projection for sides and counts in a full one', () => {
    const fired = event(0, 'kernel:trigger-fired', { fired: 1, trigger: 'reinforcements' });
    const sides = KERNEL.project(STATE, CONTENT, ATTACKER);
    const full = KERNEL.project(STATE, CONTENT, FULL);

    expect(KERNEL.applyEvent(sides, fired)).toStrictEqual(sides);
    expect(KERNEL.applyEvent(full, fired).triggers).toStrictEqual({ reinforcements: { fired: 1 } });
  });

  it('runs no command on a projection', () => {
    const projection = KERNEL.project(READY, ABILITY_CONTENT, FULL);

    expect(() => KERNEL.execute(projection, TAG, MARKED)).toThrow('A projection does not run commands.');
  });
});

const ROLL_MADE = event(0, 'kernel:roll-made', { counter: 13, name: 'core:morale', result: 4, source: 'generator' });

const PHASE_AFTER_TURN = { phase: { kind: 'between-turns' }, round: 1 };

const MARKED: ContentRegistry = {
  ...ABILITY_CONTENT,
  abilities: {
    ...ABILITY_CONTENT.abilities,
    'acme:tag': ability('acme:tag', {
      ops: [node('kernel:apply-effect', { effect: 'acme:mark', to: 'target' })],
      target: { kind: 'unit' },
    }),
  },
  creatures: Object.fromEntries(Object.entries(ABILITY_CONTENT.creatures).map(([name, creature]) =>
    [name, name === 'demo:archer' ? { ...creature, abilities: [...creature.abilities, 'acme:tag'] } : creature])),
  effects: { ...ABILITY_CONTENT.effects, 'acme:mark': effect('acme:mark') },
};

const TAG: Command = { ability: 'acme:tag', kind: 'game', targets: [PIKEMEN], type: 'use-ability', unit: 'archers-1' };

function edit(change: object): Command {
  const value: unknown = { edit: change, kind: 'edit' };

  return value as Command;
}

function hiddenArchersReady(): BattleState {
  const units = READY.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, visibleTo: ['attacker'] } : unit));

  return { ...READY, units };
}

function hiddenArchersSides(): typeof SCENARIO.sides {
  return SCENARIO.sides.map((side) => ({
    ...side,
    units: side.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, visibleTo: ['attacker'] } : unit)),
  }));
}
