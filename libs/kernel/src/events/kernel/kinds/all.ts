import type { EventKind } from '../../../kinds/index.ts';
import { compareCodeUnits } from '../../../shared/index.ts';
import { BATTLE_EVENT_KINDS } from './battle.ts';
import { EFFECT_EVENT_KINDS } from './effects.ts';
import { FIELD_EVENT_KINDS } from './field.ts';
import { INVENTORY_EVENT_KINDS } from './inventory.ts';
import { SCENARIO_EVENT_KINDS } from './scenario.ts';
import { UNIT_EVENT_KINDS } from './units.ts';

/**
 * All kinds of events of the kernel, sorted by name. The kernel registers them itself under the prefix `kernel`.
 */
export const KERNEL_EVENT_KINDS: readonly EventKind[] = Object.freeze(
  [
    ...BATTLE_EVENT_KINDS,
    ...EFFECT_EVENT_KINDS,
    ...FIELD_EVENT_KINDS,
    ...INVENTORY_EVENT_KINDS,
    ...SCENARIO_EVENT_KINDS,
    ...UNIT_EVENT_KINDS,
  ].sort((left, right) => compareCodeUnits(left.name, right.name)),
);
