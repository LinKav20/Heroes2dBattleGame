import type { ContentRegistry } from '../content/index.ts';
import type { CellId, UnitId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleState, TurnHolder } from '../model/index.ts';
import type { Extension, KERNEL_MECHANICS } from '../names/index.ts';
import type { CommandPlan } from './command-kind.ts';
import type { EvaluatedValue, Expressions } from './expressions.ts';
import type { StepDraft, StepRejects } from './step-results.ts';
import type { FieldGeometry } from './topology.ts';

/**
 * A variant of a mechanic that rulesets choose, such as the order of turns by speed with waiting. A ruleset chooses
 * the variant of every mechanic by the full name of the mechanic and gives it parameters. The kernel itself asks the
 * mechanics `kernel:turn-order`, `kernel:attack` and `kernel:defense`, see {@link TurnOrderVariant},
 * {@link AttackVariant} and {@link DefenseVariant}; a package may declare mechanics of its own and ask them in its
 * steps.
 */
export interface MechanicExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'mechanic';
  /** The full name of the mechanic the variant belongs to, for example `kernel:turn-order`. */
  readonly mechanic: string;
  /** The JSON Schema of the parameters of the variant; the content loader checks rulesets by it. */
  readonly schema: JsonObject;
}

/**
 * What a variant of a mechanic sees. Every function of a variant has no side effects and gives the same result for
 * the same context.
 *
 * `Params` is the format of the parameters of the variant in the ruleset, declared as an interface that extends
 * `JsonObject`, for example `interface SpeedParams extends JsonObject { readonly waiting: boolean }`.
 */
export interface MechanicContext<Params extends JsonObject = JsonObject> {
  /**
   * The state of the battle now. As in `StepContext.state`, it may be a projection for sides without its mark, with
   * missing data of extensions taken for the data they start with.
   */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The parameters of the variant that the ruleset gives. */
  readonly params: Params;
  /** Evaluates formulas and conditions of content; dice cannot be rolled. */
  readonly expressions: Expressions;
  /** The field of the state with its units and obstacles. */
  readonly field: FieldGeometry;
}

/**
 * A variant of a mechanic that the ruleset of a battle chose, with what it sees.
 */
export interface ChosenMechanic {
  /** The variant. */
  readonly variant: MechanicExtension;
  /** What the variant sees, with the parameters the ruleset gives it. */
  readonly context: MechanicContext;
}

/**
 * A variant of the order of turns, the mechanic `kernel:turn-order`, such as by speed with waiting or by a roll of
 * initiative. The kernel leads the battle itself: it starts rounds and turns, counts durations, starts the uses of
 * abilities again and checks scenario triggers and outcomes. The variant tells who gets the next turn and may add
 * steps of its own at the start of the battle, of a round and of a turn and at their end, for example a roll of
 * initiative or a check of morale. The kernel asks a hook after its own steps of that moment, so the hook sees the
 * state after them, and runs the steps of the hook right away, before the next turn or round. The steps may not be
 * steps that only the kernel adds; to end the turn a hook adds `kernel:turn-check`, and to roll dice it adds a step
 * that rolls and keeps the result in `BattleState.extensions` under the full name of an extension that declares its
 * data. The steps of a hook belong to the course of the battle: they cannot reject the command, and a rejection in
 * them is an error of the content if a formula gave it and of the package otherwise. After the steps of a hook the
 * kernel checks the outcomes again.
 */
