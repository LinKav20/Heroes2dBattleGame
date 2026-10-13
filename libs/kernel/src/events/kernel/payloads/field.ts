import type { CellId, VisibleTo } from '../../../ids/index.ts';

/**
 * The payload of `kernel:hazard-added`.
 */
export interface HazardAddedPayload {
  /** The identifier of the zone. */
  readonly hazard: string;
  /** The cells of the zone. */
  readonly cells: readonly CellId[];
  /** Which sides see the zone. */
  readonly visibleTo: VisibleTo;
}

/**
 * The payload of `kernel:hazard-removed`.
 */
export interface HazardRemovedPayload {
  /** The identifier of the zone. */
  readonly hazard: string;
}
