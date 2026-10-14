import type { ContentRegistry } from '../content/index.ts';
import type { BattleState, Command } from '../model/index.ts';
import { answerRequest } from './answer-request.ts';
import type { ExecutionCaches, ExecutionRegistries } from './context.ts';
import type { ExecuteResult } from './result.ts';
import { startCommand } from './start-command.ts';

/**
 * Checks a command and runs it step by step from the stack.
 *
 * A step that needs a roll from the generator gets it at once. A step that needs a value from outside makes the kernel
 * open an input request, save the remaining steps and stop; the answer is a separate command that goes on from the
 * same step. The function has no observable side effects; it treats the state and the content as never changing.
 *
 * @throws {ContentError} If the content describes a definition, a node or a value wrongly; see `Expressions`.
 * @throws {TypeError} If the content is not the content of the battle, or an extension breaks the contract of the
 * kernel: a step, an event or a command refers to a kind the kernel does not know, a step is not in the current
 * version, a step needs a value that cannot be given, gives an event only the kernel gives or one that does not fit
 * the state, adds a step only the kernel adds, or a reason of a rejection is not allowed. Such errors are bugs of the
 * point of assembly, not violations of the rules.
 */
export function execute(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  state: BattleState,
  command: Command,
  content: ContentRegistry,
): ExecuteResult {
  if (content.contentHash !== state.contentHash) {
    throw new TypeError(
      `The content has the hash ${content.contentHash}, but the battle was started with ${state.contentHash}.`,
    );
  }

  const context = { ...caches, content, registries };

  return command.kind === 'answer' ? answerRequest(context, state, command) : startCommand(context, state, command);
}
