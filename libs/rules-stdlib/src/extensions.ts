import type { KernelExtension } from '@heroes2dgame/kernel';
import { ATTACK_STEPS, BRACE_DEFENSE, STACK_ATTACK } from './attack.ts';
import { CHANCE_LUCK, CHANCE_MORALE } from './chances.ts';
import { RULES_STDLIB_EVENTS } from './events.ts';
import { HEX_TOPOLOGY } from './hex-topology.ts';
import { INITIATIVE_ORDER, INITIATIVE_STEPS } from './initiative-order.ts';
import { SIDES_ORDER } from './sides-order.ts';
import { SPEED_ORDER, SPEED_STEPS } from './speed-order.ts';

/**
 * Every extension of the package, for a point of assembly to register in the kernel: the hex topology, the orders of
 * turns, the attack of stacks, the defense that braces a unit, morale and luck as chances, and their steps and events.
 */
export const RULES_STDLIB_EXTENSIONS: readonly KernelExtension[] = Object.freeze([
  HEX_TOPOLOGY,
  SPEED_ORDER,
  INITIATIVE_ORDER,
  SIDES_ORDER,
  STACK_ATTACK,
  BRACE_DEFENSE,
  CHANCE_MORALE,
  CHANCE_LUCK,
  ...SPEED_STEPS,
  ...INITIATIVE_STEPS,
  ...ATTACK_STEPS,
  ...RULES_STDLIB_EVENTS,
]);
