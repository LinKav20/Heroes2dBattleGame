import type { ExpressionNode } from '../../content/index.ts';
import type { ExpressionContext } from '../../extensions/index.ts';
import { isRecord, ownValue } from '../../shared/index.ts';
import { listParam } from '../params.ts';

/**
 * Returns the field of the payload of the event of the scope at the path in the parameter `path` of a node: its own
 * keys only, nothing without an event or the field.
 *
 * @throws {ContentError} If `path` is not a list of names.
 */
export function eventField(node: ExpressionNode, context: ExpressionContext): unknown {
  return eventPath(node).reduce<unknown>(
    (current, key) => (isRecord(current) ? ownValue(current, key) : undefined),
    context.event?.payload,
  );
}

/**
 * Returns the parameter `path` of a node that reads a field of an event.
 *
 * @throws {ContentError} If it is not a list of names.
 */
export function eventPath(node: ExpressionNode): readonly string[] {
  return listParam(node, 'path', (value): value is string => typeof value === 'string');
}
