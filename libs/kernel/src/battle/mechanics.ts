import { ContentError, type MechanicChoice, type Ruleset } from '../content/index.ts';
import type {
  ChosenMechanic,
  DefenseVariant,
  MechanicContext,
  MechanicExtension,
  StepContext,
  TurnOrderVariant,
} from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import { KERNEL_MECHANICS, type Registry } from '../names/index.ts';
import { sortedEntries } from '../shared/index.ts';

/**
 * A variant of a mechanic that a ruleset chose, with its parameters.
 */
export interface ChosenVariant<Variant extends MechanicExtension> {
  /** The variant. */
  readonly variant: Variant;
  /** The parameters the ruleset gives it. */
  readonly params: JsonObject;
}

/**
 * Checks that every variant a ruleset chooses is declared by a package and belongs to its mechanic, that the ruleset
 * chooses the order of turns, and that the order of turns gives turns to whom the ruleset does.
 *
 * @throws {ContentError} If it does not.
 */
export function checkMechanics(mechanics: Registry<MechanicExtension>, ruleset: Ruleset): void {
  const fail = rulesetFailure(ruleset);
  const where = `The ruleset ${JSON.stringify(ruleset.name)}`;

  checkChoices(mechanics, ruleset.mechanics, where, fail);
  turnOrderOf(mechanics, ruleset);
  checkTurnOwner(mechanics, ruleset.mechanics, ruleset, where, fail);
}

/**
 * Checks that the order of turns among the chosen variants, if any, gives turns to whom the ruleset does.
 *
 * @throws {Error} What `fail` returns, if it does not.
 */
export function checkTurnOwner(
  mechanics: Registry<MechanicExtension>,
  choices: Readonly<Record<string, MechanicChoice>>,
  ruleset: Ruleset,
  where: string,
  fail: (message: string) => Error,
): void {
  const choice = Object.hasOwn(choices, KERNEL_MECHANICS.turnOrder) ? choices[KERNEL_MECHANICS.turnOrder] : undefined;
  const variant = choice === undefined ? undefined : mechanics.get(choice.variant);

  if (variant === undefined || !isTurnOrder(variant) || variant.turnOwner === undefined) return;

  if (variant.turnOwner !== ruleset.turnOwner) {
    throw fail(`${where}: ${JSON.stringify(variant.name)} gives turns to every ${variant.turnOwner}, `
      + `but the ruleset ${JSON.stringify(ruleset.name)} gives them to every ${ruleset.turnOwner}.`);
  }
}

/**
 * Checks that every chosen variant is declared by a package and belongs to the mechanic it is chosen for.
 *
 * @throws {Error} What `fail` returns, if a choice is wrong.
 */
export function checkChoices(
  mechanics: Registry<MechanicExtension>,
  choices: Readonly<Record<string, MechanicChoice>>,
  where: string,
  fail: (message: string) => Error,
): void {
  for (const [mechanic, choice] of sortedEntries(choices)) {
    const variant = mechanics.get(choice.variant);
    const chooses = `${where} chooses ${JSON.stringify(choice.variant)}`;

    if (variant === undefined) throw fail(`${chooses}, which no package declares.`);

    if (variant.mechanic !== mechanic) {
      throw fail(`${chooses} for ${JSON.stringify(mechanic)}, but it belongs to ${JSON.stringify(variant.mechanic)}.`);
    }
  }
}

/**
 * Returns the order of turns the ruleset chose.
 *
 * @throws {ContentError} If the ruleset chooses none.
 * @throws {TypeError} If no package of the kernel declares the chosen variant for the order of turns.
 */
export function turnOrderOf(
  mechanics: Registry<MechanicExtension>,
  ruleset: Ruleset,
): ChosenVariant<TurnOrderVariant> {
  const chosen = chosenOf(mechanics, ruleset, KERNEL_MECHANICS.turnOrder, isTurnOrder);

  if (chosen === undefined) {
    throw new ContentError(
      `The ruleset ${JSON.stringify(ruleset.name)} chooses no order of turns.`,
      { definition: ruleset.name },
    );
  }

  return chosen;
}

/**
 * Returns the defense the ruleset chose, or nothing if it chose none.
 *
 * @throws {TypeError} If no package of the kernel declares the chosen variant for the defense.
 */
export function defenseOf(
  mechanics: Registry<MechanicExtension>,
  ruleset: Ruleset,
): ChosenVariant<DefenseVariant> | undefined {
  return chosenOf(mechanics, ruleset, KERNEL_MECHANICS.defense, isDefense);
}

/**
 * Returns the variant of a mechanic that the ruleset of the battle chose, with what it sees, or nothing if the ruleset
 * chose none.
 *
 * @throws {TypeError} If no package of the kernel declares the chosen variant for the mechanic.
 */
export function chosenMechanic(
  mechanics: Registry<MechanicExtension>,
  context: Pick<StepContext, 'content' | 'expressions' | 'field' | 'state'>,
  name: string,
): ChosenMechanic | undefined {
  const chosen = variantOf(mechanics, context.state.ruleset, name);

  if (chosen === undefined) return undefined;

  return { context: mechanicContext(context, chosen.params), variant: chosen.variant };
}

/**
 * Returns what a variant of a mechanic sees: the state, the content, the field, the parameters of the variant and
 * expressions that roll no dice.
 */
export function mechanicContext(
  context: Pick<StepContext, 'content' | 'expressions' | 'field' | 'state'>,
  params: JsonObject,
): MechanicContext {
  const { content, expressions, field, state } = context;

  return { content, expressions: expressions.within({ rolls: false }), field, params, state };
}

/**
 * Returns a function that makes an error of the content about a ruleset.
 */
export function rulesetFailure(ruleset: Ruleset): (message: string) => ContentError {
  return (message) => new ContentError(message, { definition: ruleset.name });
}

function chosenOf<Variant extends MechanicExtension>(
  mechanics: Registry<MechanicExtension>,
  ruleset: Ruleset,
  mechanic: string,
  isVariant: (variant: MechanicExtension) => variant is Variant,
): ChosenVariant<Variant> | undefined {
  const chosen = variantOf(mechanics, ruleset, mechanic);

  if (chosen === undefined) return undefined;

  const { params, variant } = chosen;

  if (isVariant(variant)) return { params, variant };

  throw new TypeError(`The variant ${JSON.stringify(variant.name)} is not a variant of ${JSON.stringify(mechanic)}.`);
}

function variantOf(
  mechanics: Registry<MechanicExtension>,
  ruleset: Ruleset,
  mechanic: string,
): ChosenVariant<MechanicExtension> | undefined {
  const choice = Object.hasOwn(ruleset.mechanics, mechanic) ? ruleset.mechanics[mechanic] : undefined;

  if (choice === undefined) return undefined;

  const variant = mechanics.get(choice.variant);

  if (variant?.mechanic !== mechanic) {
    throw new TypeError(
      `No package of the kernel declares ${JSON.stringify(choice.variant)} for ${JSON.stringify(mechanic)}.`,
    );
  }

  return { params: choice.params ?? {}, variant };
}

function isTurnOrder(variant: MechanicExtension): variant is TurnOrderVariant {
  return variant.mechanic === KERNEL_MECHANICS.turnOrder;
}

function isDefense(variant: MechanicExtension): variant is DefenseVariant {
  return variant.mechanic === KERNEL_MECHANICS.defense;
}
