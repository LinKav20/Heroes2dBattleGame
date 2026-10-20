import { checkedState, scenarioEffects, withStartingValues, type BattleOptions } from '../battle/index.ts';
import { ContentError, type ContentRegistry } from '../content/index.ts';
import { areaRefreshDraft } from '../effects/index.ts';
import type { StepDraft } from '../extensions/index.ts';
import type { BattleState, StateFormatVersion } from '../model/index.ts';
import type { ExecutionCaches, ExecutionContext, ExecutionRegistries } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';

/**
 * Creates the state of a new battle from a scenario: the checked state in deployment that `checkedState` builds, with
 * the effects of the scenario applied to sides, hazard zones and units one at a time, each in a stack of its own, so
 * any number of them fits, and the auras and zones of units that stand on the field, and then with every unit at the
 * values it starts with, the changes of the options included.
 * Before the battle starts, effects do not react to events, and the events of the creation are not kept.
 *
 * @throws {ContentError} If the scenario or the definitions it refers to are wrong, or the effects of the scenario
 * cannot be applied.
 * @throws {TypeError} If the options are wrong, no package declares the topology of the field, or applying the effects
 * of the scenario asks for a value from outside.
 */
export function createState(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  format: StateFormatVersion,
  options: BattleOptions,
  content: ContentRegistry,
): BattleState {
  const setup = { attributes: caches.attributes, content, fields: caches.fields, format, registries };
  const context: ExecutionContext = { ...caches, content, registries };
  const checked = checkedState(setup, options);
  const drafts = [areaRefreshDraft(), ...scenarioEffects(content, checked), areaRefreshDraft()];
  const state = drafts.reduce((current, draft) => applied(context, current, draft), checked);

  return withStartingValues(setup, checked, state, options);
}

function applied(context: ExecutionContext, state: BattleState, draft: StepDraft): BattleState {
  const stack = new StepStack(context.registries.steps, []);

  if (!stack.pushDrafts([draft])) throw new TypeError('The stack of steps cannot hold one step.');

  const result = runSteps(context, new EventRecorder(context.registries.events, state), stack);

  if (!result.ok) {
    throw new ContentError(`The effects of the scenario cannot be applied: ${result.rejection.reason}.`);
  }

  if (result.state.inputRequest !== undefined) {
    throw new TypeError('Applying the effects of the scenario asks for a value from outside.');
  }

  return result.state;
}
