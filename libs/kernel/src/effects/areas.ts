import { effectDefinition, fixedUnits, scenarioDefinition, type ContentRegistry } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import { evaluated, ownDefinitionEffects } from '../expressions/index.ts';
import type {
  Evaluation,
  EventDraft,
  Expressions,
  FieldGeometry,
  StepContext,
  StepKind,
  StepResult,
} from '../extensions/index.ts';
import { VISIBLE_TO_NONE, visibleToBoth, type ContentName, type UnitId, type VisibleTo } from '../ids/index.ts';
import {
  battleUnit,
  findHazard,
  standsOnField,
  type AppliedEffect,
  type BattleState,
  type Unit,
} from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { kernelStep } from '../operations/index.ts';
import { compareCodeUnits } from '../shared/index.ts';
import { activity } from './activity.ts';
import { visibilityOf } from './applied.ts';
import { checkAura } from './effect-checks.ts';

interface AuraSource {
  readonly effect: ContentName;
  readonly applied?: AppliedEffect;
}

interface Change {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly visibleTo: VisibleTo;
}

/**
 * Brings the auras that cover units and the hazard zones they stand in up to date, with `kernel:auras-changed` and
 * `kernel:zones-changed`.
 *
 * An aura comes from an effect of a unit that stands on the field: an effect of its creature or items or an effect
 * applied to it, while the effect acts. Activity is judged by the auras and zones from before the refresh. The aura
 * covers the other units that stand on the field and have a cell within its radius from a cell of the holder: all of
 * them, the allies of the holder or its enemies, as the aura says. The effects of the auras of the same name act on a
 * unit once, and the effects that auras give create no auras. A unit stands in a hazard zone when one of its cells is
 * in the zone. A unit that does not stand on the field has neither. During deployment only the units whose cells the
 * scenario fixed count: the others may still move, and their cells are hidden from the other sides.
 *
 * Every event names what came and what went. The auras and zones that the same sides see share one event, which the
 * sides see that see both the unit and these auras or zones, as `auraVisibility` and `zoneVisibility` tell.
 *
 * @throws {ContentError} If an aura is not a radius of a whole number of cells, or a condition of activity rolls dice
 * or is described wrongly.
 */
export const AREA_REFRESH_STEP: StepKind = kernelStep(KERNEL_STEPS.areaRefresh, refreshAreas);

/**
 * Returns who sees that an aura covers a unit: who sees its effect as if it were applied to the unit.
 *
 * @throws {ContentError} If the content has no such effect.
 */
export function auraVisibility(content: ContentRegistry, state: BattleState, unit: Unit, aura: ContentName): VisibleTo {
  return visibilityOf(effectDefinition(content, aura), state, { kind: 'unit', unit: unit.id });
}

/**
 * Returns who sees that a unit stands in a hazard zone: the sides that see both the unit and the zone.
 */
export function zoneVisibility(state: BattleState, unit: Unit, zone: string): VisibleTo {
  return visibleToBoth(unit.visibleTo, findHazard(state, zone)?.visibleTo ?? VISIBLE_TO_NONE);
}

function refreshAreas({ content, expressions, field, state }: StepContext): StepResult {
  const placed = placedUnits(state, content);
  const covered = coverage(state, content, expressions, field, placed);

  if (covered.kind !== 'value') return covered;

  const events: EventDraft[] = [];
  const inZones = state.field.hazards.map(({ cells, id }) => ({ id, units: new Set(field.unitsTouching(cells)) }));

  for (const unit of state.units) {
    const zones = placed.has(unit.id) ? inZones.filter(({ units }) => units.has(unit.id)).map(({ id }) => id) : [];
    const auras = [...covered.value.get(unit.id) ?? []];
    const auraChanges = changes(unit.auras, auras, (aura) => auraVisibility(content, state, unit, aura));
    const zoneChanges = changes(unit.zones, zones, (zone) => zoneVisibility(state, unit, zone));

    for (const { added, removed, visibleTo } of auraChanges) {
      events.push(kernelEventDraft(KERNEL_EVENTS.aurasChanged, { added, removed, unit: unit.id }, visibleTo));
    }

    for (const { added, removed, visibleTo } of zoneChanges) {
      events.push(kernelEventDraft(KERNEL_EVENTS.zonesChanged, { added, removed, unit: unit.id }, visibleTo));
    }
  }

  return { events, kind: 'done' };
}

function coverage(
  state: BattleState,
  content: ContentRegistry,
  expressions: Expressions,
  field: FieldGeometry,
  placed: ReadonlySet<UnitId>,
): Evaluation<ReadonlyMap<UnitId, ReadonlySet<ContentName>>> {
  const covered = new Map<UnitId, Set<ContentName>>();

  for (const holder of state.units.filter(({ id }) => placed.has(id))) {
    const sources: readonly AuraSource[] = [
      ...ownDefinitionEffects(content, holder).map((effect) => ({ effect })),
      ...holder.effects.map((applied) => ({ applied, effect: applied.effect })),
    ];

    for (const { applied, effect } of sources) {
      const definition = effectDefinition(content, effect);
      const { aura } = definition;

      if (aura === undefined) continue;

      checkAura(definition, aura);

      const acts = activity(expressions, definition, { kind: 'unit', unit: holder.id }, applied);

      if (acts.kind !== 'value') return acts;

      if (!acts.value) continue;

      const area = field.cellsOf(holder.id).flatMap((cell) => field.area(aura.area, cell));

      const touched = field.unitsTouching(area).filter((id) => placed.has(id));

      for (const unit of touched.map((id) => battleUnit(state, id))) {
        const ally = unit.side === holder.side;
        const fits = aura.affects === 'all' || (aura.affects === 'allies') === ally;

        if (unit.id === holder.id || !fits) continue;

        const effects = covered.get(unit.id) ?? new Set<ContentName>();

        effects.add(aura.effect);
        covered.set(unit.id, effects);
      }
    }
  }

  return evaluated(covered);
}

function placedUnits(state: BattleState, content: ContentRegistry): ReadonlySet<UnitId> {
  const fixed = state.phase.kind === 'deployment' ? fixedUnits(scenarioDefinition(content, state.scenario)) : undefined;
  const placed = state.units.filter((unit) => standsOnField(unit) && (fixed?.has(unit.id) ?? true));

  return new Set(placed.map(({ id }) => id));
}

function changes(
  before: readonly string[],
  after: readonly string[],
  seen: (name: string) => VisibleTo,
): readonly Change[] {
  const groups = new Map<string, { added: string[]; removed: string[]; visibleTo: VisibleTo }>();
  const added = after.filter((name) => !before.includes(name)).toSorted(compareCodeUnits);
  const removed = before.filter((name) => !after.includes(name)).toSorted(compareCodeUnits);

  for (const [name, list] of [
    ...added.map((name) => [name, 'added'] as const),
    ...removed.map((name) => [name, 'removed'] as const),
  ]) {
    const visibleTo = seen(name);
    const key = visibleTo === 'all' ? 'all' : JSON.stringify(visibleTo.toSorted(compareCodeUnits));
    const group = groups.get(key) ?? { added: [], removed: [], visibleTo };

    group[list].push(name);
    groups.set(key, group);
  }

  return [...groups.values()];
}
