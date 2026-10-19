import type { ContentRegistry, Effect, Op } from '../content/index.ts';
import { ReactionIndex } from '../effects/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { ExecuteAccepted } from '../execution/index.ts';
import { AttributeCache, createExpressions } from '../expressions/index.ts';
import type {
  CommandKind,
  EventDraft,
  ExtensionEventKind,
  OperationExtension,
  StepDraft,
  StepKind,
} from '../extensions/index.ts';
import { FieldCache } from '../geometry/index.ts';
import type { JsonValue } from '../json/index.ts';
import { createKernel, type Kernel } from '../kernel/index.ts';
import type { AppliedEffect, BattleState, Command } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { operationDrafts } from '../operations/index.ts';
import { accepted, CONTENT, FROZEN_STATE, GRID, HEX, node, SPEED_ORDER } from './fixtures.ts';
import { runDrafts } from './run-drafts.ts';

export const RUN: CommandKind = {
  kind: 'command',
  name: 'acme:run',
  plan: ({ payload }) => ({ kind: 'steps', steps: payload as readonly StepDraft[] }),
  schema: { type: 'object' },
};

export const EMIT: StepKind<{ readonly events: readonly EventDraft[]; readonly then: readonly Op[] }> = {
  kind: 'step',
  migrations: [],
  name: 'acme:emit',
  run: ({ params }) => ({ events: params.events, kind: 'done', steps: operationDrafts(params.then, { subjects: {} }) }),
  version: 1,
};

export const ASK: StepKind = {
  kind: 'step',
  migrations: [],
  name: 'acme:ask',
  run: ({ inputs }) => (inputs.length === 0
    ? { kind: 'need', need: { count: 1, kind: 'roll', name: 'core:morale', sides: 6 } }
    : { kind: 'reject', reason: 'acme:refused' }),
  version: 1,
};

export const DROP: OperationExtension = {
  kind: 'operation',
  name: 'acme:drop',
  run: (op, { subjects }) => {
    const unit = subjects.self?.kind === 'unit' ? subjects.self.unit : '';
    const item = typeof op.item === 'number' ? op.item : 0;

    return { events: [kernelEventDraft(KERNEL_EVENTS.itemRemoved, { item, unit }, 'all')], kind: 'done' };
  },
  schema: { type: 'object' },
};

export const HIT: ExtensionEventKind<{ readonly unit: string }> = {
  apply: (state) => state,
  kind: 'event',
  migrations: [],
  name: 'acme:hit',
  schema: { type: 'object' },
  target: ({ unit }) => ({ kind: 'unit', unit }),
  version: 1,
};

export const POKE: ExtensionEventKind = {
  apply: (state) => state,
  kind: 'event',
  migrations: [],
  name: 'acme:poke',
  schema: { type: 'object' },
  target: () => ({ cell: '1,1', kind: 'cell' }) as unknown as undefined,
  version: 1,
};

export const SNEAK: StepKind = {
  kind: 'step',
  migrations: [],
  name: 'acme:sneak',
  run: () => ({ events: [], kind: 'done', steps: [{ params: {}, type: KERNEL_STEPS.effectRefresh }] }),
  version: 1,
};

export const SNEAKY: OperationExtension = {
  kind: 'operation',
  name: 'acme:sneaky',
  run: () => ({ events: [], kind: 'done', steps: [{ params: {}, type: KERNEL_STEPS.effectTurn }] }),
  schema: { type: 'object' },
};

export const KERNEL: Kernel = createKernel({
  extensions: [RUN, EMIT, ASK, DROP, HIT, POKE, SNEAK, SNEAKY, GRID, HEX, SPEED_ORDER],
});

export const ARCHERS = { kind: 'unit', unit: 'archers-1' } as const;

export const PIKEMEN = { kind: 'unit', unit: 'pikemen-1' } as const;

export const ATTACKER = { kind: 'side', side: 'attacker' } as const;

export const MARK = KERNEL_EVENTS.variableSet;

export const AFTER_ROUND_5 = node('kernel:compare', { left: node('kernel:round'), operator: '>', right: 5 });

export const BARE_STATE: BattleState = (() => {
  const { inputRequest: open, ...rest } = FROZEN_STATE;

  const units = rest.units.map((unit) => ({ ...unit, effects: [] }));

  return { ...rest, nextRequestId: (open?.id ?? 0) + 1, steps: [], units };
})();

export function contentWith(...effects: readonly Effect[]): ContentRegistry {
  return { ...CONTENT, effects: { ...CONTENT.effects, ...Object.fromEntries(effects.map((one) => [one.name, one])) } };
}

export function markOp(variable: string, value: JsonValue = true): Op {
  return node('kernel:set-variable', { value, variable });
}

export function run(state: BattleState, content: ContentRegistry, ...steps: readonly StepDraft[]): ExecuteAccepted {
  const caches = { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };

  return accepted(runDrafts(KERNEL.registries, caches, state, steps, content));
}

export function emit(events: readonly EventDraft[], then: readonly Op[] = []): StepDraft {
  return { params: { events, then }, type: 'acme:emit' };
}

export function runSteps(steps: readonly StepDraft[]): Command {
  const payload: unknown = steps;

  return { kind: 'game', name: 'acme:run', payload: payload as JsonValue, type: 'extension' };
}

export function withUnitEffects(state: BattleState, unit: string, effects: readonly AppliedEffect[]): BattleState {
  return { ...state, units: state.units.map((current) => (current.id === unit ? { ...current, effects } : current)) };
}

export function types(result: ExecuteAccepted): readonly string[] {
  return result.events.map(({ type }) => type);
}

export function variables(result: ExecuteAccepted): readonly unknown[] {
  return result.events.filter(({ type }) => type === MARK).map(({ payload }) => payload);
}

export function tagsOf(state: BattleState, content: ContentRegistry, unit: string): unknown {
  const expressions = createExpressions({ content, inputs: [], registries: KERNEL.registries, state });
  const tags = expressions.tags(unit);

  return tags.kind === 'value' ? tags.value : tags;
}
