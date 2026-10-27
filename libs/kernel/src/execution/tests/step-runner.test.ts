import { describe, expect, it } from 'vitest';
import { ReactionIndex, refreshDraft } from '../../effects/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../../events/index.ts';
import { AttributeCache } from '../../expressions/index.ts';
import type { StepKind } from '../../extensions/index.ts';
import { FieldCache } from '../../geometry/index.ts';
import { BARE_STATE, emit, KERNEL } from '../../tests/battle.ts';
import { accepted, CONTENT } from '../../tests/fixtures.ts';
import { runDrafts } from '../../tests/run-drafts.ts';
import type { ExecutionRegistries } from '../context.ts';

describe('the runner of steps', () => {
  it('brings the marks of activity up to date once more only if events came after the last step that did it', () => {
    const flags = kernelEventDraft(KERNEL_EVENTS.flagsChanged, { flags: [], unit: 'archers-1' }, 'all');

    expect(refreshes([emit([flags]), refreshDraft()])).toBe(1);
    expect(refreshes([refreshDraft(), emit([flags])])).toBe(2);
    expect(refreshes([emit([flags])])).toBe(1);
  });
});

function refreshes(drafts: Parameters<typeof runDrafts>[3]): number {
  const runs: string[] = [];
  const caches = { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };

  accepted(runDrafts(counting(KERNEL.registries, runs), caches, BARE_STATE, drafts, CONTENT));

  return runs.filter((type) => type === 'kernel:effect-refresh').length;
}

function counting(registries: ExecutionRegistries, runs: string[]): ExecutionRegistries {
  const { steps } = registries;

  return { ...registries, steps: { ...steps, get: (name) => counted(steps.get(name), runs) } };
}

function counted(kind: StepKind | undefined, runs: string[]): StepKind | undefined {
  if (kind === undefined) return undefined;

  return {
    ...kind,
    run: (context) => {
      runs.push(kind.name);

      return kind.run(context);
    },
  };
}
