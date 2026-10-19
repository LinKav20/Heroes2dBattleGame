import { scenarioDefinition, type Scenario, type ScenarioTrigger } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { StepContext, StepKind, StepResult, Subjects } from '../extensions/index.ts';
import { VISIBLE_TO_ALL } from '../ids/index.ts';
import type { BattleEvent, BattleState, SideTarget, UnitTarget } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { DONE, operationDrafts, kernelStep } from '../operations/index.ts';
import { scenarioCheckDraft } from './drafts.ts';
import type { HookMoment, ScenarioCheckParams, TriggerFiring } from './params.ts';

/**
 * Checks scenario triggers whose event or moment has come and fires the first one that may fire: of the triggers with
 * a higher priority first, and of equal ones the earlier declared. A trigger fires if it has fired fewer times than
 * its limit and its condition holds; it gives `kernel:trigger-fired`, which the sides that see its event see, and runs
 * its operations with the unit or the side of the event or the moment as `target` and the event in their scope. Then
 * the step goes on with the rest in a step of its own kind, together with the triggers that the events in between
 * bring. Only the kernel puts the step on the stack.
 *
 * @throws {ContentError} If the content has no scenario of the battle, or a condition or an operation of a trigger is
 * described wrongly.
 * @throws {TypeError} If the scenario has no trigger of a firing.
 */
export const SCENARIO_CHECK_STEP: StepKind<ScenarioCheckParams> = kernelStep(
  KERNEL_STEPS.scenarioCheck,
  check,
  (params: ScenarioCheckParams, migrate: (event: BattleEvent) => BattleEvent): ScenarioCheckParams => {
    const firings = params.firings.map((firing) => {
      if (firing.event === undefined) return firing;

      const event = migrate(firing.event);

      return event === firing.event ? firing : { ...firing, event };
    });

    return firings.every((firing, position) => firing === params.firings[position]) ? params : { firings };
  },
);

/**
 * Returns the triggers of the scenario that wait for the kinds of the events and may still fire, one for every
 * trigger and event, in the order of the events. `targetOf` names the unit or the side an event is about.
 */
export function eventFirings(
  scenario: Scenario,
  state: BattleState,
  events: readonly BattleEvent[],
  targetOf: (event: BattleEvent) => SideTarget | UnitTarget | undefined,
): readonly TriggerFiring[] {
  return events.flatMap((event) => {
    const waiting = scenario.triggers.filter(({ on }) => on === event.type).filter((one) => mayFire(state, one));

    if (waiting.length === 0) return [];

    const target = targetOf(event);

    return waiting.map(({ id }) => firingOf(id, target, event));
  });
}

/**
 * Returns the triggers of the scenario that wait for a moment of the battle and may still fire, with the unit or the
 * side the moment is about, if any.
 */
export function momentFirings(
  scenario: Scenario,
  state: BattleState,
  moment: HookMoment,
  target?: SideTarget | UnitTarget,
): readonly TriggerFiring[] {
  return scenario.triggers
    .filter((trigger) => trigger.on === moment && mayFire(state, trigger))
    .map(({ id }) => firingOf(id, target));
}

function check(context: StepContext<ScenarioCheckParams>): StepResult {
  const { content, expressions, params, state } = context;

  if (params.firings.length === 0) return DONE;

  const { triggers } = scenarioDefinition(content, state.scenario);
  const firings = ordered(triggers, params.firings);

  for (const [position, firing] of firings.entries()) {
    const trigger = triggers.find(({ id }) => id === firing.trigger);

    if (trigger === undefined) throw new TypeError(`The scenario has no trigger ${JSON.stringify(firing.trigger)}.`);

    if (!mayFire(state, trigger)) continue;

    const subjects: Subjects = firing.target === undefined ? {} : { target: firing.target };
    const scope = firing.event === undefined ? { subjects } : { event: firing.event, subjects };
    const holds = trigger.condition === undefined ? undefined : expressions.within(scope).test(trigger.condition);

    if (holds !== undefined && holds.kind !== 'value') return holds;

    if (holds?.value === false) continue;

    const payload = { fired: (state.triggers[trigger.id]?.fired ?? 0) + 1, trigger: trigger.id };
    const event = kernelEventDraft(KERNEL_EVENTS.triggerFired, payload, firing.event?.visibleTo ?? VISIBLE_TO_ALL);

    return {
      events: [event],
      kind: 'done',
      steps: [...operationDrafts(trigger.ops, scope), scenarioCheckDraft(firings.slice(position + 1))],
    };
  }

  return DONE;
}

function mayFire(state: BattleState, trigger: ScenarioTrigger): boolean {
  return trigger.limit === undefined || (state.triggers[trigger.id]?.fired ?? 0) < trigger.limit;
}

function ordered(triggers: readonly ScenarioTrigger[], firings: readonly TriggerFiring[]): readonly TriggerFiring[] {
  if (firings.length < 2) return firings;

  const ranks = new Map(triggers.map(({ id, priority }, place) => [id, { place, priority }]));

  return firings.toSorted((left, right) => {
    const first = ranks.get(left.trigger);
    const second = ranks.get(right.trigger);

    return (second?.priority ?? 0) - (first?.priority ?? 0) || (first?.place ?? 0) - (second?.place ?? 0);
  });
}

function firingOf(trigger: string, target?: SideTarget | UnitTarget, event?: BattleEvent): TriggerFiring {
  return { trigger, ...(target === undefined ? {} : { target }), ...(event === undefined ? {} : { event }) };
}
