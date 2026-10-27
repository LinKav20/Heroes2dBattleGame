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
