import type { RandomSource, ValueExpr } from '../../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../../events/index.ts';
import type {
  CommandKind,
  EventDraft,
  ExtensionEventKind,
  KernelExtension,
  StepContext,
  StepKind,
  StepNeed,
  StepResult,
} from '../../extensions/index.ts';
import type { JsonValue } from '../../json/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { BattleEvent, BattleState, Command, Unit } from '../../model/index.ts';
import { asRecord, STATE } from '../../tests/fixtures.ts';

export const DAMAGE = 'acme-duel:damage';

export const LUCK = 'acme-duel:luck';

export const TRAP = 'acme-duel:trap';

export const DUEL_EXTENSIONS: readonly KernelExtension[] = [
  command('acme-duel:attack', ({ payload, state }) => {
    const { attacker, target } = strikeParams(payload);

    if (aliveUnit(state, attacker) === undefined || aliveUnit(state, target) === undefined) {
      return { kind: 'reject', params: { target }, reason: 'acme-duel:no-target' };
    }

    return { kind: 'steps', steps: [{ params: { attacker, target }, type: 'acme-duel:strike' }] };
  }),
  command('acme-duel:sequence', ({ payload }) => ({
    kind: 'steps',
    steps: listOf(payload).map((type) => ({ params: {}, type })),
  })),
  command('acme-duel:request', ({ payload }) => ({
    kind: 'steps',
    steps: [{ params: { need: payload }, type: 'acme-duel:ask' }],
  })),
  command('acme-duel:compute', ({ payload }) => ({
    kind: 'steps',
    steps: [{ params: { formula: payload }, type: 'acme-duel:formula' }],
  })),
  command('acme-duel:refuse', () => ({ kind: 'reject', reason: 'acme-duel:refused' })),
  command('acme-duel:mumble', () => ({ kind: 'reject', reason: 'refused' })),
  step<{ readonly attacker: string; readonly target: string }>('acme-duel:strike', ({ inputs, params, state }) => {
    const roll = inputs[0];
    const victim = aliveUnit(state, params.target);

    if (victim === undefined) return { events: [], kind: 'done' };

    if (roll?.kind !== 'roll') {
      const { side } = unitOf(state, params.attacker);

      return { kind: 'need', need: { count: 1, kind: 'roll', name: DAMAGE, side, sides: 6 } };
    }

    const wounded = wound(victim, roll.result);
    const retaliation = { params: { attacker: params.target, target: params.attacker }, type: 'acme-duel:retaliate' };

    return {
      events: [healthChanged(params.target, wounded)],
      kind: 'done',
      steps: wounded.count > 0 ? [retaliation] : [],
    };
  }),
  step<{ readonly target: string }>('acme-duel:retaliate', ({ params, state }) => {
    const victim = aliveUnit(state, params.target);

    if (victim === undefined) return { events: [], kind: 'done' };

    return {
      events: [
        healthChanged(params.target, wound(victim, 1)),
        { payload: { unit: params.target }, type: 'acme-duel:noted', visibleTo: [] },
      ],
      kind: 'done',
    };
  }),
  step('acme-duel:choose', ({ inputs }) => {
    const choice = inputs[0];

    if (choice?.kind !== 'choice') {
      const need = { kind: 'choice', name: 'acme-duel:path', options: ['left', 'right'], side: 'attacker' } as const;

      return { kind: 'need', need };
    }

    return { events: [variableSet('path', choice.option)], kind: 'done' };
  }),
  step('acme-duel:aim', ({ inputs, state }) => {
    const aim = inputs[0];

    if (aim?.kind !== 'target') {
      const targets = state.units.map(({ id }) => ({ kind: 'unit', unit: id }) as const);

      return { kind: 'need', need: { count: 1, kind: 'target', name: 'acme-duel:aim', targets, unit: 'archers-1' } };
    }

    const [first] = aim.targets;
    const unit = first?.kind === 'unit' ? first.unit : '';

    return {
      events: [kernelEventDraft(KERNEL_EVENTS.flagsChanged, { flags: ['acme-duel:aimed'], unit }, 'all')],
      kind: 'done',
    };
  }),
  step('acme-duel:aim-anything', ({ inputs }) => {
    if (inputs[0]?.kind === 'target') return { events: [], kind: 'done' };

    const targets = [{ cell: '1,1', kind: 'cell' }, { kind: 'side', side: 'defender' }] as const;

    return { kind: 'need', need: { count: 2, kind: 'target', name: 'acme-duel:aim', targets } };
  }),
  step('acme-duel:pair', () => ({
    events: [],
    kind: 'done',
    steps: [
      { params: { name: 'first' }, type: 'acme-duel:mark' },
      { params: { name: 'second' }, type: 'acme-duel:mark' },
    ],
  })),
  step<{ readonly name: string }>('acme-duel:mark', ({ params }) => ({
    events: [variableSet(params.name, true)],
    kind: 'done',
  })),
  step('acme-duel:chain', () => ({
    events: [variableSet('chain', 1)],
    kind: 'done',
    steps: [{ params: {}, type: 'acme-duel:choose' }],
  })),
  step('acme-duel:aim-two', ({ inputs, state }) => {
    if (inputs[0]?.kind === 'target') return { events: [], kind: 'done' };

    const targets = state.units.map(({ id }) => ({ kind: 'unit', unit: id }) as const);

    return { kind: 'need', need: { count: 2, kind: 'target', name: 'acme-duel:aim', targets } };
  }),
  step('acme-duel:loop', () => ({ events: [], kind: 'done', steps: [{ params: {}, type: 'acme-duel:loop' }] })),
  step('acme-duel:deep', () => ({
    events: [],
    kind: 'done',
    steps: [{ params: {}, type: 'acme-duel:deep' }, { params: {}, type: 'acme-duel:deep' }],
  })),
  step('acme-duel:fail', () => ({ kind: 'reject', reason: 'acme-duel:failed' })),
  step('acme-duel:gamble', ({ inputs }) => (inputs.length < 2
    ? { kind: 'need', need: { count: 2, kind: 'roll', name: LUCK, sides: 4 } }
    : { events: [], kind: 'done' })),
  step('acme-duel:trap', ({ inputs }) => (inputs.length === 0
    ? { kind: 'need', need: { count: 1, kind: 'roll', name: TRAP, sides: 20, visibleTo: [] } }
    : { events: [], kind: 'done' })),
  step('acme-duel:end', () => ({
    events: [kernelEventDraft(KERNEL_EVENTS.battleEnded, { outcome: { kind: 'draw', winners: [] } }, 'all')],
    kind: 'done',
    steps: [{ params: {}, type: 'acme-duel:choose' }],
  })),
  step<{ readonly need: StepNeed }>('acme-duel:ask', ({ inputs, params }) => (inputs.length === 0
    ? { kind: 'need', need: params.need }
    : { events: [], kind: 'done' })),
  step<{ readonly formula: ValueExpr }>('acme-duel:formula', ({ expressions, params }) => {
    const result = expressions.value(params.formula, { self: { kind: 'unit', unit: 'archers-1' } });

    return result.kind === 'value' ? { events: [variableSet('result', result.value)], kind: 'done' } : result;
  }),
  step('acme-duel:cheat', ({ state }) => ({
    events: [
      kernelEventDraft(KERNEL_EVENTS.inputRequested, {
        request: { id: state.nextRequestId, kind: 'choice', name: 'acme-duel:path', options: ['left'] },
      }, 'all'),
    ],
    kind: 'done',
  })),
  step('acme-duel:grumble', () => ({ kind: 'reject', reason: 'kernel:failed' })),
  step('acme-duel:ghost', () => ({
    events: [{ payload: {}, type: 'acme-duel:unknown', visibleTo: 'all' }],
    kind: 'done',
  })),
  step('acme-duel:summon', () => ({ events: [], kind: 'done', steps: [{ params: {}, type: 'acme-duel:unknown' }] })),
  {
    apply: (state, payload) => ({
      ...state,
      extensions: { ...state.extensions, 'acme-duel:log': [...logOf(state), String(asRecord(payload).unit)] },
    }),
    kind: 'event',
    migrations: [],
    name: 'acme-duel:noted',
    schema: { type: 'object' },
    version: 1,
  } satisfies ExtensionEventKind,
];

