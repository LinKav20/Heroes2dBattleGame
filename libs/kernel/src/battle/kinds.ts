import type { MechanicExtension, StepKind } from '../extensions/index.ts';
import type { Registry } from '../names/index.ts';
import { DEPLOYMENT_END_STEP, UNIT_PLACE_STEP } from './deployment.ts';
import { STATE_EDIT_STEP } from './edits.ts';
import { GIVE_UP_STEP } from './give-up.ts';
import { MOVE_STEP } from './movement.ts';
import { OUTCOME_CHECK_STEP } from './outcomes.ts';
import { roundSteps } from './round-steps.ts';
import { SCENARIO_CHECK_STEP } from './scenario-triggers.ts';
import { SPEND_ACTIONS_STEP } from './turn-actions.ts';
import { turnSteps } from './turn-steps.ts';

/**
 * Returns the kinds of steps with which the kernel leads a battle: deployment, the course of rounds and turns, moves
 * and spent actions, checks of scenario triggers and outcomes, the end of the battle by a retreat or a surrender, and
 * the change of values by a state edit.
 * The steps of the course of the battle ask the order of turns of the ruleset through `mechanics`.
 */
export function battleStepKinds(mechanics: () => Registry<MechanicExtension>): readonly StepKind[] {
  return Object.freeze([
    ...roundSteps(mechanics),
    ...turnSteps(mechanics),
    DEPLOYMENT_END_STEP,
    GIVE_UP_STEP,
    MOVE_STEP,
    OUTCOME_CHECK_STEP,
    SCENARIO_CHECK_STEP,
    SPEND_ACTIONS_STEP,
    STATE_EDIT_STEP,
    UNIT_PLACE_STEP,
  ]);
}
