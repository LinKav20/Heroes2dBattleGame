import { describe, expect, it } from 'vitest';
import { ReactionIndex } from '../../effects/index.ts';
import { AttributeCache } from '../../expressions/index.ts';
import type { StepKind } from '../../extensions/index.ts';
import { FieldCache } from '../../geometry/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { BattleState, Target } from '../../model/index.ts';
import { ATTACKER, DEFENDER, replayed } from '../../projection/tests/helpers.ts';
import { ARCHERS, BARE_STATE, EMIT, PIKEMEN, RUN } from '../../tests/battle.ts';
import { accepted, CONTENT, FACING_GRID, GRID, SPEED_ORDER } from '../../tests/fixtures.ts';
import { runDrafts } from '../../tests/run-drafts.ts';

describe('the units a choice of targets offers', () => {
  it('refuse a unit the choosing side does not see, alone or among others', () => {
    expect(() => pick([PIKEMEN], 1, 'attacker'))
      .toThrow('offers the unit "pikemen-1", which the choosing sides do not see');

    expect(() => pick([ARCHERS, PIKEMEN], 1, 'attacker')).toThrow(TypeError);
    expect(() => pick([PIKEMEN], 1)).toThrow('offers the unit "pikemen-1"');
  });

  it('refuse without a side a unit marked with the list of all sides, hidden from an actor without sides', () => {
    const listed: BattleState = {
      ...BARE_STATE,
      units: BARE_STATE.units.map((unit) => ({ ...unit, visibleTo: ['attacker', 'defender'] })),
    };

    expect(() => pick([ARCHERS], 1, undefined, listed)).toThrow('offers the unit "archers-1"');
    expect(pick([ARCHERS], 1, 'attacker', listed).state.inputRequest).toMatchObject({ targets: [ARCHERS] });
  });

  it('accept units the choosing side sees, one or several, and units marked as seen by all without a side', () => {
    const chosen = pick([ARCHERS, PIKEMEN], 2, 'defender');
    const request = chosen.state.inputRequest;

    expect(request).toMatchObject({ count: 2, kind: 'target', side: 'defender', targets: [ARCHERS, PIKEMEN] });
    expect(PICK_KERNEL.project(chosen.state, CONTENT, DEFENDER).inputRequest).toStrictEqual(request);

    expect(PICK_KERNEL.project(chosen.state, CONTENT, ATTACKER).inputRequest)
      .toStrictEqual({ id: request?.id, kind: 'hidden', side: 'defender' });

    expect(PICK_KERNEL.projectEvents(BARE_STATE, chosen.events, CONTENT, ATTACKER).map(({ type }) => type))
      .toStrictEqual(['kernel:input-requested', 'kernel:hidden']);

    expect(replayed(PICK_KERNEL, CONTENT, BARE_STATE, chosen.events, ATTACKER))
      .toStrictEqual(PICK_KERNEL.project(chosen.state, CONTENT, ATTACKER));

    expect(pick([ARCHERS], 1).state.inputRequest).toMatchObject({ kind: 'target', targets: [ARCHERS] });
  });
});

const PICK: StepKind<{ readonly targets: readonly Target[]; readonly count: number; readonly side?: string }> = {
  kind: 'step',
  migrations: [],
  name: 'acme:pick',
  run: ({ inputs, params }) => (inputs.length === 0
    ? {
        kind: 'need',
        need: { count: params.count, kind: 'target', name: 'acme:pick', targets: params.targets, ...side(params.side) },
      }
    : { events: [], kind: 'done' }),
  version: 1,
};

const PICK_KERNEL: Kernel = createKernel({ extensions: [RUN, EMIT, PICK, GRID, FACING_GRID, SPEED_ORDER] });

function side(name: string | undefined): { readonly side?: string } {
  return name === undefined ? {} : { side: name };
}

function pick(
  targets: readonly Target[],
  count: number,
  chooser?: string,
  state: BattleState = BARE_STATE,
): ReturnType<typeof accepted> {
  const caches = { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };
  const drafts = [{ params: { count, targets, ...side(chooser) }, type: 'acme:pick' }];

  return accepted(runDrafts(PICK_KERNEL.registries, caches, state, drafts, CONTENT));
}
