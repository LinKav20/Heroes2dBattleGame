import type { ScenarioValue } from '../../../content/index.ts';

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
