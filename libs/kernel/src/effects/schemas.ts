import { NAME_SCHEMA } from '../expressions/index.ts';
import type { JsonObject } from '../json/index.ts';

/**
 * The JSON Schemas of the parameters of `kernel:apply-effect`.
 */
export const APPLY_PARAMS: Readonly<Record<string, JsonObject>> = Object.freeze({
  effect: NAME_SCHEMA,
  params: { type: 'object' },
  to: { enum: ['field', 'self', 'source', 'target'] },
});

/**
 * The JSON Schemas of the parameters of `kernel:remove-effects`.
 */
export const REMOVE_PARAMS: Readonly<Record<string, JsonObject>> = Object.freeze({
  from: { enum: ['field', 'self', 'source', 'target'] },
  tags: { items: NAME_SCHEMA, minItems: 1, type: 'array' },
});

/**
 * The JSON Schemas of the parameters of `kernel:set-variable`.
 */
export const SET_PARAMS: Readonly<Record<string, JsonObject>> = Object.freeze({
  value: { type: ['boolean', 'integer', 'object', 'string'] },
  variable: NAME_SCHEMA,
});
