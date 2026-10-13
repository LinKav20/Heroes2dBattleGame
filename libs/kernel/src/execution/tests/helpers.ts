import type { RandomSource } from '../../content/index.ts';
import { createKernel, type Kernel, type KernelExtension } from '../../kernel/index.ts';
import type { CommandKind, EventDraft, EventKind, StepKind, StepResult } from '../../kinds/index.ts';
import type { BattleEvent, BattleState, Command, Unit } from '../../model/index.ts';
import { STATE } from '../../model/tests/helpers.ts';

export const DUEL_EXTENSIONS: readonly KernelExtension[] = [
  command('acme-duel:attack', ({ payload, state }) => {
    const { attacker, target } = strikeParams(payload);

    if (aliveUnit(state, attacker) === undefined || aliveUnit(state, target) === undefined) {
      return { kind: 'reject', params: { reason: 'no-target' } };
    }

    return { kind: 'steps', steps: [{ params: { attacker, target }, type: 'acme-duel:strike' }] };
  }),
  command('acme-duel:sequence', ({ payload }) => ({
    kind: 'steps',
    steps: listOf(payload).map((type) => ({ params: {}, type })),
  })),
  command('acme-duel:refuse', () => ({ kind: 'reject', params: { reason: 'refused' } })),
  step('acme-duel:strike', ({ inputs, params, state }) => {
    const { attacker, target } = strikeParams(params);
    const roll = inputs[0];
    const victim = aliveUnit(state, target);

    if (victim === undefined) return { events: [], kind: 'done' };

    if (roll?.kind !== 'roll') {
      const side = unitOf(state, attacker).side;

      return { kind: 'need', need: { dice: 1, kind: 'roll', side, sides: 6, value: DAMAGE } };
    }

    const wounded = wound(victim, roll.result);

    return {
      events: [healthChanged(target, wounded)],
      kind: 'done',
      steps: wounded.count > 0 ? [{ params: { attacker: target, target: attacker }, type: 'acme-duel:retaliate' }] : [],
    };
  }),
  step('acme-duel:retaliate', ({ params, state }) => {
    const { target } = strikeParams(params);
    const victim = aliveUnit(state, target);

    if (victim === undefined) return { events: [], kind: 'done' };

    const wounded = wound(victim, 1);

    return {
      events: [
        healthChanged(target, wounded),
        { payload: { unit: target }, type: 'acme-duel:noted', visibleTo: [] },
      ],
      kind: 'done',
    };
  }),
  step('acme-duel:choose', ({ inputs }) => {
    const choice = inputs[0];

    if (choice?.kind !== 'choice') {
      return { kind: 'need', need: { kind: 'choice', options: ['left', 'right'], side: 'attacker' } };
    }

    const payload = { value: choice.option, variable: 'path' };

    return { events: [{ payload, type: 'kernel:variable-set', visibleTo: 'all' }], kind: 'done' };
  }),
  step('acme-duel:aim', ({ inputs, state }) => {
    const aim = inputs[0];

    if (aim?.kind !== 'target') {
      const targets = state.units.map(({ id }) => ({ kind: 'unit', unit: id }) as const);

      return { kind: 'need', need: { count: 1, kind: 'target', targets, unit: 'archers-1' } };
    }

    const [first] = aim.targets;
    const unit = first?.kind === 'unit' ? first.unit : '';

    const payload = { flags: ['acme-duel:aimed'], unit };

    return { events: [{ payload, type: 'kernel:flags-changed', visibleTo: 'all' }], kind: 'done' };
  }),
  step('acme-duel:pair', () => ({
    events: [],
    kind: 'done',
    steps: [
      { params: { name: 'first' }, type: 'acme-duel:mark' },
      { params: { name: 'second' }, type: 'acme-duel:mark' },
    ],
  })),
  step('acme-duel:mark', ({ params }) => {
    const payload = { value: true, variable: typeof params.name === 'string' ? params.name : '' };

    return { events: [{ payload, type: 'kernel:variable-set', visibleTo: 'all' }], kind: 'done' };
  }),
  step('acme-duel:chain', () => ({
    events: [{ payload: { value: 1, variable: 'chain' }, type: 'kernel:variable-set', visibleTo: 'all' }],
    kind: 'done',
    steps: [{ params: {}, type: 'acme-duel:choose' }],
  })),
  step('acme-duel:aim-two', ({ inputs, state }) => {
    if (inputs[0]?.kind === 'target') return { events: [], kind: 'done' };

    const targets = state.units.map(({ id }) => ({ kind: 'unit', unit: id }) as const);

    return { kind: 'need', need: { count: 2, kind: 'target', targets } };
  }),
  step('acme-duel:loop', () => ({ events: [], kind: 'done', steps: [{ params: {}, type: 'acme-duel:loop' }] })),
  step('acme-duel:deep', () => ({
    events: [],
    kind: 'done',
    steps: [{ params: {}, type: 'acme-duel:deep' }, { params: {}, type: 'acme-duel:deep' }],
  })),
  step('acme-duel:fail', () => ({ kind: 'reject', params: { reason: 'failed' } })),
  step('acme-duel:gamble', ({ inputs }) => (inputs.length < 2
    ? { kind: 'need', need: { dice: 2, kind: 'roll', sides: 4, value: 'acme-duel:luck' } }
    : { events: [], kind: 'done' })),
  {
    apply: (state, payload) => ({
      ...state,
      extensions: { ...state.extensions, 'acme-duel:log': [...logOf(state), unitOfPayload(payload)] },
    }),
    kind: 'event',
    migrations: [],
    name: 'acme-duel:noted',
    schema: { type: 'object' },
    version: 1,
  } satisfies EventKind,
];

