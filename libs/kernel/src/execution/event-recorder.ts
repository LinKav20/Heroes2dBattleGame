import { applyEventOfKind, kernelEventDraft, RUNNER_EVENTS, type KernelEventPayloads, type KernelEventType }
  from '../events/index.ts';
import type { EventDraft, EventKind } from '../extensions/index.ts';
import type { VisibleTo } from '../ids/index.ts';
import type { BattleEvent, BattleState } from '../model/index.ts';
import type { Registry } from '../names/index.ts';

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
   * @throws {TypeError} If the kernel has no kind of this event, only the kernel itself gives such events, or the event
   * does not fit the state, for example refers to a unit that is not in the battle.
   */
  fromStep(step: string, draft: EventDraft, cause?: number): void {
    if (RUNNER_EVENTS.some((type) => type === draft.type)) {
      throw new TypeError(
        `The step ${JSON.stringify(step)} gives ${JSON.stringify(draft.type)}, but only the kernel gives this event `
        + 'while it runs a command.',
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
