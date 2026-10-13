/**
 * A JSON value as the kernel stores it: there is no `null`, absent fields are left out, and numbers are safe
 * integers. `canonicalJson` accepts every such value.
 */
export type JsonValue = boolean | JsonArray | JsonObject | number | string;

/**
 * A JSON array.
 */
export type JsonArray = readonly JsonValue[];

/**
 * A JSON object.
 */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
