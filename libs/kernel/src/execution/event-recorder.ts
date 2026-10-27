import { effectsOf } from '../effects/index.ts';
import {
  applyEventOfKind,
  COURSE_EVENTS,
  kernelEventDraft,
  RUNNER_EVENTS,
  type KernelEventPayloads,
  type KernelEventType,
} from '../events/index.ts';
import type { EventDraft, EventKind } from '../extensions/index.ts';
import { VISIBLE_TO_ALL, visibleToBoth, type UnitId, type VisibleTo } from '../ids/index.ts';
import {
  findHazard,
  findUnit,
  type AppliedEffect,
  type BattleEvent,
  type BattleState,
  type EffectHolder,
  type TurnHolder,
  type Unit,
} from '../model/index.ts';
import { isKernelName, type Registry } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';

interface ChangedParts {
  readonly effect?: unknown;
  readonly hazard?: unknown;
  readonly holder?: EffectHolder | TurnHolder;
  readonly unit?: Unit | UnitId;
  readonly visibleTo?: VisibleTo;
}

/**
 * Collects the events of one command: numbers them from 0, gives them their cause and the current version of their
 * kind, and applies every event to the state at once, so the next step sees it.
 */
export class EventRecorder {
  private readonly kinds: Registry<EventKind>;

  private current: BattleState;

  private readonly recorded: BattleEvent[] = [];

  constructor(kinds: Registry<EventKind>, state: BattleState) {
    this.kinds = kinds;
    this.current = state;
  }

  /** The state after the recorded events. */
  get state(): BattleState {
    return this.current;
  }

  /** The recorded events in order. */
  get events(): readonly BattleEvent[] {
    return this.recorded;
  }

  /** The number the next event of the batch gets. */
  get nextEventId(): number {
    return this.recorded.length;
  }

  /**
   * Records an event the kernel gives itself while it runs the command.
   */
  kernel<Type extends KernelEventType>(
    type: Type,
    payload: KernelEventPayloads[Type],
    visibleTo: VisibleTo,
    cause?: number,
  ): void {
    this.add(kernelEventDraft(type, payload, visibleTo), cause);
  }

  /**
   * Records an event a step gave.
   *
   * @throws {TypeError} If the kernel has no kind of this event, only the kernel itself gives such events, a step of a
   * package gives an event of the kernel to a side that does not see what it changes, as `EventDraft` tells, or the
   * event does not fit the state, for example refers to a unit that is not in the battle.
   */
  fromStep(step: string, draft: EventDraft, cause?: number): void {
    if (RUNNER_EVENTS.some((type) => type === draft.type)) {
      throw new TypeError(
        `The step ${JSON.stringify(step)} gives ${JSON.stringify(draft.type)}, but only the kernel gives this event `
        + 'while it runs a command.',
      );
    }

    if (!isKernelName(step) && COURSE_EVENTS.some((type) => type === draft.type)) {
      throw new TypeError(
        `The step ${JSON.stringify(step)} gives ${JSON.stringify(draft.type)}, but only the kernel leads the course `
        + 'of the battle.',
      );
    }

    if (!isKernelName(step) && !seenWithin(this.current, draft.visibleTo, changedVisibility(this.current, draft))) {
      throw new TypeError(
        `The step ${JSON.stringify(step)} gives ${JSON.stringify(draft.type)} to a side that does not see what `
        + 'the event changes.',
      );
    }

    try {
      this.add(draft, cause);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;

      throw new TypeError(
        `The step ${JSON.stringify(step)} gives ${JSON.stringify(draft.type)}, which does not fit the state: `
        + error.message,
        { cause: error },
      );
    }
  }

  private add(draft: EventDraft, cause: number | undefined): void {
    const kind = this.kinds.get(draft.type);

    if (kind === undefined) throw new TypeError(`The kernel has no kind of event ${JSON.stringify(draft.type)}.`);

    const event: BattleEvent = {
      id: this.recorded.length,
      payload: draft.payload,
      type: draft.type,
      version: kind.version,
      visibleTo: draft.visibleTo,
      ...(cause === undefined ? {} : { cause }),
    };

    this.current = applyEventOfKind(kind, this.current, event);
    this.recorded.push(event);
  }
}

function changedVisibility(state: BattleState, draft: EventDraft): VisibleTo {
  if (!isKernelName(draft.type) || !isRecord(draft.payload)) return VISIBLE_TO_ALL;

  const { effect, hazard, holder, unit, visibleTo = VISIBLE_TO_ALL } = draft.payload as ChangedParts;

  return [
    visibleTo,
    typeof unit === 'string' ? unitVisibility(state, unit) : unit?.visibleTo ?? VISIBLE_TO_ALL,
    typeof hazard === 'string' ? hazardVisibility(state, hazard) : VISIBLE_TO_ALL,
    holder === undefined ? VISIBLE_TO_ALL : holderVisibility(state, holder),
    holder === undefined ? VISIBLE_TO_ALL : effectVisibility(state, holder, effect),
  ].reduce(visibleToBoth, VISIBLE_TO_ALL);
}

function holderVisibility(state: BattleState, holder: EffectHolder | TurnHolder): VisibleTo {
  if (holder.kind === 'unit') return unitVisibility(state, holder.unit);

  return holder.kind === 'hazard' ? hazardVisibility(state, holder.hazard) : VISIBLE_TO_ALL;
}

function effectVisibility(state: BattleState, holder: EffectHolder | TurnHolder, effect: unknown): VisibleTo {
  if (isRecord(effect)) return (effect as Partial<AppliedEffect>).visibleTo ?? VISIBLE_TO_ALL;

  if (typeof effect !== 'number') return VISIBLE_TO_ALL;

  return effectsOf(state, holder).find(({ id }) => id === effect)?.visibleTo ?? VISIBLE_TO_ALL;
}

function unitVisibility(state: BattleState, unit: UnitId): VisibleTo {
  return findUnit(state, unit)?.visibleTo ?? VISIBLE_TO_ALL;
}

function hazardVisibility(state: BattleState, hazard: string): VisibleTo {
  return findHazard(state, hazard)?.visibleTo ?? VISIBLE_TO_ALL;
}

function seenWithin(state: BattleState, visibleTo: VisibleTo, bound: VisibleTo): boolean {
  if (bound === 'all') return true;

  const sides = visibleTo === 'all' ? state.sides.map(({ id }) => id) : visibleTo;

  return sides.every((side) => bound.includes(side));
}
