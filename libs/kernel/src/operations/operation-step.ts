import { ContentError } from '../content/index.ts';
import { isNode } from '../expressions/index.ts';
import type { OperationExtension, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import type { BattleEvent } from '../model/index.ts';
import { isKernelName, KERNEL_STEPS, type Registry } from '../names/index.ts';
import { checkOwnSteps } from './kernel-only.ts';
import { kernelStep } from './kernel-step.ts';
import type { OperationParams } from './params.ts';

/**
 * Returns the kind of step that runs one operation of content by its node, with its participants, applied effect and
 * event. The operations come from the registry of the kernel. An operation of a package cannot add the steps that only
 * the kernel adds.
 *
 * @throws {ContentError} If the operation is not a node or no package declares it.
 */
export function operationStep(operations: () => Registry<OperationExtension>): StepKind<OperationParams> {
  return kernelStep(
    KERNEL_STEPS.operation,
    ({ content, expressions, field, inputs, mechanic, params, state }: StepContext<OperationParams>): StepResult => {
      const { effect, event, op, subjects } = params;

      if (!isNode(op)) throw new ContentError(`${JSON.stringify(op)} is not an operation.`);

      const kind = operations().get(op.type);

      if (kind === undefined) {
        throw new ContentError(`The kernel has no operation ${JSON.stringify(op.type)}.`, { node: op.type });
      }

      const scope = {
        subjects,
        ...(effect === undefined ? {} : { effect }),
        ...(event === undefined ? {} : { event }),
      };
      const result = kind.run(op, {
        ...scope,
        content,
        expressions: expressions.within(scope),
        field,
        inputs,
        mechanic,
        state,
      });

      if (!isKernelName(kind.name)) checkOwnSteps(kind.name, result);

      return result;
    },
    (params: OperationParams, migrate: (event: BattleEvent) => BattleEvent): OperationParams => {
      if (params.event === undefined) return params;

      const event = migrate(params.event);

      return event === params.event ? params : { ...params, event };
    },
  );
}
