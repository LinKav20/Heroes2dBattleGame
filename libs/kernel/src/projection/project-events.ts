import {
  applyEvent,
  isKernelEvent,
  KERNEL_EVENTS,
  type HiddenPayload,
  type KernelEvent,
  type KernelEventType,
} from '../events/index.ts';
import { canSee, VISIBLE_TO_ALL } from '../ids/index.ts';
import { canonicalJson, type JsonValue } from '../json/index.ts';
import { battleUnit, findUnit, type BattleEvent, type BattleState, type EventBatch } from '../model/index.ts';
import { isKernelName } from '../names/index.ts';
import { compareCodeUnits, withoutKey } from '../shared/index.ts';
import {
  checkedVisibility,
  fixedOf,
  lensOf,
  placesHidden,
  projectedData,
  projectedEffect,
  projectedPhase,
  projectedRequest,
  projectedUnit,
  projectState,
} from './project-state.ts';
import type { Lens, ProjectionSetup } from './setup.ts';

interface Moment {
  readonly state: BattleState;
  readonly lens?: Lens;
}

interface Shown {
  readonly event: BattleEvent;
  readonly copy: BattleState;
}

type SeenKernelEvents = {
  readonly [Type in KernelEventType]?: (event: KernelEvent<Type>, after: Lens) => BattleEvent;
};

/**
 * Returns the events of a batch as an actor sees them, so that applying them in order to the projection of the state
 * before the batch gives the projection of the state after it. The kernel builds the batch event by event on the copy
 * the actor will have, the projection before the batch with the events already chosen applied, and every event keeps
 * its number.
 *
 * An event of a package comes as it is only if the actor sees it, it applies to that copy and gives there exactly the
 * data the actor sees after it; a handler of an event may read any part of the state, so it may fail on a copy that
 * lacks hidden parts or the generator. Otherwise `kernel:data-changed` comes with the change from the data of the copy,
 * or `kernel:hidden` if the data the actor sees did not change. An event of the kernel comes to an actor with full
 * visibility as it is, a roll without the counter of the generator. An actor who sees what some sides see gets:
 * - an event they see as it is, the phase of the turn of a unit they do not see without the unit, the use of an
 *   ability without the units they do not see among its targets, an applied or changed effect and a summoned unit as
 *   the projection shows them, a roll without the counter of the generator;
 * - a hidden request in place of a request they do not see, and every closing of a request;
 * - in place of the end of a turn of a unit they do not see, the change of the phase it makes;
 * - in place of any other event they do not see, and of a move or a turn of a unit whose cell deployment hides from
 *   them, `kernel:hidden`.
 *
 * `kernel:hidden` carries the counters of identifiers that the event moved. An event that comes keeps its cause only
 * if the actor gets the event of the cause. If the data of extensions they see changes without an event that delivers
 * it, for example because a summoned unit becomes one they see, the batch ends with one more `kernel:data-changed`,
 * numbered after the last event.
 *
 * @throws {TypeError} If the state is a projection, or the visibility names a side twice or a side the battle does
 * not have.
 * @throws {TypeError | RangeError} If the batch does not fit the state, as `applyEvent` throws, for every visibility.
 */
export function projectEvents(state: BattleState, events: EventBatch, setup: ProjectionSetup): EventBatch {
  if (state.visibility !== undefined) throw new TypeError('The state is a projection already.');

  const checked = { ...setup, visibility: checkedVisibility(state, setup.visibility) };
  const momentOf = momentsOf(state, checked);
  const hidden = new Set<number>();
  const projected: BattleEvent[] = [];
  let before = momentOf(state);
  let copy = projectState(state, checked);

  for (const event of events) {
    const after = momentOf(applyEvent(checked.events, before.state, event));
    const shown = projectedEvent(before, after, copy, event, checked);

    if (shown.event.type === KERNEL_EVENTS.hidden) hidden.add(event.id);

    projected.push(withSeenCause(shown.event, hidden));
    copy = shown.copy;
    before = after;
  }

  const late = dataChanged(events.length, copy.extensions, dataSeen(before, checked));

  return late === undefined ? projected : [...projected, late];
}

const SEEN_KERNEL_EVENTS: SeenKernelEvents = {
  [KERNEL_EVENTS.abilityUsed]: (event, { view }) => {
    const targets = event.payload.targets.filter((target) => target.kind !== 'unit' || view.seesUnit(target.unit));

    return { ...event, payload: { ...event.payload, targets } };
  },
  [KERNEL_EVENTS.effectApplied]: (event, { view }) => ({
    ...event,
    payload: { ...event.payload, effect: projectedEffect(event.payload.effect, view) },
  }),
  [KERNEL_EVENTS.effectChanged]: (event, { view }) => ({
    ...event,
    payload: { ...event.payload, effect: projectedEffect(event.payload.effect, view) },
  }),
  [KERNEL_EVENTS.phaseChanged]: (event, { view }) => ({
    ...event,
    payload: { ...event.payload, phase: projectedPhase(event.payload.phase, view) },
  }),
  [KERNEL_EVENTS.rollMade]: withoutCounter,
  [KERNEL_EVENTS.turnEnded]: (event, { state, view }) => {
    const { holder } = event.payload;

    if (holder.kind === 'side' || view.seesUnit(holder.unit)) return event;

    const payload = { phase: projectedPhase(state.phase, view), round: state.round };

    return { ...event, payload, type: KERNEL_EVENTS.phaseChanged };
  },
  [KERNEL_EVENTS.unitSummoned]: (event, lens) => {
    const unit = projectedUnit(battleUnit(lens.state, event.payload.unit.id), lens);

    return { ...event, payload: { ...event.payload, unit } };
  },
};

