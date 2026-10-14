import type { ContentRegistry } from '../content/index.ts';
import type { ContentName } from '../ids/index.ts';

/**
 * Which effects of content react to which kinds of events, by triggers or by ending events. The kernel builds it once
 * for every content it runs and holds the content weakly, so an event nobody reacts to costs one lookup.
 */
export class ReactionIndex {
  private readonly byContent = new WeakMap<ContentRegistry, ReadonlyMap<string, ReadonlySet<ContentName>>>();

  /**
   * Returns the full names of the effects that react to a kind of event, or nothing if no effect does.
   */
  reacting(content: ContentRegistry, type: string): ReadonlySet<ContentName> | undefined {
    return this.indexOf(content).get(type);
  }

  private indexOf(content: ContentRegistry): ReadonlyMap<string, ReadonlySet<ContentName>> {
    const known = this.byContent.get(content);

    if (known !== undefined) return known;

    const index = new Map<string, Set<ContentName>>();

    for (const effect of Object.values(content.effects)) {
      for (const { on } of [...effect.triggers, ...effect.endsOn]) {
        const names = index.get(on) ?? new Set<ContentName>();

        names.add(effect.name);
        index.set(on, names);
      }
    }

    this.byContent.set(content, index);

    return index;
  }
}
