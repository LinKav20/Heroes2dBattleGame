import { describe, expect, it } from 'vitest';
import { KERNEL_EVENTS, kernelEventDraft, RUNNER_EVENTS } from '../../events/index.ts';
import type { EventDraft } from '../../extensions/index.ts';
import type { VisibleTo } from '../../ids/index.ts';
import type { Unit } from '../../model/index.ts';
import { KERNEL } from '../../tests/battle.ts';
import { STATE, unitOf } from '../../tests/fixtures.ts';
import { EventRecorder } from '../event-recorder.ts';

describe('the events steps give', () => {
  it.each(RUNNER_EVENTS)('cannot be %s, which only the kernel gives while it runs a command', (type) => {
    const draft = { payload: {}, type, visibleTo: 'all' } as const;

    for (const step of ['acme:emit', 'kernel:operation']) {
      expect(() => {
        record(step, draft);
      }).toThrow(new TypeError(`The step "${step}" gives "${type}", but only the kernel gives this event ${RUNNING}`));
    }
  });

  it.each<readonly [string, EventDraft]>([
    ['the health of a unit', health('all')],
    ['the health of a unit', health(['attacker', 'defender'])],
    ['a summoned unit', kernelEventDraft(KERNEL_EVENTS.unitSummoned, { unit: summoned(['attacker']) }, 'all')],
    ['a hazard zone it adds', kernelEventDraft(KERNEL_EVENTS.hazardAdded, NEW_ZONE, ['attacker'])],
    ['a hazard zone it removes', kernelEventDraft(KERNEL_EVENTS.hazardRemoved, { hazard: 'swamp' }, 'all')],
    ['an effect of a zone', kernelEventDraft(KERNEL_EVENTS.effectRemoved, { effect: 5, holder: SWAMP }, 'all')],
  ])('of the kernel are rejected from a package if a side sees them but not %s', (unused, draft) => {
    expect(() => {
      record('acme:emit', draft);
    }).toThrow(new TypeError(`The step "acme:emit" gives "${draft.type}" to a side that does not see ${CHANGED}`));
  });

  it.each<readonly [string, EventDraft]>([
    ['the sides that see the unit', health(['defender'])],
    ['no side', health([])],
    ['every side, if the unit is seen by all', kernelEventDraft(KERNEL_EVENTS.flagsChanged, ARCHERS_FLAGS, 'all')],
    ['all, if a summoned unit is seen by all', kernelEventDraft(KERNEL_EVENTS.unitSummoned, SEEN_SUMMONED, 'all')],
    ['the sides that see a new zone', kernelEventDraft(KERNEL_EVENTS.hazardAdded, NEW_ZONE, ['defender'])],
  ])('of the kernel are accepted from a package if given to %s', (unused, draft) => {
    expect(() => {
      record('acme:emit', draft);
    }).not.toThrow();
  });
});

const RUNNING = 'while it runs a command.';

const CHANGED = 'what the event changes.';

const SWAMP = { hazard: 'swamp', kind: 'hazard' } as const;

const NEW_ZONE = { cells: ['1,1'], hazard: 'fog', visibleTo: ['defender'] } as const;

const ARCHERS_FLAGS = { flags: [], unit: 'archers-1' } as const;

const SEEN_SUMMONED = { unit: summoned('all') };

function record(step: string, draft: EventDraft): void {
  new EventRecorder(KERNEL.registries.events, STATE).fromStep(step, draft);
}

function health(visibleTo: VisibleTo): EventDraft {
  return kernelEventDraft(KERNEL_EVENTS.healthChanged, { count: 1, health: 1, unit: 'pikemen-1' }, visibleTo);
}

function summoned(visibleTo: VisibleTo): Unit {
  return { ...unitOf(STATE, 'archers-1'), id: `#${String(STATE.nextId)}`, summoned: true, visibleTo };
}