function momentsOf(state: BattleState, setup: ProjectionSetup): (current: BattleState) => Moment {
  const { visibility } = setup;

  if (visibility.kind === 'full') return (current) => ({ state: current });

  const sides = { ...setup, visibility };
  const fixed = fixedOf(state, sides);

  return (current) => ({ lens: lensOf(current, sides, fixed), state: current });
}

function projectedEvent(
  before: Moment,
  after: Moment,
  copy: BattleState,
  event: BattleEvent,
  setup: ProjectionSetup,
): Shown {
  if (!isKernelName(event.type)) return packageEvent(before, after, copy, event, setup);

  const shown = before.lens === undefined || after.lens === undefined
    ? fullKernelEvent(event)
    : sidesKernelEvent(before.lens, after.lens, event);

  return { copy: applyEvent(setup.events, copy, shown), event: shown };
}

function fullKernelEvent(event: BattleEvent): BattleEvent {
  return isKernelEvent(event, KERNEL_EVENTS.rollMade) ? withoutCounter(event) : event;
}

function sidesKernelEvent(before: Lens, after: Lens, event: BattleEvent): BattleEvent {
  const { visibility } = after.setup;

  if (isKernelEvent(event, KERNEL_EVENTS.inputRequested)) {
    const request = projectedRequest(event.payload.request, visibility, after.view);

    return { ...event, payload: { request }, visibleTo: VISIBLE_TO_ALL };
  }

  if (isKernelEvent(event, KERNEL_EVENTS.inputClosed)) return { ...event, visibleTo: VISIBLE_TO_ALL };

  if (!canSee(visibility, event.visibleTo) || placementMove(before, event)) {
    return hiddenEvent(event, before.state, after.state);
  }

  if (!isKernelEvent(event)) return event;

  const seen = SEEN_KERNEL_EVENTS[event.type] as ((event: KernelEvent, after: Lens) => BattleEvent) | undefined;

  return seen === undefined ? event : seen(event, after);
}

function placementMove(before: Lens, event: BattleEvent): boolean {
  if (!isKernelEvent(event, KERNEL_EVENTS.unitMoved) && !isKernelEvent(event, KERNEL_EVENTS.unitTurned)) return false;

  const unit = findUnit(before.state, event.payload.unit);

  return unit !== undefined && placesHidden(unit, before);
}

function packageEvent(
  before: Moment,
  after: Moment,
  copy: BattleState,
  event: BattleEvent,
  setup: ProjectionSetup,
): Shown {
  const seen = dataSeen(after, setup);
  const applied = canSee(setup.visibility, event.visibleTo) ? appliedTo(copy, event, setup, seen) : undefined;

  if (applied !== undefined) return { copy: applied, event };

  const shown = dataChanged(event.id, copy.extensions, seen) ?? hiddenEvent(event, before.state, after.state);

  return { copy: applyEvent(setup.events, copy, shown), event: shown };
}

function dataSeen({ lens, state }: Moment, setup: ProjectionSetup): Readonly<Record<string, JsonValue>> {
  return lens === undefined ? state.extensions : projectedData(state, setup, lens.view);
}

function appliedTo(
  copy: BattleState,
  event: BattleEvent,
  setup: ProjectionSetup,
  seen: Readonly<Record<string, JsonValue>>,
): BattleState | undefined {
  try {
    const applied = applyEvent(setup.events, copy, event);

    return sameJson(applied.extensions, seen) ? applied : undefined;
  } catch {
    return undefined;
  }
}

function dataChanged(
  id: number,
  old: Readonly<Record<string, JsonValue>>,
  now: Readonly<Record<string, JsonValue>>,
): BattleEvent | undefined {
  const changed = Object.entries(now)
    .filter(([name, data]) => !Object.hasOwn(old, name) || !sameJson(old[name], data))
    .sort(([left], [right]) => compareCodeUnits(left, right));
  const removed = Object.keys(old).filter((name) => !Object.hasOwn(now, name)).sort(compareCodeUnits);

  if (changed.length === 0 && removed.length === 0) return undefined;

  return {
    id,
    payload: { changed: Object.fromEntries(changed), removed },
    type: KERNEL_EVENTS.dataChanged,
    version: 1,
    visibleTo: VISIBLE_TO_ALL,
  };
}

function hiddenEvent(event: BattleEvent, before: BattleState, after: BattleState): BattleEvent {
  const payload: HiddenPayload = {
    ...(after.nextId === before.nextId ? {} : { nextId: after.nextId }),
    ...(after.nextRequestId === before.nextRequestId ? {} : { nextRequestId: after.nextRequestId }),
  };

  return { id: event.id, payload, type: KERNEL_EVENTS.hidden, version: 1, visibleTo: VISIBLE_TO_ALL };
}

function withSeenCause(event: BattleEvent, hidden: ReadonlySet<number>): BattleEvent {
  return event.cause !== undefined && hidden.has(event.cause) ? withoutKey(event, 'cause') : event;
}

function withoutCounter(event: KernelEvent<typeof KERNEL_EVENTS.rollMade>): BattleEvent {
  return { ...event, payload: withoutKey(event.payload, 'counter') };
}

function sameJson(left: JsonValue | undefined, right: JsonValue): boolean {
  return left !== undefined && canonicalJson(left) === canonicalJson(right);
}
