import { applyEvent, type KernelEventPayloads, type KernelEventType } from '../events/index.ts';
import type { VisibleTo } from '../ids/index.ts';
import type { EventDraft, EventKind } from '../kinds/index.ts';
import type { BattleEvent, BattleState } from '../model/index.ts';
import type { Registry } from '../names/index.ts';

/**
 * Collects the events of one command: numbers them from 0, gives them their cause and the current version of their
 * kind, and applies every event to the state at once, so the next step sees it.
 */
export class EventRecorder {
  private current: BattleState;

  private readonly recorded: BattleEvent[] = [];

  constructor(private readonly kinds: Registry<EventKind>, state: BattleState) {
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

  /** The number the next event gets. */
  get nextId(): number {
    return this.recorded.length;
  }

  /**
   * Records an event of the kernel.
   */
  kernel<Type extends KernelEventType>(
    type: Type,
    payload: KernelEventPayloads[Type],
    visibleTo: VisibleTo,
    cause?: number,
  ): void {
    this.record({ payload, type, visibleTo }, cause);
  }

  /**
   * Records an event a step gave.
   *
   * @throws {TypeError} If the kernel has no kind of this event.
   */
  record(draft: EventDraft, cause?: number): void {
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

    this.current = applyEvent(this.kinds, this.current, event);
    this.recorded.push(event);
  }
}
