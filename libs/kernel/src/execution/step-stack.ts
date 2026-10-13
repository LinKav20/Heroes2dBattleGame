import type { StepDraft, StepKind } from '../kinds/index.ts';
import type { Step, StepInput } from '../model/index.ts';
import type { Registry } from '../names/index.ts';

/**
 * The stack of steps of a command; the last step runs next.
 */
export class StepStack {
  private readonly steps: Step[];

  constructor(private readonly kinds: Registry<StepKind>, saved: readonly Step[]) {
    this.steps = [...saved];
  }

  /** How many steps wait on the stack. */
  get depth(): number {
    return this.steps.length;
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
   * Puts new steps on top so that they run in the order of the list, each with the given cause.
   *
   * @throws {TypeError} If the kernel has no kind of one of the steps.
   */
  pushDrafts(drafts: readonly StepDraft[], cause: number | undefined): void {
    this.steps.push(...drafts.map((draft) => this.stepOf(draft, cause)).toReversed());
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
    return this.steps.map(withoutCause);
  }

  private stepOf(draft: StepDraft, cause: number | undefined): Step {
    const kind = this.kinds.get(draft.type);

    if (kind === undefined) throw new TypeError(`The kernel has no kind of step ${JSON.stringify(draft.type)}.`);

    const step: Step = { params: draft.params, type: draft.type, version: kind.version };

    return cause === undefined ? step : { ...step, cause };
  }
}

/**
 * Returns the step with one more received value.
 */
export function withInput(step: Step, input: StepInput): Step {
  return { ...step, inputs: [...(step.inputs ?? []), input] };
}

function withoutCause(step: Step): Step {
  const { cause: dropped, ...rest } = step;

  return dropped === undefined ? step : rest;
}
