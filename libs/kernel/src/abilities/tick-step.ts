import { creatureDefinition, type ResourceRule } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, Evaluation, Expressions, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import { VISIBLE_TO_ALL, type VisibleTo } from '../ids/index.ts';
import {
  battleSide,
  battleUnit,
  type AbilityUse,
  type SideHolder,
  type Unit,
  type UnitHolder,
} from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { sortedEntries } from '../shared/index.ts';
import type { AbilityTickParams } from './params.ts';

/**
 * Starts a turn or a round for abilities, actions and resources. At the start of the turn of a unit or a side, its
 * uses during the turn start from 0 and its cooldowns go down by one turn; a unit gets back the actions of the turn it
 * has spent, and its resources restored every turn reach their bound. At the start of a round, the uses during the
 * round of every unit and side start from 0, and the resources restored every round reach their bound. A resource
 * that is already above its bound keeps its value, and a unit with no creatures left restores nothing.
 *
 * @throws {TypeError} If the unit or the side is not in the battle.
 * @throws {ContentError} If the content has no definition of a creature or of the attribute that bounds a resource.
 */
export const ABILITY_TICK_STEP: StepKind<AbilityTickParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.abilityTick,
  run: tick,
  version: 1,
});

function tick({ content, expressions, params, state }: StepContext<AbilityTickParams>): StepResult {
  const events: EventDraft[] = [];

  if (params.moment === 'round-start') {
    for (const unit of state.units) {
      events.push(...usesChange({ kind: 'unit', unit: unit.id }, unit.abilityUses, roundStarted, unit.visibleTo));
    }

    for (const side of state.sides) {
      events.push(...usesChange({ kind: 'side', side: side.id }, side.abilityUses, roundStarted, VISIBLE_TO_ALL));
    }

    for (const unit of state.units) {
      const restored = restore(unit, creatureDefinition(content, unit.creature).resources, 'round', expressions);

      if (restored.kind !== 'value') return restored;

      events.push(...restored.value);
    }

    return { events, kind: 'done' };
  }

  const { holder } = params;

  if (holder.kind === 'side') {
    const uses = battleSide(state, holder.side).abilityUses;

    return { events: usesChange(holder, uses, turnStarted, VISIBLE_TO_ALL), kind: 'done' };
  }

  const unit = battleUnit(state, holder.unit);
  const restored = restore(unit, creatureDefinition(content, unit.creature).resources, 'turn', expressions);

  if (restored.kind !== 'value') return restored;

  return { events: [...turnEvents(unit, holder), ...restored.value], kind: 'done' };
}

function turnEvents(unit: Unit, holder: UnitHolder): readonly EventDraft[] {
  const uses = usesChange(holder, unit.abilityUses, turnStarted, unit.visibleTo);
  const spent = { spent: {}, unit: unit.id };

  return Object.keys(unit.spentActions).length === 0
    ? uses
    : [...uses, kernelEventDraft(KERNEL_EVENTS.actionsChanged, spent, unit.visibleTo)];
}

function restore(
  unit: Unit,
  rules: Readonly<Record<string, ResourceRule>>,
  moment: 'round' | 'turn',
  expressions: Expressions,
): Evaluation<readonly EventDraft[]> {
  const events: EventDraft[] = [];

  for (const [resource, rule] of sortedEntries(rules)) {
    if (rule.restore !== moment || unit.count === 0) continue;

    const limit = expressions.attribute({ kind: 'unit', unit: unit.id }, rule.limit);

    if (limit.kind !== 'value') return limit;

    const current = unit.resources[resource] ?? 0;
    const value = Math.max(current, limit.value, 0);

    if (value !== current) {
      events.push(kernelEventDraft(KERNEL_EVENTS.resourceChanged, { resource, unit: unit.id, value }, unit.visibleTo));
    }
  }

  return { kind: 'value', value: events };
}

function usesChange(
  holder: SideHolder | UnitHolder,
  uses: readonly AbilityUse[],
  change: (use: AbilityUse) => AbilityUse,
  visibleTo: VisibleTo,
): readonly EventDraft[] {
  const next = uses.map(change);

  if (next.every((use, index) => use === uses[index])) return [];

  return [kernelEventDraft(KERNEL_EVENTS.abilityUsesChanged, { holder, uses: next }, visibleTo)];
}

function roundStarted(use: AbilityUse): AbilityUse {
  return use.round === 0 ? use : { ...use, round: 0 };
}

function turnStarted(use: AbilityUse): AbilityUse {
  return use.turn === 0 && use.cooldown === 0 ? use : { ...use, cooldown: Math.max(0, use.cooldown - 1), turn: 0 };
}