export interface TurnOrderVariant<Params extends JsonObject = JsonObject> extends MechanicExtension {
  /** The mechanic the variant belongs to. */
  readonly mechanic: typeof KERNEL_MECHANICS.turnOrder;
  /**
   * Whom the variant gives turns: units or sides. The ruleset that chooses the variant must give turns to the same;
   * without it the kernel checks every turn the variant gives.
   */
  readonly turnOwner?: 'side' | 'unit';
  /**
   * Returns who gets the next turn of the round, or nothing if the round is over. The kernel asks after every turn and
   * at the start of every round; the turns that have ended in the round are in `state.turns`, and a unit that waited
   * or gets another turn may have the turn again. A unit that gets the turn must be alive and stand on the field, and
   * the turn goes to a unit if the ruleset gives turns to units, and to a side otherwise. The function cannot roll
   * dice. A rejection it returns is an error of the content if a formula gave it, and of the package otherwise.
   */
  next(context: MechanicContext<Params>): EvaluatedValue<TurnHolder | undefined> | StepRejects;
  /** Returns the steps of the variant at the start of the battle, after deployment and before the first round. */
  battleStart?(context: MechanicContext<Params>): readonly StepDraft[];
  /** Returns the steps of the variant at the start of a round, after the uses of the round start again. */
  roundStart?(context: MechanicContext<Params>): readonly StepDraft[];
  /** Returns the steps of the variant at the start of a turn, after the counts of the turn and its checks. */
  turnStart?(context: MechanicContext<Params>, holder: TurnHolder): readonly StepDraft[];
  /** Returns the steps of the variant at the end of a turn, which `state.turns` already records. */
  turnEnd?(context: MechanicContext<Params>, holder: TurnHolder): readonly StepDraft[];
  /** Returns the steps of the variant at the end of a round. */
  roundEnd?(context: MechanicContext<Params>): readonly StepDraft[];
  /**
   * Turns the command `wait` of a unit that has the turn into steps, or tells why the rules forbid it. Without this
   * function units cannot wait. After the steps the kernel ends the turn and records that the unit waited; if the rest
   * of the command is aborted after an answer, the turn is not put off.
   */
  wait?(context: MechanicContext<Params>, unit: UnitId): CommandPlan;
}

/**
 * A variant of the defense, the mechanic `kernel:defense`: what the command `defend` does, for example applies an
 * effect until the next turn of the unit.
 */
export interface DefenseVariant<Params extends JsonObject = JsonObject> extends MechanicExtension {
  /** The mechanic the variant belongs to. */
  readonly mechanic: typeof KERNEL_MECHANICS.defense;
  /**
   * Turns the command `defend` of a unit that has the turn and some action of the turn left into steps, or tells why
   * the rules forbid it. To spend the actions of the turn the steps add `kernel:spend-actions`, and to end the turn
   * after the steps even if the unit could still act, the plan says `endsTurn`.
   */
  defend(context: MechanicContext<Params>, unit: UnitId): CommandPlan;
}

/**
 * A variant of the attack, the mechanic `kernel:attack`: what the commands `attack` and `shoot` do, for example a
 * strike with the damage of a stack, a strike back and luck.
 */
export interface AttackVariant<Params extends JsonObject = JsonObject> extends MechanicExtension {
  /** The mechanic the variant belongs to. */
  readonly mechanic: typeof KERNEL_MECHANICS.attack;
  /**
   * Turns the command `attack` into steps, or tells why the rules forbid it. The kernel has checked that the unit or
   * its side has the turn, that the unit stands on the field and that the target is another unit that is alive and
   * stands on the field. If the command names a cell to attack from, the kernel has checked the move there as the
   * command `move` does and runs it before the steps; the move spends only the actions that count the cost of
   * movement, not the actions of the turn that every move spends, so the steps spend the action of the strike. The
   * variant sees the state after the events of the move, with the auras and zones as before it, and the path in the
   * request. Effects react to the move before the steps run, so
   * they may kill or move the attacker or the target, and every step checks again that both still stand on the field
   * and that the strike reaches. To spend the actions of the turn the steps add `kernel:spend-actions`, which spends
   * nothing for a unit off the field, and to end the turn after the steps even if the unit could still act, the plan
   * says `endsTurn`.
   */
  attack(context: MechanicContext<Params>, attack: AttackRequest): CommandPlan;
  /**
   * Turns the command `shoot` into steps, or tells why the rules forbid it, after the same checks as of `attack`.
   * Without this function units cannot shoot.
   */
  shoot?(context: MechanicContext<Params>, shot: AttackRequest): CommandPlan;
}

/**
 * Who attacks or shoots at whom, and the way the attacker goes before it strikes, if it does.
 */
export interface AttackRequest {
  /** The unit that attacks or shoots. */
  readonly unit: UnitId;
  /** The unit it attacks or shoots at. */
  readonly target: UnitId;
  /**
   * The cells the attacker passes on its way to the cell it attacks from, the last one included. It is given when the
   * command names a cell to attack from: empty if the unit only turns where it stands, absent if it neither moves nor
   * turns.
   */
  readonly path?: readonly CellId[];
}
