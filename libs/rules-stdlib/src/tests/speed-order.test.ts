import type { Command, DataView, Visibility } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { SPEED_ORDER } from '../index.ts';
import {
  answer,
  CONTENT,
  contentWith,
  endTurn,
  eventsOf,
  EXTERNAL,
  holderOf,
  KERNEL,
  order,
  play,
  played,
  refusal,
  RULESET,
  SCENARIO,
  started,
  wait,
  withUnits,
} from './world.ts';

describe('the order of turns by speed', () => {
  it('lets siege machines go first, then the fastest, and alternates the sides of equal speed', () => {
    const ballista = { cell: '0,0', count: 1, creature: 'demo:ballista', effects: [], id: 'ballista-1', items: [] };
    const content = contentWith({
      sides: SCENARIO.sides.map((side) => (side.id === 'attacker'
        ? { ...side, units: [...side.units, { ...ballista, visibleTo: 'all' as const }] }
        : side)),
    });

    expect(order(started(content), content, 6))
      .toStrictEqual(['ballista-1', 'griffins-1', 'pikemen-1', 'skeletons-1', 'archers-1', 'ballista-1']);
  });

  it('starts the next round with the side that did not have the last turn of the round', () => {
    const content = contentWith({
      sides: SCENARIO.sides.map((side) => ({ ...side, units: side.units.filter(({ id }) => id !== 'griffins-1') })),
    });
    const next = played(started(content), content, ...['pikemen-1', 'skeletons-1', 'archers-1'].map(endTurn));

    expect(next.round).toBe(2);
    expect(next.extensions['rules-stdlib:speed']).toStrictEqual({ granted: [], last: 'attacker' });
    expect(order(next, content, 3)).toStrictEqual(['skeletons-1', 'pikemen-1', 'archers-1']);
  });

  it('brings back the units that waited, slowest first, and lets a unit wait once a round', () => {
    const waited = played(started(), CONTENT, wait('griffins-1'), wait('pikemen-1'));
    const back = played(waited, CONTENT, endTurn('skeletons-1'), endTurn('archers-1'));

    expect(order(waited, CONTENT, 4)).toStrictEqual(['skeletons-1', 'archers-1', 'pikemen-1', 'griffins-1']);
    expect(refusal(back, CONTENT, wait('pikemen-1'))).toStrictEqual(['rules-stdlib:cannot-wait', {}]);
  });

  it('brings back units of equal speed that waited with the side that did not have the last turn first', () => {
    const waited = played(started(), CONTENT, endTurn('griffins-1'), wait('pikemen-1'), wait('skeletons-1'));

    expect(order(waited, CONTENT, 3)).toStrictEqual(['archers-1', 'skeletons-1', 'pikemen-1']);
  });

  it('lets a unit wait only before it spends any action of its turn', () => {
    const move: Command = { kind: 'game', to: '1,1', type: 'move', unit: 'pikemen-1' };
    const moved = played(started(), CONTENT, endTurn('griffins-1'), move);

    expect(refusal(moved, CONTENT, wait('pikemen-1'))).toStrictEqual(['rules-stdlib:cannot-wait', {}]);
  });
});

