import { creatureDefinition } from '../../content/index.ts';
import type { Evaluation } from '../../extensions/index.ts';
import type { Tag, UnitId } from '../../ids/index.ts';
import { battleUnit } from '../../model/index.ts';
import { evaluated } from '../results.ts';
import type { AttributeInput } from './attribute-value.ts';

/**
 * Returns the tags of a unit with the number of their sources: the tags in the state, which operations give, the tags
 * of its creature and the tags given by every effect that acts on the unit while its condition of activity holds.
 *
 * @throws {TypeError} If the unit is not in the battle.
 * @throws {ContentError} If the content has no definition the unit refers to, or a condition of activity rolls dice.
 */
export function unitTags(input: AttributeInput, unitId: UnitId): Evaluation<Readonly<Record<Tag, number>>> {
  const unit = battleUnit(input.state, unitId);
  const tags = new Map(Object.entries(unit.tags));
  const given: Tag[] = [...creatureDefinition(input.content, unit.creature).tags];

  for (const source of input.sources({ kind: 'unit', unit: unitId })) {
    if (source.effect.grantsTags.length === 0) continue;

    const active = input.active(source);

    if (active.kind !== 'value') return active;

    if (active.value) given.push(...source.effect.grantsTags);
  }

  for (const tag of given) {
    tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }

  return evaluated(Object.fromEntries(tags));
}
