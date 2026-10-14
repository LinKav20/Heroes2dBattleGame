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
 * Tells whether a unit with these tags is immune to an effect that is blocked by the given tags: the unit has a
 * blocking tag, a tag nested in it, or a broader tag that it is nested in. So `Immunity.Mind` blocks an effect blocked
 * by `Immunity.Mind.Fear`, and `Immunity.Mind.Fear` blocks an effect blocked by `Immunity.Mind`.
 */
export function isBlocked(tags: Readonly<Record<Tag, number>>, blockedBy: readonly Tag[]): boolean {
  return Object.entries(tags).some(([tag, sources]) => sources > 0
    && blockedBy.some((pattern) => tagMatches(tag, pattern) || tagMatches(pattern, tag)));
}

const TAG_SEPARATOR = '.';
