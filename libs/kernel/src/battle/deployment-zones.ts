import type { Scenario, ScenarioSide } from '../content/index.ts';
import type { FieldGeometry } from '../extensions/index.ts';
import type { CellId, SideId, UnitId } from '../ids/index.ts';

/**
 * Returns the side of a scenario with the identifier, if any.
 */
export function scenarioSide(scenario: Scenario, side: SideId): ScenarioSide | undefined {
  return scenario.sides.find(({ id }) => id === side);
}

/**
 * Returns the units to which the scenario gives a cell: they stand there from the start and are not placed.
 */
export function fixedUnits(scenario: Scenario): ReadonlySet<UnitId> {
  const units = scenario.sides.flatMap((side) => side.units);

  return new Set(units.filter(({ cell }) => cell !== undefined).map(({ id }) => id));
}

/**
 * Tells whether a unit can stand in a cell with a direction and keep all its cells in a deployment zone.
 */
export function fitsZone(
  field: FieldGeometry,
  unit: UnitId,
  cell: CellId,
  facing: string | undefined,
  zone: ReadonlySet<CellId>,
): boolean {
  const cells = field.cellsAt(unit, cell, facing);

  return cells !== undefined && cells.every((taken) => zone.has(taken)) && field.canStand(unit, cell, facing);
}