describe('morale in the order of turns by speed', () => {
  it('gives a unit of good morale one more turn right after its turn, once a round, and again the next round', () => {
    const content = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'] } }));
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const asked = play(state, content, endTurn('pikemen-1'));
    const extra = answer(asked.state, content, 24);
    const again = play(extra.state, content, endTurn('pikemen-1')).state;
    const round = played(again, content, endTurn('skeletons-1'), endTurn('archers-1'), endTurn('griffins-1'));
    const second = play(round, content, endTurn('pikemen-1')).state;

    expect(asked.state.inputRequest).toMatchObject({ name: 'core:morale-roll', sides: 24, unit: 'pikemen-1' });

    expect(eventsOf(extra.events, 'rules-stdlib:morale-rolled').map(({ payload }) => payload)).toStrictEqual([
      { kind: 'good', unit: 'pikemen-1' },
    ]);

    expect(holderOf(extra.state)).toBe('pikemen-1');
    expect(again.inputRequest).toBeUndefined();
    expect(holderOf(again)).toBe('skeletons-1');
    expect(round.round).toBe(2);
    expect(second.inputRequest).toMatchObject({ name: 'core:morale-roll', unit: 'pikemen-1' });
  });

  it('counts morale up to the largest value of the ruleset', () => {
    const morale = RULESET.mechanics['rules-stdlib:morale'];

    if (morale === undefined) throw new Error('No morale');

    const capped = { ...morale, params: { ...morale.params, max: 2 } };
    const content = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'] } }), {
      mechanics: { ...RULESET.mechanics, 'rules-stdlib:morale': capped },
    });
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const asked = play(state, content, endTurn('pikemen-1')).state;

    expect(holderOf(answer(asked, content, 22).state)).toBe('skeletons-1');
    expect(holderOf(answer(asked, content, 23).state)).toBe('pikemen-1');
  });

  it('gives no more turn for a failed roll, to a unit that defends, or without morale in the ruleset', () => {
    const content = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'] } }));
    const mechanics = Object.fromEntries(Object.entries(RULESET.mechanics)
      .filter(([name]) => name !== 'rules-stdlib:morale'));
    const plain = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'] } }), { mechanics });
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const asked = play(state, content, endTurn('pikemen-1')).state;
    const failed = answer(asked, content, 21).state;
    const defended = play(state, content, { kind: 'game', type: 'defend', unit: 'pikemen-1' }).state;
    const quiet = played(started(plain, { ruleset: EXTERNAL }), plain, endTurn('griffins-1'), endTurn('pikemen-1'));

    expect(holderOf(failed)).toBe('skeletons-1');
    expect(defended.inputRequest).toBeUndefined();
    expect(holderOf(defended)).toBe('skeletons-1');
    expect(holderOf(quiet)).toBe('skeletons-1');
  });

  it('takes away only the good morale of a unit with a tag that blocks good morale', () => {
    const morale = RULESET.mechanics['rules-stdlib:morale'];

    if (morale === undefined) throw new Error('No morale');

    const params = { ...morale.params, blockedBy: [], goodBlockedBy: ['Creature.Undead'] };
    const mechanics = { ...RULESET.mechanics, 'rules-stdlib:morale': { ...morale, params } };
    const cursed = contentWith(withUnits({ 'skeletons-1': { effects: ['demo:despair'] } }), { mechanics });
    const blessed = contentWith(withUnits({ 'skeletons-1': { effects: ['demo:bless'] } }), { mechanics });
    const opening = [endTurn('griffins-1'), endTurn('pikemen-1')];
    const cursedTurn = played(started(cursed, { ruleset: EXTERNAL }), cursed, ...opening);
    const blessedTurn = played(started(blessed, { ruleset: EXTERNAL }), blessed, ...opening);
    const blessedEnd = play(blessedTurn, blessed, endTurn('skeletons-1')).state;

    expect(cursedTurn.inputRequest).toMatchObject({ name: 'core:morale-roll', sides: 12, unit: 'skeletons-1' });
    expect(blessedTurn.inputRequest).toBeUndefined();
    expect(blessedEnd.inputRequest).toBeUndefined();
    expect(holderOf(blessedEnd)).toBe('archers-1');
  });

  it('rolls good morale at the end of the turn a unit comes back to after waiting, and not when it waits', () => {
    const content = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'] } }));
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const waited = play(state, content, wait('pikemen-1')).state;
    const back = played(waited, content, endTurn('skeletons-1'), endTurn('archers-1'));
    const ended = play(back, content, endTurn('pikemen-1')).state;

    expect(waited.inputRequest).toBeUndefined();
    expect(ended.inputRequest).toMatchObject({ name: 'core:morale-roll', unit: 'pikemen-1' });
  });

  it('rolls no morale for a turn the kernel skips because the unit cannot act', () => {
    const blessed = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless', 'demo:stunned'] } }));
    const cursed = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:despair', 'demo:stunned'] } }));
    const skippedGood = play(started(blessed, { ruleset: EXTERNAL }), blessed, endTurn('griffins-1')).state;
    const skippedBad = play(started(cursed, { ruleset: EXTERNAL }), cursed, endTurn('griffins-1')).state;

    expect(skippedGood.inputRequest).toBeUndefined();
    expect(holderOf(skippedGood)).toBe('skeletons-1');
    expect(skippedBad.inputRequest).toBeUndefined();
    expect(holderOf(skippedBad)).toBe('skeletons-1');
  });

  it('ends a fresh turn of a unit of bad morale at its start, but not of the undead or of a unit back', () => {
    const content = contentWith(withUnits({
      'pikemen-1': { effects: ['demo:despair'] },
      'skeletons-1': { effects: ['demo:despair'] },
    }));
    const asked = play(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1')).state;
    const frozen = answer(asked, content, 2);
    const lucky = answer(asked, content, 12).state;
    const waited = play(lucky, content, wait('pikemen-1')).state;
    const back = played(waited, content, endTurn('skeletons-1'), endTurn('archers-1'));

    expect(asked.inputRequest).toMatchObject({ name: 'core:morale-roll', sides: 12, unit: 'pikemen-1' });
    expect(holderOf(frozen.state)).toBe('skeletons-1');

    expect(frozen.state.turns.at(-1))
      .toStrictEqual({ holder: { kind: 'unit', unit: 'pikemen-1' }, skipped: false, waited: false });

    expect(frozen.state.inputRequest).toBeUndefined();
    expect(holderOf(back)).toBe('pikemen-1');
    expect(back.inputRequest).toBeUndefined();
  });

  it('forgets the turn it promised to a unit that died before it', () => {
    const content = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless', 'demo:doomed'] } }));
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const asked = play(state, content, endTurn('pikemen-1')).state;
    const died = answer(asked, content, 24).state;

    expect(holderOf(died)).toBe('skeletons-1');
    expect(died.extensions['rules-stdlib:speed']).toStrictEqual({ granted: ['pikemen-1'] });
  });

  it('shows the morale of a hidden unit only to the sides that see it and its data to nobody', () => {
    const content = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'], visibleTo: ['attacker'] } }));
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const asked = play(state, content, endTurn('pikemen-1')).state;
    const rolled = answer(asked, content, 24);

    expect(rolled.events.filter(({ type }) => type.startsWith('rules-stdlib:') || type === 'kernel:roll-made')
      .map(({ type, visibleTo }) => [type, visibleTo])).toStrictEqual([
      ['kernel:roll-made', ['attacker']],
      ['rules-stdlib:morale-rolled', ['attacker']],
      ['rules-stdlib:speed-changed', []],
      ['rules-stdlib:speed-changed', []],
    ]);
  });
});

