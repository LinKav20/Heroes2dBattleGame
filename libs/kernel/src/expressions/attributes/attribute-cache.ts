import type { ContentRegistry } from '../../content/index.ts';
import type { ContentName, Tag, UnitId } from '../../ids/index.ts';
import type { BattleState, SideTarget, UnitTarget } from '../../model/index.ts';

interface StateValues {
  readonly attributes: Map<string, Map<ContentName, number>>;
  readonly tags: Map<UnitId, Readonly<Record<Tag, number>>>;
}

/**
 * Values of attributes and tags the kernel has calculated, kept until the state changes. A state never changes, so a
 * value is kept for the state object and the content object it was calculated from; both are held weakly. The kernel
 * requires that nobody changes a state object in place.
 */
export class AttributeCache {
  private readonly byContent = new WeakMap<ContentRegistry, WeakMap<BattleState, StateValues>>();

  /**
   * Returns the value of an attribute of a unit or a side calculated for this state and content, if any.
   */
  attribute(
    content: ContentRegistry,
    state: BattleState,
    of: SideTarget | UnitTarget,
    attribute: ContentName,
  ): number | undefined {
    return this.byContent.get(content)?.get(state)?.attributes.get(holderKey(of))?.get(attribute);
  }

  /**
   * Keeps the value of an attribute of a unit or a side calculated for this state and content.
   */
  setAttribute(
    content: ContentRegistry,
    state: BattleState,
    of: SideTarget | UnitTarget,
    attribute: ContentName,
    value: number,
  ): void {
    const { attributes } = this.valuesOf(content, state);
    const key = holderKey(of);
    const values = attributes.get(key) ?? new Map<ContentName, number>();

    values.set(attribute, value);
    attributes.set(key, values);
  }

  /**
   * Returns the tags of a unit calculated for this state and content, if any.
   */
  tags(content: ContentRegistry, state: BattleState, unit: UnitId): Readonly<Record<Tag, number>> | undefined {
    return this.byContent.get(content)?.get(state)?.tags.get(unit);
  }

  /**
   * Keeps the tags of a unit calculated for this state and content.
   */
  setTags(content: ContentRegistry, state: BattleState, unit: UnitId, tags: Readonly<Record<Tag, number>>): void {
    this.valuesOf(content, state).tags.set(unit, tags);
  }

  /**
   * Keeps the values calculated for one state for another state that differs only in what attributes and tags do not
   * depend on, such as the counter of the generator.
   */
  carry(content: ContentRegistry, from: BattleState, to: BattleState): void {
    const values = this.byContent.get(content)?.get(from);

    if (values !== undefined) this.byContent.get(content)?.set(to, values);
  }

  private valuesOf(content: ContentRegistry, state: BattleState): StateValues {
    const byState = this.byContent.get(content) ?? new WeakMap<BattleState, StateValues>();
    const values = byState.get(state) ?? { attributes: new Map(), tags: new Map() };

    byState.set(state, values);
    this.byContent.set(content, byState);

    return values;
  }
}

function holderKey(of: SideTarget | UnitTarget): string {
  return of.kind === 'unit' ? `unit:${of.unit}` : `side:${of.side}`;
}
