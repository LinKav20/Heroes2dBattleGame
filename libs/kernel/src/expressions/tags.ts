import type { Tag } from '../ids/index.ts';

/**
 * Tells whether a tag is the pattern or nested in it: `Debuff.Poison` matches `Debuff` and `Debuff.Poison`, but not
 * `Debu` or `Debuff.Poison.Strong`.
 */
export function tagMatches(tag: Tag, pattern: Tag): boolean {
  return tag === pattern || tag.startsWith(`${pattern}${TAG_SEPARATOR}`);
}

/**
 * Tells whether a unit has a tag or a tag nested in it from at least one source.
 */
export function hasTag(tags: Readonly<Record<Tag, number>>, pattern: Tag): boolean {
  return Object.entries(tags).some(([tag, sources]) => sources > 0 && tagMatches(tag, pattern));
}

/**
 * Tells whether any of the tags matches any of the patterns, for example whether an effect with the tag
 * `Debuff.Poison` is removed by an effect that removes `Debuff`.
 */
export function matchesAny(tags: readonly Tag[], patterns: readonly Tag[]): boolean {
  return tags.some((tag) => patterns.some((pattern) => tagMatches(tag, pattern)));
}

/**
 * Tells whether a unit with these tags is immune to an effect that is blocked by the given tags.
 */
export function isBlocked(tags: Readonly<Record<Tag, number>>, blockedBy: readonly Tag[]): boolean {
  return blockedBy.some((pattern) => hasTag(tags, pattern));
}

/**
 * Returns the tags of a unit after a source gives the tags or takes them back: the count of sources of every tag goes
 * up or down by one, and a tag without sources disappears.
 *
 * @throws {RangeError} If a source takes back a tag that has no sources.
 */
export function withTagSources(
  tags: Readonly<Record<Tag, number>>,
  changed: readonly Tag[],
  change: 'add' | 'remove',
): Readonly<Record<Tag, number>> {
  const next = new Map(Object.entries(tags));

  for (const tag of changed) {
    const sources = (next.get(tag) ?? 0) + (change === 'add' ? 1 : -1);

    if (sources < 0) throw new RangeError(`The tag ${JSON.stringify(tag)} has no source to take back.`);

    next.set(tag, sources);
  }

  return Object.fromEntries([...next].filter(([, sources]) => sources > 0));
}

const TAG_SEPARATOR = '.';
