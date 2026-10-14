import type { JsonObject } from '../../json/index.ts';
import { FULL_NAME_PATTERN, kernelName } from '../../names/index.ts';
import { freezeDeep } from '../../shared/index.ts';
import { SUBJECT_ROLES } from '../subjects.ts';

/**
 * What a name in the parameters of a node refers to: a definition of content or a random value of the ruleset.
 */
export type ReferenceKind = keyof typeof REFERENCE_FORMATS;

/**
 * The values of `$ref` that mark a nested formula, condition or operation in a schema of a node. The content loader
 * resolves each to a safe integer or `true` and `false` where they fit, or a node of any registered extension of that
 * kind: `formula` to `kernel:formula`, `condition` to `kernel:condition`, `operation` to `kernel:operation`.
 */
export const SCHEMA_REFERENCES = Object.freeze({
  condition: kernelName('condition'),
  formula: kernelName('formula'),
  operation: kernelName('operation'),
});

/**
 * The values of `format` that mark a full name of a definition in a schema of a node, by which the content loader
 * checks that the definition exists: an ability, an attribute, a battlefield, a creature, an effect, an item, an
 * obstacle, or a random value of the ruleset, as `kernel:` followed by the kind, for example `kernel:effect`.
 */
export const REFERENCE_FORMATS = Object.freeze({
  ability: kernelName('ability'),
  attribute: kernelName('attribute'),
  battlefield: kernelName('battlefield'),
  creature: kernelName('creature'),
  effect: kernelName('effect'),
  item: kernelName('item'),
  obstacle: kernelName('obstacle'),
  randomValue: kernelName('random-value'),
});

/**
 * A JSON Schema of a nested formula.
 */
export const FORMULA_SCHEMA: JsonObject = freezeDeep({ $ref: SCHEMA_REFERENCES.formula });

/**
 * A JSON Schema of a nested condition.
 */
export const CONDITION_SCHEMA: JsonObject = freezeDeep({ $ref: SCHEMA_REFERENCES.condition });

/**
 * A JSON Schema of a nested operation.
 */
export const OPERATION_SCHEMA: JsonObject = freezeDeep({ $ref: SCHEMA_REFERENCES.operation });

/**
 * A JSON Schema of a participant of a formula or a condition: `self`, `source` or `target`.
 */
export const ROLE_SCHEMA: JsonObject = freezeDeep({ enum: [...SUBJECT_ROLES] });

/**
 * A JSON Schema of a non-empty string, such as a tag or the local name of a variable.
 */
export const NAME_SCHEMA: JsonObject = freezeDeep({ minLength: 1, type: 'string' });

/**
 * A JSON Schema of a row of `kernel:table`: the smallest key of the row and its value.
 */
export const TABLE_ROW_SCHEMA: JsonObject = freezeDeep({
  additionalProperties: false,
  properties: { from: { type: 'integer' }, value: FORMULA_SCHEMA },
  required: ['from', 'value'],
  type: 'object',
});

/**
 * Returns the JSON Schema of the full name of a definition of content or a random value, marked with its format from
 * {@link REFERENCE_FORMATS}.
 */
export function referenceSchema(kind: ReferenceKind): JsonObject {
  return freezeDeep({ format: REFERENCE_FORMATS[kind], pattern: FULL_NAME_PATTERN, type: 'string' });
}

/**
 * Returns the JSON Schema of a node: its full name in `type` and the given parameters, all of them required except
 * the optional ones, with any other keys of the schema, such as `oneOf`.
 *
 * @throws {TypeError} If a parameter is called `type`, or an optional parameter is not among the parameters.
 */
export function nodeSchema(
  type: string,
  params: Readonly<Record<string, JsonObject>>,
  optional: readonly string[] = [],
  extra: JsonObject = {},
): JsonObject {
  const names = Object.keys(params);

  if (names.includes('type')) throw new TypeError(`The node ${JSON.stringify(type)} has a parameter called "type".`);

  const unknown = optional.filter((name) => !names.includes(name));

  if (unknown.length > 0) {
    throw new TypeError(`The node ${JSON.stringify(type)} has no parameters ${unknown.join(', ')} to make optional.`);
  }

  return freezeDeep({
    ...extra,
    additionalProperties: false,
    properties: { ...params, type: { const: type } },
    required: ['type', ...names.filter((name) => !optional.includes(name))],
    type: 'object',
  });
}

/**
 * Returns the JSON Schema of a non-empty list of items.
 */
export function listSchema(items: JsonObject): JsonObject {
  return freezeDeep({ items, minItems: 1, type: 'array' });
}
