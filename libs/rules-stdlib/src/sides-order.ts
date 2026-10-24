import {
  fieldUnitsOf,
  KERNEL_MECHANICS,
  turnRecordsOf,
  type MechanicContext,
  type TurnOrderVariant,
} from '@heroes2dgame/kernel';
import { RULES_STDLIB_NAMES } from './names.ts';

/**
 * The order of turns by sides: the sides take turns in the order of the scenario, once a round, and a side without
 * units on the field gets no turn.
 */
export const SIDES_ORDER: TurnOrderVariant = Object.freeze({
  kind: 'mechanic',
  mechanic: KERNEL_MECHANICS.turnOrder,
  name: RULES_STDLIB_NAMES.sides,
  next: ({ state }: MechanicContext) => {
    const side = state.sides.find(({ id }) => turnRecordsOf(state, { kind: 'side', side: id }).length === 0
      && fieldUnitsOf(state, id).length > 0);

    return { kind: 'value', value: side === undefined ? undefined : { kind: 'side', side: side.id } };
  },
  schema: { additionalProperties: false, type: 'object' },
  turnOwner: 'side',
} satisfies TurnOrderVariant);
