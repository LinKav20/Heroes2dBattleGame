import type { ContentRegistry } from '../content/index.ts';
import type { BattleState, Command } from '../model/index.ts';
import { answerRequest } from './answer-request.ts';
import type { ExecutionRegistries } from './context.ts';
import type { ExecuteResult } from './result.ts';
import { startCommand } from './start-command.ts';

/**
 * Checks a command and runs it step by step from the stack.
 *
 * A step that needs a roll from the generator gets it at once. A step that needs a value from outside makes the kernel
 * open an input request, save the remaining steps and stop; the answer is a separate command that goes on from the
 * same step. The function has no side effects.
 *
 * @throws {TypeError} If a step, an event or a command refers to a kind the kernel does not know, or a step is not in
 * the current version. Such errors are bugs of the point of assembly, not violations of the rules.
 */
export function execute(
  registries: ExecutionRegistries,
  state: BattleState,
  command: Command,
  content: ContentRegistry,
): ExecuteResult {
  const context = { content, registries };

  return command.kind === 'answer' ? answerRequest(context, state, command) : startCommand(context, state, command);
}
