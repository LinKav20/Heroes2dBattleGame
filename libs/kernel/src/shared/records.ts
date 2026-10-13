/**
 * Tells whether a value is an object that is not an array, so its fields can be read by name.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
