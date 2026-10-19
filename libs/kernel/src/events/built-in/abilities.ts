import type { ContentName, UnitId } from '../../ids/index.ts';
import type { AbilityUse, BattleState, SideHolder, Target, UnitHolder } from '../../model/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';
import { changeSide, changeUnit } from './state-changes.ts';

/**
 * The payload of `kernel:actions-changed`.
 */
export interface ActionsChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The actions of the turn the unit has spent after the change, by the full name of the kind of action. */
  readonly spent: Readonly<Record<ContentName, number>>;
}

/**
 * The payload of `kernel:ability-used`.
 */
export interface AbilityUsedPayload {
  /** The unit or the side that used the ability. */
  readonly holder: SideHolder | UnitHolder;
  /** How the ability has been used after this use. */
  readonly use: AbilityUse;
  /** The item of the unit whose ability it is, if the unit used an item. */
  readonly item?: number;
  /** The chosen targets. */
  readonly targets: readonly Target[];
}

/**
 * The payload of `kernel:ability-uses-changed`.
 */
export interface AbilityUsesChangedPayload {
  /** The unit or the side. */
  readonly holder: SideHolder | UnitHolder;
  /** How the unit or the side has used its abilities after the change. */
  readonly uses: readonly AbilityUse[];
}

/**
 * The payloads of the events of the kernel about abilities and actions.
 */
export interface AbilityEventPayloads {
  /** A unit spent actions of its turn, or got them back. */
  readonly [KERNEL_EVENTS.actionsChanged]: ActionsChangedPayload;
  /** A unit used an ability, or a side used its own ability. */
  readonly [KERNEL_EVENTS.abilityUsed]: AbilityUsedPayload;
  /** The counts of uses or the cooldowns of the abilities of a unit or a side changed, for example at a new turn. */
  readonly [KERNEL_EVENTS.abilityUsesChanged]: AbilityUsesChangedPayload;
}

/**
 * How the events of the kernel about abilities and actions change the state.
 */
export const ABILITY_EVENTS: KernelEventAppliers<AbilityEventPayloads> = {
  [KERNEL_EVENTS.actionsChanged]: (state, { spent, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, spentActions: spent })),
  [KERNEL_EVENTS.abilityUsed]: (state, { holder, use }) =>
    changeUses(state, holder, (uses) => recordUse(uses, use)),
  [KERNEL_EVENTS.abilityUsesChanged]: (state, { holder, uses }) => changeUses(state, holder, () => uses),
};

function changeUses(
  state: BattleState,
  holder: SideHolder | UnitHolder,
  change: (uses: readonly AbilityUse[]) => readonly AbilityUse[],
): BattleState {
  return holder.kind === 'unit'
    ? changeUnit(state, holder.unit, (unit) => ({ ...unit, abilityUses: change(unit.abilityUses) }))
    : changeSide(state, holder.side, (side) => ({ ...side, abilityUses: change(side.abilityUses) }));
}

function recordUse(uses: readonly AbilityUse[], use: AbilityUse): readonly AbilityUse[] {
  if (!uses.some(({ ability }) => ability === use.ability)) return [...uses, use];

  return uses.map((current) => (current.ability === use.ability ? use : current));
}
