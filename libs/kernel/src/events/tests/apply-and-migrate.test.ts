import { describe, expect, it } from 'vitest';
import type { ExtensionEventKind } from '../../extensions/index.ts';
import { createKernel } from '../../kernel/index.ts';
import { event, FROST_EVENT, FROZEN_STATE, RENAMED_EVENT, STRIKE_STEP } from '../../tests/fixtures.ts';
import { KERNEL_EVENTS, MIGRATION_FAILURES } from '../index.ts';

describe('applyEvent', () => {
  it('applies an event of an extension to the data of its package', () => {
    const next = KERNEL.applyEvent(FROZEN_STATE, event('acme-frost:frozen', { unit: 'pikemen-1' }));

    expect(next.extensions).toStrictEqual({ ...FROZEN_STATE.extensions, 'acme-frost:frozen': ['pikemen-1'] });
    expect(next.units).toBe(FROZEN_STATE.units);
  });

  it('rejects an event of an extension that changes units or data of another package', () => {
    const kernel = createKernel({ extensions: [THIEF] });

    expect(() => kernel.applyEvent(FROZEN_STATE, event('acme-thief:steal', {}))).toThrow(
      'The event "acme-thief:steal" changed nextId, units, extensions["rules-stdlib:siege"], but an event of an '
      + 'extension may change only the data of its package.',
    );
  });

  it('rejects an event of an extension that removes data of another package or replaces other parts', () => {
    const remover: ExtensionEventKind = {
      ...THIEF,
      apply: (state) => ({ ...state, extensions: {} }),
      name: 'acme-thief:remove',
    };
    const adder: ExtensionEventKind = {
      ...THIEF,
      apply: (state) => ({ ...state, variables: {} }),
      name: 'acme-thief:add',
    };
    const kernel = createKernel({ extensions: [remover, adder] });

    expect(() => kernel.applyEvent(FROZEN_STATE, event('acme-thief:remove', {})))
      .toThrow('changed extensions["rules-stdlib:siege"]');

    expect(() => kernel.applyEvent(FROZEN_STATE, event('acme-thief:add', {}))).toThrow('changed variables');
  });

  it('rejects an unknown kind and an event that is not migrated', () => {
    expect(() => KERNEL.applyEvent(FROZEN_STATE, event('acme-frost:thawed', {}))).toThrow(
      'The kernel has no kind of event "acme-frost:thawed".',
    );

    expect(() => KERNEL.applyEvent(FROZEN_STATE, event('acme-frost:targeted', { unit: 'pikemen-1' }, 1))).toThrow(
      'has version 1, but the code reads version 3; migrate the event first.',
    );
  });
});

describe('migrateEvent', () => {
  it('moves an event one version at a time to the current one', () => {
    const old = event('acme-frost:targeted', { unit: 'pikemen-1' }, 1);
    const result = KERNEL.migrateEvent(old);

    expect(result).toStrictEqual({ event: { ...old, payload: { target: 'pikemen-1' }, version: 3 }, ok: true });
    expect(old.payload).toStrictEqual({ unit: 'pikemen-1' });
  });

  it('starts from the version of the event', () => {
    const result = KERNEL.migrateEvent(event('acme-frost:targeted', { victim: 'pikemen-1' }, 2));

    expect(result).toMatchObject({ event: { payload: { target: 'pikemen-1' }, version: 3 }, ok: true });
  });

  it('returns a current event as it is, saved steps included', () => {
    const current = event('acme-frost:frozen', { unit: 'pikemen-1' });
    const saved = event(KERNEL_EVENTS.stepsSaved, { steps: [{ params: {}, type: 'acme-frost:strike', version: 2 }] });

    expect(KERNEL.migrateEvent(current)).toStrictEqual({ event: current, ok: true });
    expect(KERNEL.migrateEvent(saved)).toStrictEqual({ event: saved, ok: true });

    const result = KERNEL.migrateEvent(saved);

    expect(result.ok && result.event).toBe(saved);
  });

  it.each([
    { name: 'acme-frost:thawed', reason: MIGRATION_FAILURES.unknownEvent, version: 2 },
    { name: 'acme-frost:frozen', reason: MIGRATION_FAILURES.newerVersion, version: 2 },
    { name: 'acme-frost:targeted', reason: MIGRATION_FAILURES.invalidVersion, version: 0 },
    { name: 'acme-frost:targeted', reason: MIGRATION_FAILURES.invalidVersion, version: -1 },
    { name: 'acme-frost:targeted', reason: MIGRATION_FAILURES.invalidVersion, version: 1.5 },
  ])('tells that $name of version $version cannot be read: $reason', ({ name, reason, version }) => {
    expect(KERNEL.migrateEvent(event(name, {}, version))).toStrictEqual({ name, ok: false, reason, version });
  });

  it('migrates the steps saved in kernel:steps-saved', () => {
    const saved = event(KERNEL_EVENTS.stepsSaved, {
      steps: [
        { params: { damage: 5 }, type: 'acme-frost:strike', version: 1 },
        { params: { amount: 2 }, type: 'acme-frost:strike', version: 2 },
      ],
    });
    const result = KERNEL.migrateEvent(saved);

    expect(result).toStrictEqual({
      event: {
        ...saved,
        payload: {
          steps: [
            { params: { amount: 5, damage: 5 }, type: 'acme-frost:strike', version: 2 },
            { params: { amount: 2 }, type: 'acme-frost:strike', version: 2 },
          ],
        },
      },
      ok: true,
    });
  });

  it.each([
    { reason: MIGRATION_FAILURES.unknownStep, type: 'acme-frost:melt', version: 1 },
    { reason: MIGRATION_FAILURES.newerVersion, type: 'acme-frost:strike', version: 3 },
    { reason: MIGRATION_FAILURES.invalidVersion, type: 'acme-frost:strike', version: 0 },
  ])('tells that a saved step $type of version $version cannot be read', ({ reason, type, version }) => {
    const saved = event(KERNEL_EVENTS.stepsSaved, { steps: [{ params: {}, type, version }] });

    expect(KERNEL.migrateEvent(saved)).toStrictEqual({ name: type, ok: false, reason, version });
  });

  it('rejects a step migration that returns no object', () => {
    const broken = createKernel({
      extensions: [{ ...STRIKE_STEP, migrations: [{ from: 1, migrate: () => [] }], name: 'acme-frost:broken' }],
    });
    const saved = event(KERNEL_EVENTS.stepsSaved, { steps: [{ params: {}, type: 'acme-frost:broken', version: 1 }] });

    expect(() => broken.migrateEvent(saved)).toThrow('returned no object of parameters');
  });
});

const KERNEL = createKernel({ extensions: [FROST_EVENT, RENAMED_EVENT, STRIKE_STEP] });

const THIEF: ExtensionEventKind = {
  apply: (state) => ({
    ...state,
    extensions: { ...state.extensions, 'rules-stdlib:siege': [] },
    nextId: state.nextId + 1,
    units: [],
  }),
  kind: 'event',
  migrations: [],
  name: 'acme-thief:steal',
  schema: {},
  version: 1,
};