export const DAMAGE = 'acme-duel:damage';

export const KERNEL: Kernel = createKernel({ extensions: DUEL_EXTENSIONS });

export function duelState(source: RandomSource): BattleState {
  const { inputRequest: open, ...rest } = STATE;

  return {
    ...rest,
    nextId: open === undefined ? rest.nextId : Math.max(rest.nextId, open.id + 1),
    rng: { counter: 0, seed: '5'.repeat(64) },
    ruleset: { ...STATE.ruleset, randomSources: { [DAMAGE]: source, 'acme-duel:luck': source } },
    steps: [],
  };
}

export function strike(attacker: string, target: string): Command {
  return { kind: 'game', name: 'acme-duel:attack', payload: { attacker, target }, type: 'extension' };
}

export function sequence(...steps: readonly string[]): Command {
  return { kind: 'game', name: 'acme-duel:sequence', payload: steps, type: 'extension' };
}

export function applyAll(kernel: Kernel, state: BattleState, events: readonly BattleEvent[]): BattleState {
  return events.reduce((current, event) => kernel.apply(current, event), state);
}

export function unitOf(state: BattleState, id: string): Unit {
  const unit = state.units.find((current) => current.id === id);

  if (unit === undefined) throw new Error(`No unit ${id}`);

  return unit;
}

function command(name: string, plan: CommandKind['plan']): CommandKind {
  return { kind: 'command', name, plan, schema: { type: 'object' } };
}

function step(name: string, run: (context: Parameters<StepKind['run']>[0]) => StepResult): StepKind {
  return { kind: 'step', migrations: [], name, run, version: 1 };
}

function strikeParams(value: unknown): { readonly attacker: string; readonly target: string } {
  const record = typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};

  return { attacker: String(record.attacker), target: String(record.target) };
}

function listOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function healthChanged(unit: string, wounded: { readonly count: number; readonly health: number }): EventDraft {
  const payload = { count: wounded.count, health: wounded.health, unit };

  return { payload, type: 'kernel:health-changed', visibleTo: 'all' };
}

function aliveUnit(state: BattleState, id: string): Unit | undefined {
  return state.units.find((unit) => unit.id === id && unit.count > 0);
}

function wound(unit: Unit, damage: number): { readonly count: number; readonly health: number } {
  const total = (unit.count - 1) * 10 + unit.health - damage;

  if (total <= 0) return { count: 0, health: 0 };

  const count = Math.ceil(total / 10);

  return { count, health: total - (count - 1) * 10 };
}

function logOf(state: BattleState): string[] {
  const log = state.extensions['acme-duel:log'];

  return Array.isArray(log) ? log.map(String) : [];
}

function unitOfPayload(payload: unknown): string {
  return typeof payload === 'object' && payload !== null && 'unit' in payload ? String(payload.unit) : '';
}
