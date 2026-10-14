import type { ContentName } from '../ids/index.ts';
import type { ExpressionNode } from './expressions.ts';

/**
 * Where an error of content is: the node and the definition, if the kernel knows them.
 */
export interface ContentErrorPlace {
  /** The full name of the node described wrongly. */
  readonly node?: string;
  /** The full name of the definition described wrongly, such as an effect or an attribute. */
  readonly definition?: ContentName;
}

/**
 * An error of content: a pack describes a definition, a node or a value wrongly, for example refers to a node that no
 * package declares, divides by zero or rolls dice where they cannot be rolled. The kernel throws it instead of treating
 * the problem as a rule of the game. It is a `TypeError` with the name `ContentError`; tell it by the name, because a
 * point of assembly may hold more than one copy of the kernel.
 */
export class ContentError extends TypeError {
  override readonly name = 'ContentError';

  /** The full name of the node described wrongly, if known. */
  declare readonly node?: string;

  /** The full name of the definition described wrongly, if known. */
  declare readonly definition?: ContentName;

  constructor(message: string, place: ContentErrorPlace = {}) {
    super(message);

    if (place.node !== undefined) this.node = place.node;

    if (place.definition !== undefined) this.definition = place.definition;
  }
}

/**
 * Returns an error of content about a node: the content describes the node wrongly.
 */
export function contentError(node: ExpressionNode, problem: string): ContentError {
  return new ContentError(`The node ${JSON.stringify(node.type)} ${problem}.`, { node: node.type });
}

/**
 * Returns a definition from a table of content by its full name.
 *
 * @throws {ContentError} If the content has no such definition.
 */
export function definitionOf<Definition>(
  table: Readonly<Record<ContentName, Definition>>,
  name: ContentName,
  what: string,
): Definition {
  const found = Object.hasOwn(table, name) ? table[name] : undefined;

  if (found === undefined) {
    throw new ContentError(`The content has no ${what} ${JSON.stringify(name)}.`, { definition: name });
  }

  return found;
}
