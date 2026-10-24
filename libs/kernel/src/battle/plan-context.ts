import type { AbilitySetup } from '../abilities/index.ts';
import type { ContentRegistry } from '../content/index.ts';
import { createExpressions } from '../expressions/index.ts';
import type {
  CommandPlan,
  EvaluatedValue,
  Evaluation,
  Expressions,
  FieldGeometry,
  MechanicExtension,
  StepDraft,
  StepRejects,
} from '../extensions/index.ts';
import { createFieldGeometry } from '../geometry/index.ts';
import { packageRejection, turnHolderOf, type BattleState, type Forbidden } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { checkOwnDrafts } from '../operations/index.ts';
import { endsTurn } from './course.ts';
import { actionEndDraft } from './drafts.ts';
import type { ActionEndParams } from './params.ts';

/**
 * What planning a game command needs besides the state: the content, the registries of nodes, topologies and
 * mechanics, and what the kernel keeps.
 */
export interface CommandSetup extends AbilitySetup {
  /** The registries of nodes, topologies and mechanics. */
  readonly registries: AbilitySetup['registries'] & { readonly mechanics: Registry<MechanicExtension> };
}

/**
 * What a planner of a game command sees: the state before the command, the content, the field, expressions that roll
 * no dice, and the mechanics. The field and the expressions are built when a planner first reads them.
 */
export interface PlanContext {
  /** What planning a game command needs besides the state. */
  readonly setup: CommandSetup;
  /** The state before the command. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The field of the state. */
  readonly field: FieldGeometry;
  /** Evaluates formulas and conditions; dice cannot be rolled. */
  readonly expressions: Expressions;
  /** The variants of mechanics. */
  readonly mechanics: Registry<MechanicExtension>;
}

/**
 * The steps of a game command, and how the command ends the turn of the holder: `ended` ends it, `waited` ends it as
 * put off; without it, the kernel checks whether the turn is over.
 */
export interface PlannedSteps {
  /** The kind of plan. */
  readonly kind: 'steps';
  /** The steps in the order they run. */
  readonly steps: readonly StepDraft[];
  /** How the command ends the turn, if it does. */
  readonly end?: ActionEndParams['end'];
}

/**
 * What the kernel does with a game command: forbids it with a reason of the kernel or of a mechanic, rejects it with
 * the reason a node of a formula or a condition gave, or runs its steps.
 */
export type BattlePlan = Forbidden | PlannedSteps | StepRejects;

/**
 * Returns what a planner of a game command sees for a state.
 */
export function planContext(setup: CommandSetup, state: BattleState): PlanContext {
  const { content, registries } = setup;
  let field: FieldGeometry | undefined;
  let expressions: Expressions | undefined;

  return {
    content,
    get expressions(): Expressions {
      expressions ??= createExpressions({ ...setup, field: this.field, inputs: [], state }).within({ rolls: false });

      return expressions;
    },
    get field(): FieldGeometry {
      field ??= createFieldGeometry(state, content, registries.topologies, setup.fields);

      return field;
    },
    mechanics: registries.mechanics,
    setup,
    state,
  };
}

/**
 * Returns the plan of a game action: the steps of the command and then the end of the action, which brings auras and
 * zones up to date, checks scenario triggers and outcomes and ends the turn of the holder as the plan says or if it is
 * over. A command outside a turn gets no end of the action.
 */
export function asGameAction(state: BattleState, plan: BattlePlan): BattlePlan {
  const holder = turnHolderOf(state.phase);

  if (plan.kind !== 'steps' || holder === undefined) return plan;

  const end = actionEndDraft({ holder, ...(plan.end === undefined ? {} : { end: plan.end }) });

  return { kind: 'steps', steps: [...plan.steps, end] };
}

/**
 * Returns the plan of a command that a variant of a mechanic or a command of an extension made: the plan of a package
 * that ends the turn, by `endsTurn` or by a step `kernel:turn-check` with `end`, ends it after its steps as `end`
 * says, or as `ended` if it does not say.
 *
 * @throws {TypeError} If the plan is neither a rejection nor a list of steps, forbids the command with a reason that
 * `packageRejection` does not allow, or plans a step that only the kernel adds.
 */
export function packagePlan(source: string, plan: CommandPlan, end?: ActionEndParams['end']): BattlePlan {
  const shape: unknown = plan.kind;
  const listed: unknown = 'steps' in plan ? plan.steps : undefined;

  if (shape !== 'reject' && (shape !== 'steps' || !Array.isArray(listed))) {
    throw new TypeError(`The extension ${JSON.stringify(source)} returned an unknown plan.`);
  }

  if (plan.kind === 'reject') {
    return { kind: 'forbidden', rejection: packageRejection(source, plan, 'command') };
  }

  checkOwnDrafts(source, plan.steps);

  const steps = plan.steps.filter((draft) => !endsTurn(draft));
  const ends = end ?? (plan.endsTurn === true || steps.length < plan.steps.length ? 'ended' : undefined);

  return { kind: 'steps', steps, ...(ends === undefined ? {} : { end: ends }) };
}

/**
 * Returns an evaluation made while a command is planned, which rolls no dice: its value or its rejection.
 *
 * @throws {TypeError} If the evaluation needs a roll.
 */
export function settled<Value>(evaluation: Evaluation<Value>): EvaluatedValue<Value> | StepRejects {
  if (evaluation.kind === 'need') throw new TypeError('Planning a command cannot roll dice.');

  return evaluation;
}

/**
 * Returns a plan of a command with its steps and how it ends the turn, if it does.
 */
export function plannedSteps(steps: readonly StepDraft[], end?: ActionEndParams['end']): PlannedSteps {
  return { kind: 'steps', steps, ...(end === undefined ? {} : { end }) };
}
