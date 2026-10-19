import type { StepDraft, StepKind } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { Step, StepInput } from '../model/index.ts';
import { isFlowStep, type Registry } from '../names/index.ts';
import { withoutKey } from '../shared/index.ts';
import { MAX_STACK_DEPTH } from './limits.ts';

/**
 * How new steps go on the stack: the event that caused them, if any, and whether they belong to the course of the
 * battle.
 */
export interface Placing {
  /** The number of the event in the batch that caused the steps. */
  readonly cause?: number | undefined;
  /** Whether the steps belong to the course of the battle. */
  readonly flow?: boolean;
}

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
   * Puts new steps on top so that they run in the order of the list, each with the cause of `placing`. A step belongs
   * to the course of the battle if its kind does or `placing.flow` says so. Puts nothing and returns `false` if the
   * stack would grow deeper than {@link MAX_STACK_DEPTH}.
   *
   * @throws {TypeError} If the kernel has no kind of one of the steps.
   */
  pushDrafts(drafts: readonly StepDraft[], placing: Placing = {}): boolean {
    if (this.steps.length + drafts.length > MAX_STACK_DEPTH) return false;

    for (const draft of drafts.toReversed()) {
      this.steps.push(this.stepOf(draft, placing.cause, placing.flow === true));
    }

    return true;
  }

  /**
   * Puts new steps of the course of the battle right above the step of the course of the battle nearest to the top, or
   * at the bottom if there is none, so they run in the order of the list before it. Puts nothing and returns `false` if
   * the stack would grow deeper than {@link MAX_STACK_DEPTH}.
   *
   * @throws {TypeError} If the kernel has no kind of one of the steps.
   */
  insertAboveFlow(drafts: readonly StepDraft[]): boolean {
    if (this.steps.length + drafts.length > MAX_STACK_DEPTH) return false;

    const index = this.steps.findLastIndex((step) => step.flow === true) + 1;

    this.steps.splice(index, 0, ...drafts.toReversed().map((draft) => this.stepOf(draft, undefined, true)));

    return true;
  }

  /**
   * Leaves only the steps of the course of the battle, for example after the rest of a command was aborted.
   */
  keepFlow(): void {
    const kept = this.steps.filter((step) => step.flow === true);

    this.steps.splice(0, this.steps.length, ...kept);
  }

  /**
   * Changes the parameters of the step of a kind that is nearest to the top, and tells whether there is such a step.
   */
  changeNearest(type: string, change: (params: JsonObject) => JsonObject): boolean {
    const index = this.steps.findLastIndex((step) => step.type === type);
    const step = this.steps[index];

    if (step === undefined) return false;

    this.steps[index] = { ...step, params: change(step.params) };

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

  private stepOf(draft: StepDraft, cause: number | undefined, flow: boolean): Step {
    const kind = this.kinds.get(draft.type);

    if (kind === undefined) throw new TypeError(`The kernel has no kind of step ${JSON.stringify(draft.type)}.`);

    const step: Step = {
      params: draft.params as JsonObject,
      type: draft.type,
      version: kind.version,
      ...(cause === undefined ? {} : { cause }),
      ...(flow || isFlowStep(draft.type) ? { flow: true } : {}),
    };

    return step;
  }
}

/**
 * Returns the step with one more received value.
 */
export function withInput(step: Step, input: StepInput): Step {
  return { ...step, inputs: [...(step.inputs ?? []), input] };
}
