import { isWellFormedText } from '../crypto/index.ts';
import { compareCodeUnits } from '../shared/index.ts';

interface Writer {
  readonly ancestors: Set<object>;
  readonly path: Array<number | string>;
}

/**
 * Writes a value as canonical JSON by RFC 8785, the JSON Canonicalization Scheme.
 *
 * Object keys are sorted by their UTF-16 code units, and there is no whitespace. The function accepts only values
 * whose canonical form is unambiguous:
 * - `null`, `true` and `false`;
 * - safe integers; `-0` is written as `0`;
 * - strings without lone surrogates;
 * - arrays without holes and without properties other than their items;
 * - plain objects, whose prototype is `Object.prototype` or `null`, without symbol keys.
 *
 * Objects and arrays are nested at most 256 levels deep. The same object may appear several times, but a value must
 * not contain itself.
 *
 * @throws {TypeError} If the value or a part of it is not one of the values above, is nested too deep or contains
 * itself. The message names the path to the part, such as `$.units[3].effects`.
 * @throws {RangeError} If a number is not a safe integer.
 */
export function canonicalJson(value: unknown): string {
  return writeValue(value, { ancestors: new Set(), path: [] });
}

const MAX_DEPTH = 256;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function writeValue(value: unknown, writer: Writer): string {
  if (value === null) return 'null';

  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (typeof value === 'number') return writeNumber(value, writer);

  if (typeof value === 'string') return writeString(value, writer);

  if (typeof value === 'object') return writeContainer(value, writer);

  throw new TypeError(`${pathOf(writer)} is of type ${typeof value}, which JSON cannot represent.`);
}

function writeNumber(value: number, writer: Writer): string {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${pathOf(writer)} is ${String(value)}, but only safe integers are allowed.`);
  }

  return String(value);
}

function writeString(value: string, writer: Writer): string {
  if (!isWellFormedText(value)) throw new TypeError(`${pathOf(writer)} contains a lone surrogate.`);

  return JSON.stringify(value);
}

function writeContainer(value: object, writer: Writer): string {
  if (writer.ancestors.has(value)) throw new TypeError(`${pathOf(writer)} contains itself.`);

  if (writer.path.length >= MAX_DEPTH) {
    throw new TypeError(`${pathOf(writer)} is nested deeper than ${String(MAX_DEPTH)} levels.`);
  }

  writer.ancestors.add(value);

  const json = Array.isArray(value) ? writeArray(value, writer) : writeObject(value, writer);

  writer.ancestors.delete(value);

  return json;
}

function writeArray(values: readonly unknown[], writer: Writer): string {
  let json = '[';

  for (let index = 0; index < values.length; index += 1) {
    writer.path.push(index);

    if (!Object.hasOwn(values, index)) throw new TypeError(`${pathOf(writer)} is a hole in the array.`);

    json += `${index === 0 ? '' : ','}${writeValue(values[index], writer)}`;
    writer.path.pop();
  }

  if (Object.keys(values).length !== values.length || Object.getOwnPropertySymbols(values).length > 0) {
    throw new TypeError(`${pathOf(writer)} has properties other than its items.`);
  }

  return `${json}]`;
}

function writeObject(value: object, writer: Writer): string {
  if (!isPlainObject(value)) throw new TypeError(`${pathOf(writer)} is not a plain object.`);

  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${pathOf(writer)} has symbol keys.`);

  const keys = Object.keys(value).sort(compareCodeUnits);
  let json = '{';

  for (const [index, key] of keys.entries()) {
    writer.path.push(key);
    json += `${index === 0 ? '' : ','}${writeString(key, writer)}:${writeValue(value[key], writer)}`;
    writer.path.pop();
  }

  return `${json}}`;
}

function isPlainObject(value: object): value is Readonly<Record<string, unknown>> {
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function pathOf(writer: Writer): string {
  return writer.path.reduce<string>((path, segment) => {
    if (typeof segment === 'number') return `${path}[${String(segment)}]`;

    return IDENTIFIER.test(segment) ? `${path}.${segment}` : `${path}[${JSON.stringify(segment)}]`;
  }, '$');
}
