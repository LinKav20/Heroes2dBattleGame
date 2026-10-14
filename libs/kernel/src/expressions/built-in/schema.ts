import type { JsonObject } from '../../json/index.ts';

/**
 * A JSON Schema of a formula: a safe integer or a node.
 */
export const FORMULA_SCHEMA: JsonObject = Object.freeze({
  anyOf: [{ type: 'integer' }, { required: ['type'], type: 'object' }],
});

/**
 * A JSON Schema of a condition: `true`, `false` or a node.
 */
export const CONDITION_SCHEMA: JsonObject = Object.freeze({
  anyOf: [{ type: 'boolean' }, { required: ['type'], type: 'object' }],
});

/**
 * A JSON Schema of a participant of a formula or a condition.
 */
export const ROLE_SCHEMA: JsonObject = Object.freeze({ enum: ['self', 'source', 'target'] });

/**
 * A JSON Schema of a non-empty string, such as a full name or the local name of a variable.
 */
export const NAME_SCHEMA: JsonObject = Object.freeze({ minLength: 1, type: 'string' });

/**
 * A JSON Schema of a row of `kernel:table`: the smallest key of the row and its value.
 */
export const TABLE_ROW_SCHEMA: JsonObject = Object.freeze({
  additionalProperties: false,
  properties: { from: { type: 'integer' }, value: FORMULA_SCHEMA },
  required: ['from', 'value'],
  type: 'object',
});

/**
 * Returns the JSON Schema of a node: its full name in `type` and the given parameters, all of them required except
 * the optional ones.
 */
export function nodeSchema(
  type: string,
  params: Readonly<Record<string, JsonObject>>,
  optional: readonly string[] = [],
): JsonObject {
  return Object.freeze({
    additionalProperties: false,
    properties: { ...params, type: { const: type } },
    required: ['type', ...Object.keys(params).filter((name) => !optional.includes(name))],
    type: 'object',
  });
}

/**
 * Returns the JSON Schema of a non-empty list of items.
 */
export function listSchema(items: JsonObject): JsonObject {
  return Object.freeze({ items, minItems: 1, type: 'array' });
}
