import type { VisibleTo } from '../ids/index.ts';

/**
 * Something that has already happened, with its result: the event holds the values after the change, such as how
 * many creatures are left. It says nothing about how to show it on the screen.
 *
 * `Payload` is the format of the payload. It is JSON; the schema of the kind of event describes it.
 */
export interface BattleEvent<Payload = unknown> {
  /** The full name of the kind of event, for example `kernel:unit-moved`. */
  readonly type: string;
  /** The version of the format of this kind of event. */
  readonly version: number;
  /** The number of the event in its batch, starting at 0. */
  readonly id: number;
  /** The number of the event in the same batch that caused this one, for example the attack for a retaliation. */
  readonly cause?: number;
  /** Which sides see the event. */
  readonly visibleTo: VisibleTo;
  /** What happened. Its format belongs to the kind of event. */
  readonly payload: Payload;
}

/**
 * All events of one command. The batch applies as a whole or not at all. The application layer numbers batches when it
 * writes them to the journal.
 */
export type EventBatch = readonly BattleEvent[];
