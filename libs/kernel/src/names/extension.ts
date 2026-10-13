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
}
