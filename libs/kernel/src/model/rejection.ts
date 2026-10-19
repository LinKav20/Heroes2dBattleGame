import type { ContentName, SideId, Tag, UnitId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import { kernelName } from '../names/index.ts';

/**
 * Why the kernel rejected a command: the code tells the kind of reason, the reason names it exactly, and the
 * parameters give the details. The user interface picks the text in the right language by the reason.
 */
export interface Rejection {
  /** The code of the reason. */
  readonly code: RejectionCode;
  /**
   * The full name of the reason: one of {@link REJECTION_REASONS} or a reason of a package with extensions, for
   * example `acme-duel:no-target`.
   */
  readonly reason: string;
  /** The details of the reason. */
  readonly params: JsonObject;
}

/**
 * The parameters of every reason the kernel itself gives, by the reason; {@link REJECTION_REASONS} describes them.
 */
export interface KernelRejectionParams {
  readonly [REJECTION_REASONS.abilityCooldown]: { readonly ability: ContentName; readonly turns: number };
  readonly [REJECTION_REASONS.abilityForbidden]: { readonly ability: ContentName; readonly tag: Tag };
  readonly [REJECTION_REASONS.battleOver]: Readonly<Record<string, never>>;
  readonly [REJECTION_REASONS.inputPending]: Readonly<Record<string, never>>;
  readonly [REJECTION_REASONS.invalidAnswer]: { readonly request: number };
  readonly [REJECTION_REASONS.invalidCommand]: { readonly field: 'ability' | 'item' | 'side' | 'unit' };
  readonly [REJECTION_REASONS.invalidTargets]: {
    readonly ability: ContentName;
    readonly problem: TargetProblem;
    readonly target?: number;
  };
  readonly [REJECTION_REASONS.noAbility]: { readonly ability?: ContentName; readonly item?: number };
  readonly [REJECTION_REASONS.noCharges]: { readonly item: number };
  readonly [REJECTION_REASONS.noOpenRequest]: { readonly request: number };
  readonly [REJECTION_REASONS.notAvailable]: Readonly<Record<string, never>>;
  readonly [REJECTION_REASONS.notEnoughActions]: { readonly action: ContentName };
  readonly [REJECTION_REASONS.notEnoughResource]: { readonly resource: ContentName };
  readonly [REJECTION_REASONS.notOnField]: { readonly unit?: UnitId };
  readonly [REJECTION_REASONS.notYourTurn]: Readonly<Record<string, never>>;
  readonly [REJECTION_REASONS.outOfRange]: {
    readonly formula?: string;
    readonly attribute?: ContentName;
    readonly unit?: UnitId;
    readonly side?: SideId;
  };
  readonly [REJECTION_REASONS.requirementNotMet]: { readonly ability: ContentName };
  readonly [REJECTION_REASONS.rngExhausted]: { readonly name: ContentName };
  readonly [REJECTION_REASONS.stepLimit]: Readonly<Record<string, never>>;
  readonly [REJECTION_REASONS.unitDead]: { readonly unit: UnitId };
  readonly [REJECTION_REASONS.unknownCommand]: { readonly name: string };
  readonly [REJECTION_REASONS.useLimit]: { readonly ability: ContentName; readonly per: 'battle' | 'round' | 'turn' };
}

/**
 * A rejection with a reason of the kernel and the parameters of that reason.
 */
export type KernelRejection<Reason extends RejectionReason = RejectionReason> = {
  readonly [Kind in Reason]: Rejection & { readonly reason: Kind; readonly params: KernelRejectionParams[Kind] };
}[Reason];

/**
 * Why the targets of an ability do not fit its rule, as the parameter `problem` of `kernel:invalid-targets` names it.
 */
export type TargetProblem = (typeof TARGET_PROBLEMS)[keyof typeof TARGET_PROBLEMS];

/**
 * The code of a reason why the kernel rejects a command.
 */
export type RejectionCode = (typeof REJECTION_CODES)[keyof typeof REJECTION_CODES];

/**
 * A reason the kernel itself gives. Packages with extensions give reasons of their own.
 */
export type RejectionReason = (typeof REJECTION_REASONS)[keyof typeof REJECTION_REASONS];

/**
 * The codes of the reasons why the kernel rejects a command: the command answers an input request that is not open,
 * or the rules do not allow it.
 */
export const REJECTION_CODES = Object.freeze({
  nothingToAnswer: 'nothing-to-answer',
  ruleViolation: 'rule-violation',
} as const);

/**
 * The reasons the kernel itself gives, with their parameters:
 * - `abilityCooldown`: the ability is cooling down; `ability` names it and `turns` tells how many turns are left;
 * - `abilityForbidden`: the user has a tag that forbids the ability; `ability` names it and `tag` is the tag of its
 *   list of forbidding tags that matched;
 * - `battleOver`: a game command after the end of the battle; no parameters;
 * - `inputPending`: a game command while an input request is open; no parameters;
 * - `invalidAnswer`: an answer that does not fit the open request; `request` is its identifier;
 * - `invalidCommand`: the command refers to a unit, a side, an item or an ability that is not there, or misses one it
 *   needs; `field` names the field of the command;
 * - `invalidTargets`: the targets do not fit the rule of the ability; `ability` names it, `problem` is one of
 *   `TARGET_PROBLEMS`, and `target` is the place of the target in the command unless the number of targets is wrong;
 * - `noAbility`: the unit, the side or the item has no such ability; `ability` names it and `item` is the identifier
 *   of the item, if the unit uses one; an item without abilities gives only `item`;
 * - `noCharges`: the item has no charges left; `item` is its identifier;
 * - `noOpenRequest`: with the code `nothing-to-answer`, an answer to a request that is not open; `request` is the
 *   identifier the answer names;
 * - `notAvailable`: a command the kernel cannot run yet; no parameters;
 * - `notEnoughActions`: the unit has spent the actions of the turn the ability costs; `action` names the kind;
 * - `notOnField`: a formula measures a distance to a unit that does not stand on the field; `unit` names it;
 * - `notEnoughResource`: the unit has less of a resource than the ability costs; `resource` names it;
 * - `notYourTurn`: the unit or the side does not have the turn; no parameters;
 * - `outOfRange`: a formula or an attribute gets a value out of the safe range; `formula` is the full name of the
 *   node, or `unit` and `attribute` name the attribute;
 * - `requirementNotMet`: the requirement of the ability does not hold; `ability` names it;
 * - `rngExhausted`: the generator has run out of values; `name` is the random value a step needed;
 * - `stepLimit`: the command ran too many steps or built too deep a stack of steps; no parameters;
 * - `unitDead`: the unit has no creatures left; `unit` names it;
 * - `unknownCommand`: a game command of an extension that no package declares; `name` is its full name;
 * - `useLimit`: the ability has been used as many times as it may be per turn, round or battle; `ability` names it and
 *   `per` is `turn`, `round` or `battle`.
 */
export const REJECTION_REASONS = Object.freeze({
  abilityCooldown: kernelName('ability-cooldown'),
  abilityForbidden: kernelName('ability-forbidden'),
  battleOver: kernelName('battle-over'),
  inputPending: kernelName('input-pending'),
  invalidAnswer: kernelName('invalid-answer'),
  invalidCommand: kernelName('invalid-command'),
  invalidTargets: kernelName('invalid-targets'),
  noAbility: kernelName('no-ability'),
  noCharges: kernelName('no-charges'),
  noOpenRequest: kernelName('no-open-request'),
  notAvailable: kernelName('not-available'),
  notEnoughActions: kernelName('not-enough-actions'),
  notEnoughResource: kernelName('not-enough-resource'),
  notOnField: kernelName('not-on-field'),
  notYourTurn: kernelName('not-your-turn'),
  outOfRange: kernelName('out-of-range'),
  requirementNotMet: kernelName('requirement-not-met'),
  rngExhausted: kernelName('rng-exhausted'),
  stepLimit: kernelName('step-limit'),
  unitDead: kernelName('unit-dead'),
  unknownCommand: kernelName('unknown-command'),
  useLimit: kernelName('use-limit'),
} as const);

/**
 * The problems of targets: their number, a target named twice, a target of a wrong kind or not in the battle, a dead
 * unit, a unit or a cell off the field, a target out of the range, and a target that the filter does not pass.
 */
export const TARGET_PROBLEMS = Object.freeze({
  count: 'count',
  dead: 'dead',
  duplicate: 'duplicate',
  filter: 'filter',
  kind: 'kind',
  offField: 'off-field',
  range: 'range',
} as const);

/**
 * Tells whether a rejection has a reason of the kernel, the given one if a reason is given, and narrows its
 * parameters.
 */
export function isKernelRejection<Reason extends RejectionReason = RejectionReason>(
  rejection: Rejection,
  reason?: Reason,
): rejection is KernelRejection<Reason> {
  return reason === undefined ? KERNEL_REASONS.has(rejection.reason) : rejection.reason === reason;
}

const KERNEL_REASONS: ReadonlySet<string> = new Set(Object.values(REJECTION_REASONS));
