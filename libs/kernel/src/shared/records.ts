/**
 * Tells whether a value is an object that is not an array, so its fields can be read by name.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the object without one of its fields, or the same object if the field is absent.
 */
export function withoutKey<Value extends object, Key extends keyof Value>(value: Value, key: Key): Omit<Value, Key> {
  const { [key]: dropped, ...rest } = value;

  return dropped === undefined ? value : rest;
}
