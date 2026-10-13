import type { StepDraft, StepKind } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { Step, StepInput } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { withoutKey } from '../shared/index.ts';
import { MAX_STACK_DEPTH } from './limits.ts';

/**
 * The stack of steps of a command, at most {@link MAX_STACK_DEPTH} deep; the last step runs next.
 */
export class StepStack {
  private readonly kinds: Registry<StepKind>;

  private readonly steps: Step[];

  constructor(kinds: Registry<StepKind>, saved: readonly Step[]) {
    this.kinds = kinds;
    this.steps = [...saved];
  }

  /**
   * Takes the step that runs next, if any.
   */
  pop(): Step | undefined {
    return this.steps.pop();
  }

  /**
   * Puts a step back on top, for example the step that waits for a value.
   */
  push(step: Step): void {
    this.steps.push(step);
  }

  /**
   * Puts new steps on top so that they run in the order of the list, each with the given cause. Puts nothing and
   * returns `false` if the stack would grow deeper than {@link MAX_STACK_DEPTH}.
   *
   * @throws {TypeError} If the kernel has no kind of one of the steps.
   */
  pushDrafts(drafts: readonly StepDraft[], cause: number | undefined): boolean {
    if (this.steps.length + drafts.length > MAX_STACK_DEPTH) return false;

    for (const draft of drafts.toReversed()) {
      this.steps.push(this.stepOf(draft, cause));
    }

    return true;
  }

  /**
   * Gives the step on top the value it asked for.
   *
   * @throws {TypeError} If the stack is empty.
   */
  answerTop(input: StepInput): void {
    const top = this.steps.pop();

    if (top === undefined) throw new TypeError('An input request is open, but no step waits for it.');

    this.steps.push(withInput(top, input));
  }

  /**
   * Returns the steps to save while the kernel waits for a value: the causes are dropped, because the answer starts a
   * new batch.
   */
  saved(): readonly Step[] {
    return this.steps.map((step) => withoutKey(step, 'cause'));
  }

  private stepOf(draft: StepDraft, cause: number | undefined): Step {
    const kind = this.kinds.get(draft.type);

    if (kind === undefined) throw new TypeError(`The kernel has no kind of step ${JSON.stringify(draft.type)}.`);

    const step: Step = { params: draft.params as JsonObject, type: draft.type, version: kind.version };

    return cause === undefined ? step : { ...step, cause };
  }
}

/**
 * Returns the step with one more received value.
 */
export function withInput(step: Step, input: StepInput): Step {
  return { ...step, inputs: [...(step.inputs ?? []), input] };
}
