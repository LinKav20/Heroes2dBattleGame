import type { ContentRegistry } from '../content/index.ts';
import type { ExecutionCaches, ExecutionRegistries } from '../execution/context.ts';
import { EventRecorder } from '../execution/event-recorder.ts';
import type { ExecuteResult } from '../execution/index.ts';
import { runSteps } from '../execution/step-runner.ts';
import { StepStack } from '../execution/step-stack.ts';
import type { StepDraft } from '../extensions/index.ts';
import type { BattleState } from '../model/index.ts';

export function runDrafts(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  state: BattleState,
  drafts: readonly StepDraft[],
  content: ContentRegistry,
): ExecuteResult {
  const stack = new StepStack(registries.steps, []);

  if (!stack.pushDrafts(drafts)) throw new Error('The steps do not fit into the stack');

  return runSteps({ ...caches, content, registries }, new EventRecorder(registries.events, state), stack);
}
