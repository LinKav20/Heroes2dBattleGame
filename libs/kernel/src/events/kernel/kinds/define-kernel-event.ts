import type { EventKind } from '../../../kinds/index.ts';
import type { BattleState } from '../../../model/index.ts';
import type { KernelEventType } from '../names.ts';
import type { KernelEventPayloads } from '../payloads/index.ts';

/**
 * Declares a kind of event of the kernel: version 1, no migrations and no schema, because `protocol` describes the
 * events of the kernel.
 */
export function defineKernelEvent<Type extends KernelEventType>(
  type: Type,
  apply: (state: BattleState, payload: KernelEventPayloads[Type]) => BattleState,
): EventKind<KernelEventPayloads[Type]> {
  return Object.freeze({ apply, kind: 'event', migrations: [], name: type, version: 1 });
}
