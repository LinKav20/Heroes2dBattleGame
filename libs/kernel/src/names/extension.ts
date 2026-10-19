import type { JsonObject } from '../json/index.ts';

/**
 * What every extension declares: its full name and, optionally, a short name.
 *
 * Registries check extensions by the shape of the object, not by its class, so extensions from two installed copies
 * of the same package are accepted alike.
 */
export interface Extension {
  /** The full name `package:name`, for example `rules-stdlib:damage`. */
  readonly name: string;
  /** The name without the package prefix, for example `damage`, if the extension declares a short name. */
  readonly shortName?: string;
  /**
   * The data the extension keeps in the state of a battle under its full name in `BattleState.extensions`, if any.
   * Its version is part of the version of the state format.
   */
  readonly data?: ExtensionData;
}

/**
 * The data an extension keeps in the state of a battle: the version of its format and its schema. The extension raises
 * the version when the format of the data changes.
 */
export interface ExtensionData {
  /** The version of the format of the data, a whole number from 1. */
  readonly version: number;
  /** The JSON Schema of the data. */
  readonly schema: JsonObject;
}
