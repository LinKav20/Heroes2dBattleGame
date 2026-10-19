import { scenarioDefinition } from '../content/index.ts';
import { areaRefreshDraft } from '../effects/index.ts';
import type { MechanicExtension, StepContext, StepDraft } from '../extensions/index.ts';
import type { Registry } from '../names/index.ts';
import { outcomeCheckDraft, scenarioCheckDraft, turnOrderHookDraft } from './drafts.ts';
import { turnOrderOf } from './mechanics.ts';
import type { TurnOrderHookParams } from './params.ts';
import { momentFirings } from './scenario-triggers.ts';
import { hasHook } from './turn-order.ts';

/**
 * Returns the steps that close a game action: auras and zones, the scenario triggers its events bring, and outcomes.
 * A scenario without triggers or without outcomes gets no step to check them.
 */
export function closingSteps(context: Pick<StepContext, 'content' | 'state'>): readonly StepDraft[] {
  return checks(context, []);
}

/**
 * Returns the steps that close a moment of the battle: auras and zones, the scenario triggers of the moment and those
 * its events bring, outcomes, and then the hook of the order of turns for the moment, if the order of turns has one.
 *
 * @throws {ContentError} If the ruleset chooses no order of turns.
 * @throws {TypeError} If no package declares the order of turns.
 */
export function momentSteps(
  context: Pick<StepContext, 'content' | 'state'>,
  mechanics: Registry<MechanicExtension>,
  hook: TurnOrderHookParams,
): readonly StepDraft[] {
  const { content, state } = context;
  const scenario = scenarioDefinition(content, state.scenario);
  const target = hook.holder;
  const { variant } = turnOrderOf(mechanics, state.ruleset);

  return [
    ...checks(context, momentFirings(scenario, state, hook.moment, target)),
    ...(hasHook(variant, hook.moment) ? [turnOrderHookDraft(hook)] : []),
  ];
}

function checks(
  context: Pick<StepContext, 'content' | 'state'>,
  firings: Parameters<typeof scenarioCheckDraft>[0],
): readonly StepDraft[] {
  const scenario = scenarioDefinition(context.content, context.state.scenario);

  return [
    areaRefreshDraft(),
    ...(scenario.triggers.length === 0 ? [] : [scenarioCheckDraft(firings)]),
    ...(scenario.outcomes.length === 0 ? [] : [outcomeCheckDraft()]),
  ];
}
