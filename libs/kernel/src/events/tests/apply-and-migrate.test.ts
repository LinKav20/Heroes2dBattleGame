import { describe, expect, it } from 'vitest';
import { createKernel } from '../../kernel/index.ts';
import type { EventKind } from '../../kinds/index.ts';
import { event, FROST_EVENT, FROZEN_STATE, kernelEvent, RENAMED_EVENT, STRIKE_STEP } from './helpers.ts';

describe('apply', () => {
  it('applies an event of an extension to the data of its package', () => {
    const next = KERNEL.apply(FROZEN_STATE, event('acme-frost:frozen', { unit: 'pikemen-1' }));

    expect(next.extensions).toStrictEqual({ ...FROZEN_STATE.extensions, 'acme-frost:frozen': ['pikemen-1'] });
    expect(next.units).toBe(FROZEN_STATE.units);
  });

  it('rejects an event of an extension that changes units or data of another package', () => {
    const kernel = createKernel({ extensions: [THIEF] });

    expect(() => kernel.apply(FROZEN_STATE, event('acme-thief:steal', {}))).toThrow(
      'The event "acme-thief:steal" changed nextId, units, extensions["rules-stdlib:siege"], but an event of an '
      + 'extension may change only the data of its package.',
    );
  });

  it('rejects an unknown kind and an event that is not migrated', () => {
    expect(() => KERNEL.apply(FROZEN_STATE, event('acme-frost:thawed', {}))).toThrow(
      'The kernel has no kind of event "acme-frost:thawed".',
    );

    expect(() => KERNEL.apply(FROZEN_STATE, event('acme-frost:targeted', { unit: 'pikemen-1' }, 1))).toThrow(
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

  it('returns a current event as it is', () => {
    const current = event('acme-frost:frozen', { unit: 'pikemen-1' });

    expect(KERNEL.migrateEvent(current)).toStrictEqual({ event: current, ok: true });
  });

  it('tells why an event cannot be read', () => {
    expect(KERNEL.migrateEvent(event('acme-frost:thawed', {}, 2))).toStrictEqual({
      name: 'acme-frost:thawed',
      ok: false,
      reason: 'unknown-event',
      version: 2,
    });

    expect(KERNEL.migrateEvent(event('acme-frost:frozen', {}, 2))).toStrictEqual({
      name: 'acme-frost:frozen',
      ok: false,
      reason: 'newer-version',
      version: 2,
    });
  });

  it('migrates the steps saved in kernel:steps-saved', () => {
    const saved = kernelEvent('kernel:steps-saved', {
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

  it('tells why saved steps cannot be read', () => {
    const unknown = kernelEvent('kernel:steps-saved', { steps: [{ params: {}, type: 'acme-frost:melt', version: 1 }] });
    const newer = kernelEvent('kernel:steps-saved', { steps: [{ params: {}, type: 'acme-frost:strike', version: 3 }] });

    expect(KERNEL.migrateEvent(unknown)).toStrictEqual({
      name: 'acme-frost:melt',
      ok: false,
      reason: 'unknown-step',
      version: 1,
    });

    expect(KERNEL.migrateEvent(newer)).toStrictEqual({
      name: 'acme-frost:strike',
      ok: false,
      reason: 'newer-version',
      version: 3,
    });
  });

  it('rejects a step migration that returns no object', () => {
    const broken = createKernel({
      extensions: [{ ...STRIKE_STEP, migrations: [{ from: 1, migrate: () => [] }], name: 'acme-frost:broken' }],
    });
    const saved = kernelEvent('kernel:steps-saved', { steps: [{ params: {}, type: 'acme-frost:broken', version: 1 }] });

    expect(() => broken.migrateEvent(saved)).toThrow('returned no object of parameters');
  });
});

const KERNEL = createKernel({ extensions: [FROST_EVENT, RENAMED_EVENT, STRIKE_STEP] });

const THIEF: EventKind = {
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
