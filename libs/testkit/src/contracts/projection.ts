import {
  canonicalJson,
  canSee,
  KERNEL_EVENTS,
  type BattleEvent,
  type BattleState,
  type ContentRegistry,
  type Kernel,
  type Visibility,
} from '@heroes2dgame/kernel';

interface Batch {
  readonly before: BattleState;
  readonly after: BattleState;
  readonly events: readonly BattleEvent[];
  readonly visibility: Visibility;
}

interface Projected {
  readonly events: readonly BattleEvent[];
  readonly state: BattleState;
}

/**
 * Returns what breaks the contract of projections when a batch of events is given to a full state, or an empty list.
 * The check runs for full visibility and for every set of sides of the battle, the empty one included, and expects:
 * - the events of the batch as the actor sees them, applied in order to the projection of the state before the
 *   batch, give exactly the projection of the state after it;
 * - every event keeps its number, and only one `kernel:data-changed` numbered after the last event may follow them;
 * - `kernel:hidden` carries nothing but the counters `nextId` and `nextRequestId`, and no projection has the random
 *   number generator;
 * - an actor who sees what some sides see gets in place of an event of the batch these sides do not see only
 *   `kernel:hidden`, `kernel:data-changed`, a request with the kind `hidden`, the same closing of a request, or
 *   `kernel:phase-changed` in place of `kernel:turn-ended`, and gets no event marked for other sides;
 * - for such an actor neither the projection nor the events of the kernel refer to a unit the actor does not see: by
 *   the fields `unit` and `sourceUnit`, or as a unit object, one with the fields `id` and `creature`.
 *
 * The check reads whether the actor sees an event from the event of the batch, not from the event the actor gets,
 * because the kernel marks the events it hides as seen by all. The check of references reads neither the data of
 * extensions nor the events of packages and `kernel:data-changed`, whose formats belong to the packages; a package
 * checks what it projects in its own tests. The number of sets of sides doubles with every side, so battles of the
 * tests keep few sides.
 */
export function projectionProblems(
  kernel: Kernel,
  content: ContentRegistry,
  before: BattleState,
  events: readonly BattleEvent[],
): readonly string[] {
  const after = events.reduce((state, event) => kernel.applyEvent(state, event), before);
  const views: readonly Visibility[] = [
    { kind: 'full' },
    ...subsetsOf(after.sides.map(({ id }) => id)).map((sides): Visibility => ({ kind: 'sides', sides })),
  ];

  return views.flatMap((visibility) => {
    const label = `for ${JSON.stringify(visibility)}`;

    return problemsOf(kernel, content, { after, before, events, visibility }).map((problem) => `${label} ${problem}`);
  });
}

const COUNTERS: readonly string[] = ['nextId', 'nextRequestId'];

const STAND_INS: readonly string[] = [KERNEL_EVENTS.dataChanged, KERNEL_EVENTS.hidden];

function problemsOf(kernel: Kernel, content: ContentRegistry, batch: Batch): readonly string[] {
  const { after, before, events, visibility } = batch;
  let projected: Projected;

  try {
    projected = {
      events: kernel.projectEvents(before, events, content, visibility),
      state: kernel.project(after, content, visibility),
    };
  } catch (error) {
    return [`the kernel does not project the batch: ${String(error)}`];
  }

  const problems = [
    ...replayProblems(kernel, content, batch, projected),
    ...(keepsNumbers(events, projected.events) ? [] : ['the events do not keep their numbers']),
    ...(projected.events.some(({ payload, type }) => type === KERNEL_EVENTS.hidden && !onlyCounters(payload))
      ? ['a hidden event carries more than the counters']
      : []),
    ...(projected.state.rng === undefined ? [] : ['the projection has the random number generator']),
  ];

  return visibility.kind === 'sides' ? [...problems, ...leaksOf(batch, projected)] : problems;
}

function replayProblems(
  kernel: Kernel,
  content: ContentRegistry,
  batch: Batch,
  projected: Projected,
): readonly string[] {
  let applied: BattleState;

  try {
    applied = projected.events.reduce(
      (state, event) => kernel.applyEvent(state, event),
      kernel.project(batch.before, content, batch.visibility),
    );
  } catch (error) {
    return [`the events do not apply to the projection: ${String(error)}`];
  }

  try {
    return canonicalJson(applied) === canonicalJson(projected.state)
      ? []
      : ['the events do not give the projection of the state after them'];
  } catch (error) {
    return [`the projections are not canonical JSON: ${String(error)}`];
  }
}

function keepsNumbers(events: readonly BattleEvent[], projected: readonly BattleEvent[]): boolean {
  const kept = events.every((event, index) => projected[index]?.id === event.id);
  const extra = projected.slice(events.length);

  return kept && extra.every(({ id, type }) => type === KERNEL_EVENTS.dataChanged && id === events.length)
    && extra.length <= 1;
}

function onlyCounters(payload: unknown): boolean {
  return isRecord(payload) && Object.keys(payload).every((key) => COUNTERS.includes(key));
}

function leaksOf({ after, events, visibility }: Batch, projected: Projected): readonly string[] {
  const unseen = new Set(after.units.filter((unit) => !canSee(visibility, unit.visibleTo)).map(({ id }) => id));
  const kernelEvents = projected.events.filter(isKernelEvent);
  const named = new Set(
    [...unitsIn(withoutData(projected.state)), ...kernelEvents.flatMap(({ payload }) => unitsIn(payload))]
      .filter((id) => unseen.has(id)),
  );
  const shown = projected.events.flatMap((event, index) => {
    const original = events[index];

    return canSee(visibility, event.visibleTo) && standsIn(original, event, visibility)
      ? []
      : [(original ?? event).type];
  });

  return [
    ...[...named].map((id) => `the projection or its events name the unit ${JSON.stringify(id)} it does not see`),
    ...shown.map((type) => `the actor gets the event ${JSON.stringify(type)} it does not see`),
  ];
}

function standsIn(original: BattleEvent | undefined, shown: BattleEvent, visibility: Visibility): boolean {
  if (original === undefined || canSee(visibility, original.visibleTo) || STAND_INS.includes(shown.type)) return true;

  if (original.type === KERNEL_EVENTS.turnEnded) return shown.type === KERNEL_EVENTS.phaseChanged;

  if (original.type !== shown.type) return false;

  return original.type === KERNEL_EVENTS.inputClosed
    || (original.type === KERNEL_EVENTS.inputRequested && hidesRequest(shown.payload));
}

function hidesRequest(payload: unknown): boolean {
  return isRecord(payload) && isRecord(payload.request) && payload.request.kind === 'hidden';
}

function isKernelEvent({ type }: BattleEvent): boolean {
  return type.startsWith('kernel:') && type !== KERNEL_EVENTS.dataChanged;
}

function withoutData(state: BattleState): unknown {
  return { ...state, extensions: {} };
}

function unitsIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap((item: unknown) => unitsIn(item));

  if (!isRecord(value)) return [];

  const own = [value.unit, value.sourceUnit].filter((id): id is string => typeof id === 'string');
  const asUnit = typeof value.id === 'string' && typeof value.creature === 'string' ? [value.id] : [];

  return [...own, ...asUnit, ...Object.values(value).flatMap((inner) => unitsIn(inner))];
}

function subsetsOf(sides: readonly string[]): ReadonlyArray<readonly string[]> {
  return sides.reduce<ReadonlyArray<readonly string[]>>(
    (subsets, side) => [...subsets, ...subsets.map((subset) => [...subset, side])],
    [[]],
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
