import type { ScenarioValue } from '../../content/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';

/**
 * The payload of `kernel:variable-set`.
 */
export interface VariableSetPayload {
  /** The local name of the variable. */
  readonly variable: string;
  /** The new value. */
  readonly value: ScenarioValue;
}

/**
 * The payload of `kernel:trigger-fired`.
 */
export interface TriggerFiredPayload {
  /** The local name of the trigger. */
  readonly trigger: string;
  /** How many times the trigger has fired, this time included. */
  readonly fired: number;
}

/**
 * The payloads of the events of the kernel about scenario variables and triggers.
 */
export interface ScenarioEventPayloads {
  /** A scenario variable got a new value. */
  readonly [KERNEL_EVENTS.variableSet]: VariableSetPayload;
  /** A scenario trigger fired. */
  readonly [KERNEL_EVENTS.triggerFired]: TriggerFiredPayload;
}

/**
 * How the events of the kernel about scenario variables and triggers change the state.
 */
export const SCENARIO_EVENTS: KernelEventAppliers<ScenarioEventPayloads> = {
  [KERNEL_EVENTS.variableSet]: (state, { value, variable }) => ({
    ...state,
    variables: { ...state.variables, [variable]: value },
  }),
  [KERNEL_EVENTS.triggerFired]: (state, { fired, trigger }) => ({
    ...state,
    triggers: { ...state.triggers, [trigger]: { fired } },
  }),
};