describe('the order of turns by speed in a projection', () => {
  it('shows a side its data without the units it does not see and with the side of the last turn', () => {
    const view: DataView = { seesCell: () => false, seesUnit: (unit) => unit !== 'pikemen-1', sides: ['defender'] };
    const data = { extra: 'pikemen-1', granted: ['pikemen-1', 'skeletons-1'], last: 'attacker' };

    expect(SPEED_ORDER.data?.project?.(data, view)).toStrictEqual({ granted: ['skeletons-1'], last: 'attacker' });

    expect(SPEED_ORDER.data?.project?.({ ...data, extra: 'skeletons-1' }, view))
      .toStrictEqual({ extra: 'skeletons-1', granted: ['skeletons-1'], last: 'attacker' });
  });

  it('brings the morale of a hidden unit to the other side without naming the unit', () => {
    const content = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'], visibleTo: ['attacker'] } }));
    const state = played(started(content, { ruleset: EXTERNAL }), content, endTurn('griffins-1'));
    const asked = play(state, content, endTurn('pikemen-1')).state;
    const rolled = answer(asked, content, 24);
    const defender: Visibility = { kind: 'sides', sides: ['defender'] };
    const attacker: Visibility = { kind: 'sides', sides: ['attacker'] };
    const unseen = KERNEL.projectEvents(asked, rolled.events, content, defender);
    const seen = KERNEL.projectEvents(asked, rolled.events, content, attacker);

    expect(JSON.stringify([unseen, KERNEL.project(rolled.state, content, defender)])).not.toContain('pikemen-1');
    expect(unseen.filter(({ type }) => !type.startsWith('kernel:'))).toStrictEqual([]);
    expect(unseen.map(({ type }) => type)).toContain('kernel:hidden');
    expect(seen.map(({ type }) => type)).toContain('rules-stdlib:morale-rolled');

    expect(eventsOf(seen, 'kernel:data-changed').map(({ payload }) => payload)).toStrictEqual([
      { changed: { 'rules-stdlib:speed': { extra: 'pikemen-1', granted: ['pikemen-1'] } }, removed: [] },
      { changed: { 'rules-stdlib:speed': { granted: ['pikemen-1'] } }, removed: [] },
    ]);
  });
});
