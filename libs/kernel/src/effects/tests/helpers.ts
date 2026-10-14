import type { ContentRegistry, Effect, ExpressionNode, Op } from '../../content/index.ts';
import type { CommandKind, EventDraft, StepDraft, StepKind } from '../../extensions/index.ts';
import type { AppliedEffect, BattleState, Command, ExecuteAccepted, ExecuteResult, Unit } from '../../index.ts';
import type { JsonValue } from '../../json/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import { CONTENT, FROZEN_STATE } from '../../tests/fixtures.ts';
import { operationDrafts } from '../index.ts';

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
  run: ({ params }) => ({ events: params.events, kind: 'done', steps: operationDrafts(params.then, {}) }),
  version: 1,
};

export const KERNEL: Kernel = createKernel({ extensions: [RUN, EMIT] });

export const ARCHERS = { kind: 'unit', unit: 'archers-1' } as const;

export const PIKEMEN = { kind: 'unit', unit: 'pikemen-1' } as const;

export const STATE: BattleState = (() => {
  const { inputRequest: open, ...rest } = FROZEN_STATE;

  const units = rest.units.map((unit) => ({ ...unit, effects: [] }));

  return { ...rest, nextRequestId: (open?.id ?? 0) + 1, steps: [], units };
})();

export function effect(name: string, extra: Partial<Effect> = {}): Effect {
  return {
    blockedBy: [],
    duration: { count: 2, kind: 'turns', tick: 'holder-turn-start' },
    endsOn: [],
    forbids: [],
    grantsTags: [],
    modifiers: [],
    name,
    onApply: [],
    onRemove: [],
    onTurn: [],
    removes: [],
    stacking: 'stack',
    tags: [],
    triggers: [],
    visibility: 'all',
    ...extra,
  };
}

export function contentWith(...effects: readonly Effect[]): ContentRegistry {
  return { ...CONTENT, effects: { ...CONTENT.effects, ...Object.fromEntries(effects.map((one) => [one.name, one])) } };
}

export function node(type: string, params: Readonly<Record<string, unknown>> = {}): ExpressionNode {
  const value: unknown = { ...params, type };

  return value as ExpressionNode;
}

export function mark(variable: string, value: JsonValue = true): Op {
  return node('kernel:set-variable', { value, variable });
}

export function run(state: BattleState, content: ContentRegistry, ...steps: readonly StepDraft[]): ExecuteAccepted {
  return accepted(KERNEL.execute(state, runSteps(steps), content));
}

export function runSteps(steps: readonly StepDraft[]): Command {
  const payload: unknown = steps;

  return { kind: 'game', name: 'acme:run', payload: payload as JsonValue, type: 'extension' };
}

export function accepted(result: ExecuteResult): ExecuteAccepted {
  if (!result.ok) throw new Error(`Rejected: ${JSON.stringify(result.rejection)}`);

  return result;
}

export function unitOf(state: BattleState, id: string): Unit {
  const unit = state.units.find((current) => current.id === id);

  if (unit === undefined) throw new Error(`No unit ${id}`);

  return unit;
}

export function applied(id: number, name: string, extra: Partial<AppliedEffect> = {}): AppliedEffect {
  return { active: true, effect: name, id, params: {}, stacks: 1, visibleTo: 'all', ...extra };
}

export function withUnitEffects(state: BattleState, unit: string, effects: readonly AppliedEffect[]): BattleState {
  return { ...state, units: state.units.map((current) => (current.id === unit ? { ...current, effects } : current)) };
}

export function types(result: ExecuteAccepted): readonly string[] {
  return result.events.map(({ type }) => type);
}
