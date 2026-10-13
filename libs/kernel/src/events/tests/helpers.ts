import type { EventKind, StepKind } from '../../kinds/index.ts';
import type { KernelEvent, KernelEventPayloads, KernelEventType } from '../index.ts';
import type { BattleEvent, BattleState } from '../../model/index.ts';
import { STATE } from '../../model/tests/helpers.ts';

export const FROZEN_STATE: BattleState = deepFreeze(STATE);

export const FROST_EVENT: EventKind<{ readonly unit: string }> = {
  apply: (state, { unit }) => ({
    ...state,
    extensions: { ...state.extensions, 'acme-frost:frozen': [unit] },
  }),
  kind: 'event',
  migrations: [],
  name: 'acme-frost:frozen',
  schema: { properties: { unit: { type: 'string' } }, type: 'object' },
  version: 1,
};

export const RENAMED_EVENT: EventKind<{ readonly target: string }> = {
  apply: (state, { target }) => ({ ...state, extensions: { ...state.extensions, 'acme-frost:target': target } }),
  kind: 'event',
  migrations: [
    { from: 1, migrate: (value) => ({ ...asRecord(value), victim: asRecord(value).unit }) },
    { from: 2, migrate: (value) => ({ target: asRecord(value).victim }) },
  ],
  name: 'acme-frost:targeted',
  schema: { properties: { target: { type: 'string' } }, type: 'object' },
  version: 3,
};

export const STRIKE_STEP: StepKind = {
  kind: 'step',
  migrations: [{ from: 1, migrate: (value) => ({ ...asRecord(value), amount: asRecord(value).damage }) }],
  name: 'acme-frost:strike',
  run: () => ({ events: [], kind: 'done' }),
  version: 2,
};

export function kernelEvent<Type extends KernelEventType>(
  type: Type,
  payload: KernelEventPayloads[Type],
): KernelEvent<Type> {
  return { id: 0, payload, type, version: 1, visibleTo: 'all' };
}

export function event(type: string, payload: unknown, version = 1): BattleEvent {
  return { id: 0, payload, type, version, visibleTo: 'all' };
}

export function deepFreeze<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((member: unknown) => deepFreeze(member));
    Object.freeze(value);
  }

  return value;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};
}
