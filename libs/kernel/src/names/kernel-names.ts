import { kernelName } from './extension-names.ts';

/**
 * The full name of a kind of step of the kernel.
 */
export type KernelStepType = (typeof KERNEL_STEPS)[keyof typeof KERNEL_STEPS];

/**
 * The full name of an operation of the kernel.
 */
export type KernelOperationType = (typeof KERNEL_OPERATIONS)[keyof typeof KERNEL_OPERATIONS];

/**
 * The full names of the kinds of steps that the kernel registers itself.
 */
export const KERNEL_STEPS = Object.freeze({
  abilityTargets: kernelName('ability-targets'),
  abilityTick: kernelName('ability-tick'),
  abilityUse: kernelName('ability-use'),
  actionEnd: kernelName('action-end'),
  areaRefresh: kernelName('area-refresh'),
  battleStart: kernelName('battle-start'),
  deploymentEnd: kernelName('deployment-end'),
  effectApplication: kernelName('effect-application'),
  effectRefresh: kernelName('effect-refresh'),
  effectRemoval: kernelName('effect-removal'),
  effectTick: kernelName('effect-tick'),
  effectTurn: kernelName('effect-turn'),
  giveUp: kernelName('give-up'),
  move: kernelName('move'),
  nextTurn: kernelName('next-turn'),
  operation: kernelName('operation'),
  outcomeCheck: kernelName('outcome-check'),
  reaction: kernelName('reaction'),
  roundEnd: kernelName('round-end'),
  roundStart: kernelName('round-start'),
  scenarioCheck: kernelName('scenario-check'),
  spendActions: kernelName('spend-actions'),
  stateEdit: kernelName('state-edit'),
  turnCheck: kernelName('turn-check'),
  turnCounts: kernelName('turn-counts'),
  turnEnd: kernelName('turn-end'),
  turnOrderHook: kernelName('turn-order-hook'),
  turnStart: kernelName('turn-start'),
  unitPlace: kernelName('unit-place'),
});

/**
 * The full names of the mechanics that the kernel itself asks a ruleset about: the order of turns, which a ruleset
 * must choose, the attack, without which units neither attack nor shoot, and the defense, without which a unit cannot
 * defend.
 */
export const KERNEL_MECHANICS = Object.freeze({
  attack: kernelName('attack'),
  defense: kernelName('defense'),
  turnOrder: kernelName('turn-order'),
});

/**
 * The full names of the moments of a battle that a scenario trigger can wait for besides kinds of events: the start
 * of the battle after deployment, the start and the end of a round and of a turn.
 */
export const BATTLE_MOMENTS = Object.freeze({
  battleStart: kernelName('battle-start'),
  roundEnd: kernelName('round-end'),
  roundStart: kernelName('round-start'),
  turnEnd: kernelName('turn-end'),
  turnStart: kernelName('turn-start'),
});

/**
 * The kinds of steps that only the kernel puts on the stack: the use of an ability and its operations for every target,
 * which the command checks first, reactions to events, operations of every turn, the refresh of the marks of activity,
 * the counts of durations and uses at the start and the end of turns and rounds, the course of the battle from
 * deployment to its end, the checks of scenario triggers and outcomes, and the change of values by a state edit. A step
 * or an operation of a package that adds them breaks the contract.
 */
export const KERNEL_ONLY_STEPS: readonly KernelStepType[] = Object.freeze([
  KERNEL_STEPS.abilityTargets,
  KERNEL_STEPS.abilityTick,
  KERNEL_STEPS.abilityUse,
  KERNEL_STEPS.actionEnd,
  KERNEL_STEPS.battleStart,
  KERNEL_STEPS.deploymentEnd,
  KERNEL_STEPS.effectRefresh,
  KERNEL_STEPS.effectTick,
  KERNEL_STEPS.effectTurn,
  KERNEL_STEPS.giveUp,
  KERNEL_STEPS.nextTurn,
  KERNEL_STEPS.outcomeCheck,
  KERNEL_STEPS.reaction,
  KERNEL_STEPS.roundEnd,
  KERNEL_STEPS.roundStart,
  KERNEL_STEPS.scenarioCheck,
  KERNEL_STEPS.stateEdit,
  KERNEL_STEPS.turnCounts,
  KERNEL_STEPS.turnEnd,
  KERNEL_STEPS.turnOrderHook,
  KERNEL_STEPS.turnStart,
  KERNEL_STEPS.unitPlace,
]);

/**
 * The kinds of steps of the course of the battle: the kernel runs them on its own after the action of a command, and
 * every step they add belongs to the course of the battle too. Such a step cannot reject the command: a rejection in
 * it is an error of the content or of a package.
 */
export const FLOW_STEPS: readonly KernelStepType[] = Object.freeze([
  KERNEL_STEPS.actionEnd,
  KERNEL_STEPS.battleStart,
  KERNEL_STEPS.nextTurn,
  KERNEL_STEPS.outcomeCheck,
  KERNEL_STEPS.roundEnd,
  KERNEL_STEPS.roundStart,
  KERNEL_STEPS.scenarioCheck,
  KERNEL_STEPS.turnCheck,
  KERNEL_STEPS.turnEnd,
  KERNEL_STEPS.turnOrderHook,
  KERNEL_STEPS.turnStart,
]);

/**
 * The full names of the operations that the kernel registers itself.
 */
export const KERNEL_OPERATIONS = Object.freeze({
  addItem: kernelName('add-item'),
  applyEffect: kernelName('apply-effect'),
  changeResource: kernelName('change-resource'),
  damage: kernelName('damage'),
  heal: kernelName('heal'),
  removeEffects: kernelName('remove-effects'),
  removeItem: kernelName('remove-item'),
  setVariable: kernelName('set-variable'),
});

/**
 * Tells whether a kind of step is one that only the kernel puts on the stack.
 */
export function isKernelOnlyStep(type: string): boolean {
  return KERNEL_ONLY_STEPS.some((only) => only === type);
}

/**
 * Tells whether a kind of step belongs to the course of the battle.
 */
export function isFlowStep(type: string): boolean {
  return FLOW_STEPS.some((flow) => flow === type);
}
