import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import { allHolders, appliedSubjects, effectDefinition } from './holders.ts';
import { KERNEL_STEPS } from './names.ts';

/**
 * Brings the marks of activity of applied effects up to date at the end of a command: an effect is active while its
 * condition of activity holds, or always if it has none.
 *
 * @throws {TypeError} If a condition of activity needs a value, such as a dice roll.
 */
export const REFRESH_STEP: StepKind = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.effectRefresh,
  run: refresh,
  version: 1,
});

function refresh({ content, expressions, state }: StepContext): StepResult {
  const events: EventDraft[] = [];

  for (const { effects, holder } of allHolders(state)) {
    for (const applied of effects) {
      const { activeWhile, name } = effectDefinition(content, applied.effect);
      const active = activeWhile === undefined
        ? { kind: 'value', value: true } as const
        : expressions.test(activeWhile, appliedSubjects(holder, applied));

      if (active.kind === 'need') {
        throw new TypeError(`The condition of activity of ${JSON.stringify(name)} needs a value.`);
      }

      if (active.kind === 'reject') return active;

      if (active.value !== applied.active) {
        const effect = { ...applied, active: active.value };

        events.push(kernelEventDraft(KERNEL_EVENTS.effectChanged, { effect, holder }, applied.visibleTo));
      }
    }
  }

  return { events, kind: 'done' };
}
