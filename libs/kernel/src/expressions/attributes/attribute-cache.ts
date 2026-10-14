import type { ContentRegistry } from '../../content/index.ts';
import type { ContentName, UnitId } from '../../ids/index.ts';
import type { BattleState } from '../../model/index.ts';

/**
 * Values of attributes the kernel has calculated, kept until the state changes. A state never changes, so a value is
 * kept for the state object and the content object it was calculated from; both are held weakly.
 */
export class AttributeCache {
  private readonly byContent = new WeakMap<ContentRegistry, WeakMap<BattleState, Map<string, number>>>();

  /**
   * Returns the value of an attribute of a unit calculated for this state and content, if any.
   */
  get(content: ContentRegistry, state: BattleState, unit: UnitId, attribute: ContentName): number | undefined {
    return this.byContent.get(content)?.get(state)?.get(cacheKey(unit, attribute));
  }

  /**
   * Keeps the value of an attribute of a unit calculated for this state and content.
   */
  set(content: ContentRegistry, state: BattleState, unit: UnitId, attribute: ContentName, value: number): void {
    let byState = this.byContent.get(content);

    if (byState === undefined) {
      byState = new WeakMap();
      this.byContent.set(content, byState);
    }

    let values = byState.get(state);

    if (values === undefined) {
      values = new Map();
      byState.set(state, values);
    }

    values.set(cacheKey(unit, attribute), value);
  }
}

/**
 * Returns the key of an attribute of a unit.
 */
export function cacheKey(unit: UnitId, attribute: ContentName): string {
  return JSON.stringify([unit, attribute]);
}