export const KERNEL: Kernel = createKernel({ extensions: DUEL_EXTENSIONS });

export function duelState(source: RandomSource): BattleState {
  const { inputRequest: open, ...rest } = STATE;
  const randomSources = { [DAMAGE]: source, [LUCK]: source, [TRAP]: source };

  return {
    ...rest,
    nextRequestId: open === undefined ? rest.nextRequestId : open.id + 1,
    rng: { counter: 0, seed: '5'.repeat(64) },
    ruleset: { ...STATE.ruleset, randomSources },
    steps: [],
  };
}

export function strike(attacker: string, target: string): Command {
  return { kind: 'game', name: 'acme-duel:attack', payload: { attacker, target }, side: 'attacker', type: 'extension' };
}

export function sequence(...steps: readonly string[]): Command {
  return { kind: 'game', name: 'acme-duel:sequence', payload: steps, type: 'extension' };
}

export function ask(need: object): Command {
  const payload: unknown = need;

  return { kind: 'game', name: 'acme-duel:request', payload: payload as JsonValue, type: 'extension' };
}

export function compute(formula: unknown): Command {
  const payload: unknown = formula;

  return { kind: 'game', name: 'acme-duel:compute', payload: payload as JsonValue, type: 'extension' };
}

export function applyAll(kernel: Kernel, state: BattleState, events: readonly BattleEvent[]): BattleState {
  return events.reduce((current, event) => kernel.applyEvent(current, event), state);
}

export function unitOf(state: BattleState, id: string): Unit {
  const unit = state.units.find((current) => current.id === id);

  if (unit === undefined) throw new Error(`No unit ${id}`);

  return unit;
}

function command(name: string, plan: CommandKind['plan']): CommandKind {
  return { kind: 'command', name, plan, schema: { type: 'object' } };
}

function step<Params extends object = object>(
  name: string,
  run: (context: StepContext<Params>) => StepResult,
): StepKind<Params> {
  return { kind: 'step', migrations: [], name, run, version: 1 };
}

function strikeParams(value: unknown): { readonly attacker: string; readonly target: string } {
  const record = asRecord(value);

  return { attacker: String(record.attacker), target: String(record.target) };
}

function listOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function healthChanged(unit: string, wounded: { readonly count: number; readonly health: number }): EventDraft {
  return kernelEventDraft(KERNEL_EVENTS.healthChanged, { count: wounded.count, health: wounded.health, unit }, 'all');
}

function variableSet(variable: string, value: boolean | number | string): EventDraft {
  return kernelEventDraft(KERNEL_EVENTS.variableSet, { value, variable }, 'all');
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
