import type { BattleEventPayloads } from './battle.ts';
import type { EffectEventPayloads } from './effects.ts';
import type { ExecutionEventPayloads } from './execution.ts';
import type { FieldEventPayloads } from './field.ts';
import type { InventoryEventPayloads } from './inventory.ts';
import type { ScenarioEventPayloads } from './scenario.ts';
import type { UnitEventPayloads } from './units.ts';

/**
 * The payload of every kind of event of the kernel, by the full name of the kind.
 */
export type KernelEventPayloads = BattleEventPayloads
  & EffectEventPayloads
  & ExecutionEventPayloads
  & FieldEventPayloads
  & InventoryEventPayloads
  & ScenarioEventPayloads
  & UnitEventPayloads;
