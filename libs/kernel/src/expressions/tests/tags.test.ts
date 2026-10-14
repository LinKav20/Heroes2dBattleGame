import { describe, expect, it } from 'vitest';
import { hasTag, isBlocked, matchesAny, tagMatches } from '../index.ts';

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

  it('match lists of tags', () => {
    expect(matchesAny(['Spell.Fire'], ['Debuff', 'Spell'])).toBe(true);
    expect(matchesAny(['Spell.Fire'], ['Debuff'])).toBe(false);
  });

  it('tell immunity along the hierarchy in both directions, counting only tags with sources', () => {
    expect(isBlocked({ 'Immunity.Poison': 2 }, ['Immunity.Poison'])).toBe(true);
    expect(isBlocked({ 'Immunity.Mind': 1 }, ['Immunity.Poison'])).toBe(false);
    expect(isBlocked({ 'Immunity.Mind': 1 }, ['Immunity.Mind.Fear'])).toBe(true);
    expect(isBlocked({ 'Immunity.Mind.Fear': 1 }, ['Immunity.Mind'])).toBe(true);
    expect(isBlocked({ 'Immunity.Mind': 0 }, ['Immunity.Mind.Fear'])).toBe(false);
    expect(isBlocked({ Immunity: 1 }, ['Immunities'])).toBe(false);
  });
});
