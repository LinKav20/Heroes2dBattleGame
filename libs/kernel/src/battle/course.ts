import { scenarioDefinition, type ContentRegistry } from '../content/index.ts';
import { eventTarget } from '../events/index.ts';
import type { EventKind, StepDraft } from '../extensions/index.ts';
import type { JsonObject, JsonValue } from '../json/index.ts';
import type { BattleEvent, BattleState, Step } from '../model/index.ts';
import { KERNEL_STEPS, type Registry } from '../names/index.ts';
import { withoutKey } from '../shared/index.ts';
import { outcomeCheckDraft, scenarioCheckDraft, turnCheckDraft } from './drafts.ts';
import type { ActionEndParams, TriggerFiring, TurnCheckParams } from './params.ts';
import { eventFirings } from './scenario-triggers.ts';

/**
 * The part of the stack of steps that the course of the battle needs.
 */
export interface CourseStack {
  /** Changes the parameters of the step of a kind that is nearest to the top, and tells whether there is one. */
  changeNearest(type: string, change: (params: JsonObject) => JsonObject): boolean;
  /**
   * Puts steps right above the step of the course of the battle that is nearest to the top, or at the bottom if there
   * is none, and tells whether they fit with room for `reserve` more steps.
   */
  insertAboveFlow(drafts: readonly StepDraft[], reserve?: number): boolean;
}

/**
 * What the runner of steps asks about the course of the battle while a command runs: whether effects react, which
 * scenario triggers wait for a check, what to check when the stack is empty, and where the end of a turn goes.
 *
 * Effects react to events and scenario triggers wait for them only after the battle has started. After every step the
 * triggers of its events join the check of scenario triggers nearest to the top of the stack; if there is none yet,
 * they wait for the next check that runs, for the end of the command, or for a stop on an input request, when they go
 * into a check right above the next step of the course of the battle.
 */
export class BattleCourse {
  private readonly content: ContentRegistry;

  private readonly events: Registry<EventKind>;

  private readonly loose: TriggerFiring[] = [];

  constructor(content: ContentRegistry, events: Registry<EventKind>) {
    this.content = content;
    this.events = events;
  }

  /**
   * Tells whether effects react to events in the state: not before the battle starts.
   */
  reacts(state: BattleState): boolean {
    return state.phase.kind !== 'deployment';
  }

  /**
   * Returns the steps a step adds as they go on the stack. A step outside the course of the battle that ends the turn
   * with `kernel:turn-check` does not end it at once: the end of the action below it ends the turn after the rest of
   * the command.
   */
  placed(drafts: readonly StepDraft[], flow: boolean, stack: CourseStack): readonly StepDraft[] {
    if (flow) return drafts;

    return drafts.filter((draft) => !(endsTurn(draft) && stack.changeNearest(KERNEL_STEPS.actionEnd, endedAction)));
  }

  /**
   * Collects the triggers of the events a step gave in the state `before` it, which give the state `after` it.
   */
  afterStep(before: BattleState, after: BattleState, events: readonly BattleEvent[], stack: CourseStack): void {
    if (events.length === 0 || !this.reacts(before)) return;

    const scenario = scenarioDefinition(this.content, after.scenario);
    const firings = eventFirings(scenario, after, events, (event) => eventTarget(this.events, event));

    if (firings.length === 0) return;

    if (!stack.changeNearest(KERNEL_STEPS.scenarioCheck, (params) => withFirings(params, firings, false))) {
      this.loose.push(...firings);
    }
  }

  /**
   * Returns the step to run with the waiting triggers first, if it is a check of scenario triggers.
   */
  beforeRun(step: Step): Step {
    if (step.type !== KERNEL_STEPS.scenarioCheck || this.loose.length === 0) return step;

    return { ...step, params: withFirings(step.params, this.loose.splice(0), true) };
  }

  /**
   * Returns the steps to run when the stack is empty: a check of the waiting triggers and the outcomes, or, if the
   * last reactions of the command changed more than the marks of activity of effects, a check of the outcomes and of
   * the end of the turn; or none.
   */
  whenEmpty(state: BattleState, changed: boolean): readonly StepDraft[] {
    if (this.loose.length > 0) return [scenarioCheckDraft(this.loose.splice(0)), outcomeCheckDraft()];

    return changed && this.reacts(state) ? [outcomeCheckDraft(), turnCheckDraft()] : [];
  }

  /**
   * Puts the waiting triggers into a check above the next step of the course of the battle before the command stops
   * on an input request, and tells whether it fits into the stack together with the step that waits for the answer,
   * which goes back on top.
   */
  beforePause(stack: CourseStack): boolean {
    if (this.loose.length === 0) return true;

    return stack.insertAboveFlow([scenarioCheckDraft(this.loose.splice(0)), outcomeCheckDraft()], 1);
  }
}

/**
 * Prepares the steps of the course of the battle that go on after the rest of a command was aborted: a wait that was
 * aborted does not put the turn off.
 */
export function afterAbort(stack: CourseStack): void {
  stack.changeNearest(KERNEL_STEPS.actionEnd, (params) =>
    (params.end === 'waited' ? withoutKey(params, 'end') : params));
}

/**
 * Tells whether a step ends the turn in any case: `kernel:turn-check` with `end`.
 */
export function endsTurn(draft: StepDraft): boolean {
  return draft.type === KERNEL_STEPS.turnCheck && (draft.params as TurnCheckParams).end === true;
}

function endedAction(params: JsonObject): JsonObject {
  const end: ActionEndParams['end'] = params.end === 'waited' ? 'waited' : 'ended';

  return { ...params, end };
}

function withFirings(params: JsonObject, firings: readonly TriggerFiring[], first: boolean): JsonObject {
  const known: unknown = params.firings;
  const own: readonly unknown[] = Array.isArray(known) ? known : [];
  const all = first ? [...firings, ...own] : [...own, ...firings];

  return { firings: all as JsonValue[] };
}
