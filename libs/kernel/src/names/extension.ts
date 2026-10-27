import type { JsonObject, JsonValue } from '../json/index.ts';

/**
 * What every extension declares: its full name and, optionally, a short name.
 *
 * Registries check extensions by the shape of the object, not by its class, so extensions from two installed copies
 * of the same package are accepted alike.
 */
export interface Extension {
  /** The full name `package:name`, for example `rules-stdlib:hex`. */
  readonly name: string;
  /** The name without the package prefix, for example `hex`, if the extension declares a short name. */
  readonly shortName?: string;
  /**
   * The data the extension keeps in the state of a battle under its full name in `BattleState.extensions`, if any.
   * Its version is part of the version of the state format.
   */
  readonly data?: ExtensionData;
}

/**
 * The data an extension keeps in the state of a battle: the version of its format, its schema and how a projection
 * shows it. The extension raises the version when the format of the data changes.
 */
export interface ExtensionData {
  /** The version of the format of the data, a whole number from 1. */
  readonly version: number;
  /** The JSON Schema of the data. */
  readonly schema: JsonObject;
  /**
   * Returns the data as an actor sees it who sees only what some sides see, or nothing if such an actor sees none of
   * it, for example without the units the actor does not see, and without the cells `seesCell` hides. Without the
   * function only an actor with full visibility sees the data, so on a projection for sides the data is missing and the
   * code of the extension takes missing data for the data it starts with. The function is pure and gives the same
   * result for the same input.
   */
  readonly project?: (data: JsonValue, view: DataView) => JsonValue | undefined;
}

/**
 * What an actor sees, as the projection of the data of an extension needs it.
 */
export interface DataView {
  /** The sides whose view the actor has. */
  readonly sides: readonly string[];
  /** Tells whether the actor sees the unit; a unit not in the battle is not seen. */
  readonly seesUnit: (unit: string) => boolean;
  /**
   * Tells whether the actor sees where the unit stands: a unit it sees, unless deployment hides the cell of a unit
   * that another side places.
   */
  readonly seesCell: (unit: string) => boolean;
}
