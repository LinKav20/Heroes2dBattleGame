import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ContentRegistry } from '../../content/index.ts';
import type { KernelEvent } from '../../events/index.ts';
import { canonicalJson, hashJson, type JsonValue } from '../../json/index.ts';
import type {
  BattleEvent,
  BattleState,
  Command,
  InputRequest,
  Rejection,
  Step,
} from '../index.ts';
import { COMMAND_KINDS, commandKind, COMMANDS, CONTENT, type IsJson, STATE } from './helpers.ts';

describe('the model types', () => {
  it('are plain JSON without functions, undefined values or class instances', () => {
    expectTypeOf<IsJson<BattleState>>().toEqualTypeOf<true>();
    expectTypeOf<IsJson<Command>>().toEqualTypeOf<true>();
    expectTypeOf<IsJson<BattleEvent<JsonValue>>>().toEqualTypeOf<true>();
    expectTypeOf<IsJson<KernelEvent>>().toEqualTypeOf<true>();
    expectTypeOf<IsJson<InputRequest>>().toEqualTypeOf<true>();
    expectTypeOf<IsJson<Rejection>>().toEqualTypeOf<true>();
    expectTypeOf<IsJson<Step>>().toEqualTypeOf<true>();
    expectTypeOf<IsJson<ContentRegistry>>().toEqualTypeOf<true>();
  });

  it('tell apart types that are not plain JSON', () => {
    expectTypeOf<IsJson<{ readonly when: Date }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly run: () => void }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly value: null }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly value: bigint }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly value: number | undefined }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly value?: number | undefined }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly value: ReturnType<typeof JSON.parse> }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly value: unknown }>>().toEqualTypeOf<false>();
    expectTypeOf<IsJson<{ readonly value: object }>>().toEqualTypeOf<false>();

    expectTypeOf<IsJson<{ readonly nested: ReadonlyArray<{ readonly ids: ReadonlySet<string> }> }>>()
      .toEqualTypeOf<false>();
  });

  it('accept a full battle state that canonical JSON writes', () => {
    expect(JSON.parse(canonicalJson(STATE))).toStrictEqual(STATE);
    expect(hashJson(STATE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accept a content registry that canonical JSON writes', () => {
    expect(JSON.parse(canonicalJson(CONTENT))).toStrictEqual(CONTENT);
  });

  it('accept every kind of command', () => {
    expect(new Set(COMMANDS.map(commandKind))).toStrictEqual(new Set(Object.keys(COMMAND_KINDS)));
    expect(COMMANDS.map((command): unknown => JSON.parse(canonicalJson(command)))).toStrictEqual(COMMANDS);
  });
});
