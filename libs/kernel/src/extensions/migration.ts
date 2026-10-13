/**
 * A migration that moves a payload of an event or the parameters of a step one version forward.
 */
export interface Migration {
  /** The version the migration starts from; the result has the next version. */
  readonly from: number;
  /** Returns the payload or the parameters in the next version. The function never changes its input. */
  migrate(value: unknown): unknown;
}
