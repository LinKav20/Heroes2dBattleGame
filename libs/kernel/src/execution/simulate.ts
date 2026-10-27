import { actionEndDraft } from '../battle/index.ts';
import type { ContentRegistry } from '../content/index.ts';
import { turnHolderOf, type BattleState, type Command, type TurnHolder } from '../model/index.ts';
import { withoutKey } from '../shared/index.ts';
import { answerRequest } from './answer-request.ts';
import type { ExecutionCaches, ExecutionContext, ExecutionRegistries, SimulatedRolls } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { checkContent } from './execute.ts';
import type { ExecuteResult } from './result.ts';
import { startCommand } from './start-command.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';

/**
 * Runs a command as `execute` does, on a full state or a projection, but rolls every die at once at its lowest or
 * highest side, from the generator and from outside alike, and never touches the generator. A choice still opens an
 * input request. With no rolls a step that needs any value is left out.
 *
 * The simulation runs on the state without the mark of its visibility and puts the mark back on the result. So on a
 * projection for sides, which keeps no counts of fired triggers, the simulation counts the firings of its own command
 * from zero, and a trigger with a limit stops firing as it would in the battle; the counts stay in the result and go
 * on through a request the simulation opened and its answer. A projection for sides keeps no saved steps either, so
 * only an answer to a request the simulation opened runs on it; an answer to a request of the battle throws.
 *
 * @throws {ContentError} If the content describes a definition, a node or a value wrongly.
 * @throws {TypeError} If the content is not the content of the battle, the command answers a request of the battle on
 * a projection for sides, or an extension breaks the contract of the kernel, as `execute` throws.
 */
export function simulate(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  state: BattleState,
  command: Command,
  content: ContentRegistry,
  rolls: SimulatedRolls,
): ExecuteResult {
  checkContent(state, content);

  const result = simulateUnmarked({ ...caches, content, registries, rolls }, unmarked(state), command);

  return result.ok ? { ...result, state: marked(result.state, state) } : result;
}

/**
 * Returns who has the next turns, the current one first, as the order of turns gives them if every holder ends its
 * turn at once: the kernel ends the turns one by one on a copy of the battle, with the steps of the order of turns and
 * of the moments of the battle, but with no rolls and no choices, so a step that needs one is left out. The list is
 * shorter if the battle ends, or there is no turn now.
 *
 * An open input request does not stop the queue. In a turn the rest of the command that waits for the answer is left
 * out, and the holder ends the turn. Between turns the saved steps go on without the step that waits, so the battle
 * comes to the next turn. A projection for sides keeps no saved steps, so on it the queue is empty while a request
 * between turns is open.
 *
 * On a projection for sides the queue sees only what the sides see, and it may differ from the battle for the units
 * they see too: for example, an effect they do not see may change the order. A turn of a unit they do not see ends
 * there as a turn of its side in which only the side takes part. As in `simulate`, the kernel counts the firings of
 * triggers on the copy from zero.
 *
 * @throws {RangeError} If the number of turns is not a whole number from 0.
 * @throws {ContentError} If a step of the course of the battle rejects with a reason of a formula, or the course of
 * the battle goes beyond the limits of steps.
 * @throws {TypeError} If the content is not the content of the battle, or an extension breaks the contract of the
 * kernel.
 */
export function turnQueue(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  state: BattleState,
  content: ContentRegistry,
  turns: number,
): readonly TurnHolder[] {
  if (!Number.isSafeInteger(turns) || turns < 0) {
    throw new RangeError(`The number of turns needs to be a whole number from 0, not ${String(turns)}.`);
  }

  checkContent(state, content);

  const context = { ...caches, content, registries, rolls: 'none' as const };
  const holders: TurnHolder[] = [];
  let current = withoutRequest(context, unmarked(state));

  while (holders.length < turns) {
    const holder = turnHolderOf(current.phase);

    if (holder === undefined) break;

    holders.push(holder);

    const stack = new StepStack(registries.steps, []);

    stack.pushDrafts([actionEndDraft({ end: 'ended', holder })]);

    const result = runSteps(context, new EventRecorder(registries.events, current), stack);

    if (!result.ok) break;

    current = result.state;
  }

  return holders;
}

/**
 * Runs a command in a simulation on a state without the mark of its visibility, after the checks of `simulate`, and
 * returns the result without the mark.
 */
export function simulateUnmarked(context: ExecutionContext, state: BattleState, command: Command): ExecuteResult {
  return command.kind === 'answer' ? answerRequest(context, state, command) : startCommand(context, state, command);
}

/**
 * Returns the state without the mark of its visibility.
 */
export function unmarked(state: BattleState): BattleState {
  return state.visibility === undefined ? state : withoutKey(state, 'visibility');
}

function marked(result: BattleState, source: BattleState): BattleState {
  return source.visibility === undefined ? result : { ...result, visibility: source.visibility };
}

function withoutRequest(context: ExecutionContext, state: BattleState): BattleState {
  if (state.inputRequest === undefined || turnHolderOf(state.phase) !== undefined) return state;

  const open = { ...withoutKey(state, 'inputRequest'), steps: [] };
  const result = runSteps(
    context,
    new EventRecorder(context.registries.events, open),
    new StepStack(context.registries.steps, state.steps),
  );

  return result.ok ? result.state : open;
}
