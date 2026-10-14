import { describe, expect, it } from 'vitest';
import { hasTag, isBlocked, matchesAny, tagMatches, withTagSources } from '../index.ts';

describe('tags', () => {
  it('match a tag and the tags nested in it, not tags that only start alike', () => {
    expect(tagMatches('Debuff.Poison', 'Debuff')).toBe(true);
    expect(tagMatches('Debuff.Poison', 'Debuff.Poison')).toBe(true);
    expect(tagMatches('Debuff.Poison', 'Debu')).toBe(false);
    expect(tagMatches('Debuffs', 'Debuff')).toBe(false);
    expect(tagMatches('Debuff', 'Debuff.Poison')).toBe(false);
  });

  it('count only tags that have sources', () => {
    expect(hasTag({ 'Debuff.Poison': 1 }, 'Debuff')).toBe(true);
    expect(hasTag({ 'Debuff.Poison': 0 }, 'Debuff')).toBe(false);
  });

  it('match lists of tags and tell immunity', () => {
    expect(matchesAny(['Spell.Fire'], ['Debuff', 'Spell'])).toBe(true);
    expect(matchesAny(['Spell.Fire'], ['Debuff'])).toBe(false);
    expect(isBlocked({ 'Immunity.Poison': 2 }, ['Immunity.Poison'])).toBe(true);
    expect(isBlocked({ 'Immunity.Mind': 1 }, ['Immunity.Poison'])).toBe(false);
  });

  it('count the sources of every tag and drop a tag without sources', () => {
    const once = withTagSources({ 'Creature.Human': 1 }, ['Debuff.Poison', 'Creature.Human'], 'add');

    expect(once).toStrictEqual({ 'Creature.Human': 2, 'Debuff.Poison': 1 });
    expect(withTagSources(once, ['Debuff.Poison'], 'remove')).toStrictEqual({ 'Creature.Human': 2 });
    expect(() => withTagSources(once, ['Buff'], 'remove')).toThrow('The tag "Buff" has no source to take back.');
  });
});
