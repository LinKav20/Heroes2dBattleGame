/**
 * Tells whether a value is an object that is not an array, so its fields can be read by name.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the value of an own key of a record, never a member of `Object.prototype` such as `constructor`.
 */
export function ownValue<Value>(record: Readonly<Record<string, Value>>, key: string): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Returns the object without one of its fields, or the same object if the field is absent.
 */
export function withoutKey<Value extends object, Key extends keyof Value>(value: Value, key: Key): Omit<Value, Key> {
  const { [key]: dropped, ...rest } = value;

  return dropped === undefined ? value : rest;
}
