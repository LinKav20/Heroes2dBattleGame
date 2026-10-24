import { FULL_NAME_PATTERN, MAX_DIE_SIDES, NAME_SCHEMA, type JsonObject } from '@heroes2dgame/kernel';

/**
 * The JSON Schema of a full name of content, such as `core:speed`.
 */
export const FULL_NAME_SCHEMA: JsonObject = Object.freeze({ pattern: FULL_NAME_PATTERN, type: 'string' });

/**
 * The JSON Schema of a list of tags.
 */
export const TAGS_SCHEMA: JsonObject = Object.freeze({ items: NAME_SCHEMA, type: 'array' });

/**
 * The JSON Schema of the number of sides of a die, from 1 to `MAX_DIE_SIDES`.
 */
export const DIE_SCHEMA: JsonObject = Object.freeze({ maximum: MAX_DIE_SIDES, minimum: 1, type: 'integer' });
