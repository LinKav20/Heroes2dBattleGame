import { describe, expect, it } from 'vitest';
import { ContentError } from '../../content/index.ts';
import { createKernel } from '../../kernel/index.ts';
import { KERNEL_OPERATIONS, KERNEL_STEPS } from '../../names/index.ts';
import { operationDrafts } from '../../operations/index.ts';
import {
  ARCHERS,
  contentWith,
  markOp,
  PIKEMEN,
  run,
  BARE_STATE,
} from '../../tests/battle.ts';
import { effect, node, unitOf } from '../../tests/fixtures.ts';
import { KERNEL_OPERATION_KINDS } from '../index.ts';

describe('the operations and the steps of the kernel', () => {
  it('are registered by the kernel itself with the names of the constants and a schema each', () => {
    const { operations, steps } = createKernel({ extensions: [] }).registries;

    expect(operations.extensions.map(({ name }) => name).sort()).toStrictEqual(Object.values(KERNEL_OPERATIONS).sort());
    expect(steps.extensions.map(({ name }) => name).sort()).toStrictEqual(Object.values(KERNEL_STEPS).sort());

    expect(KERNEL_OPERATION_KINDS.every(({ name, schema }) =>
      schema.type === 'object' && JSON.stringify(schema).includes(`"const":"${name}"`))).toBe(true);
  });
});

describe('operations of the kernel', () => {
  const content = contentWith(
    effect('acme:burn', { tags: ['Debuff.Fire'] }),
    effect('acme:chill', { tags: ['Debuff.Cold'] }),
    effect('acme:banner', { duration: { kind: 'battle' } }),
  );
  const subjects = { self: ARCHERS, target: PIKEMEN };

  it('apply an effect to a participant with the self as its source and remove effects by tags', () => {
    const burned = run(BARE_STATE, content, ...operationDrafts([
      node('kernel:apply-effect', { effect: 'acme:burn', params: { power: 2 }, to: 'target' }),
      node('kernel:apply-effect', { effect: 'acme:chill', to: 'target' }),
    ], { subjects }));
    const cooled = run(burned.state, content, ...operationDrafts([
      node('kernel:remove-effects', { from: 'target', tags: ['Debuff.Fire'] }),
    ], { subjects }));

    expect(unitOf(burned.state, 'pikemen-1').effects.map(({ params, sourceUnit }) => [params, sourceUnit]))
      .toStrictEqual([[{ power: 2 }, 'archers-1'], [{}, 'archers-1']]);

    expect(unitOf(cooled.state, 'pikemen-1').effects.map(({ effect: name }) => name)).toStrictEqual(['acme:chill']);
  });

  it('apply an effect to the side of a participant', () => {
    const result = run(BARE_STATE, content, ...operationDrafts([
      node('kernel:apply-effect', { effect: 'acme:banner', side: true, to: 'target' }),
    ], { subjects }));

    expect(result.state.sides.map(({ effects }) => effects.map(({ effect: name }) => name)))
      .toStrictEqual([[], ['acme:banner']]);
  });

  it('set a variable to a value, a formula or a condition', () => {
    const result = run(BARE_STATE, content, ...operationDrafts([
      markOp('flag', 'on'),
      markOp('sum', node('kernel:add', { values: [2, 3] })),
      node('kernel:set-variable', { condition: node('kernel:same', { left: 'self', right: 'self' }), variable: 'it' }),
    ], { subjects }));

    expect(result.state.variables).toMatchObject({ flag: 'on', it: true, sum: 5 });
  });

  it('treat an unknown operation and a wrong node as errors of the content', () => {
    function attempt(op: ReturnType<typeof node>): unknown {
      return run(BARE_STATE, content, ...operationDrafts([op], { subjects }));
    }

    expect(() => attempt(node('acme:dance'))).toThrow('The kernel has no operation "acme:dance".');
    expect(() => attempt(node('acme:dance'))).toThrow(ContentError);

    expect(() => attempt(node('kernel:apply-effect', { effect: 'acme:burn', to: 'source' })))
      .toThrow('needs field or a unit or a side');

    expect(() => attempt(node('kernel:set-variable', { variable: 'none' }))).toThrow(ContentError);

    expect(() => attempt(node('kernel:set-variable', { condition: true, value: 1, variable: 'both' })))
      .toThrow('needs either "value" or "condition"');
  });
});
