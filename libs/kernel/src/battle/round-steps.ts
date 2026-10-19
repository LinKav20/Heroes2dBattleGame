import { abilityTickDraft } from '../abilities/index.ts';
import { scenarioDefinition } from '../content/index.ts';
import { tickDraft } from '../effects/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, MechanicExtension, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import { VISIBLE_TO_ALL } from '../ids/index.ts';
import { standsOnField, type ActivePhase, type AppliedEffect, type BattleState } from '../model/index.ts';
import { BATTLE_MOMENTS, KERNEL_STEPS, type Registry } from '../names/index.ts';
import { DONE, kernelStep, stepsDone } from '../operations/index.ts';
import { momentSteps } from './boundaries.ts';
import { fixedUnits } from './deployment-zones.ts';
import { nextTurnDraft, roundEndDraft, roundStartDraft, turnStartDraft } from './drafts.ts';
import { battleEnded } from './outcomes.ts';
import { nextTurnOf } from './turn-order.ts';

/**
 * Returns the steps with which the kernel leads the rounds of the battle: the start of the battle after deployment,
 * the start of a round, the choice of the next turn and the end of a round. The steps ask the order of turns of the
 * ruleset through `mechanics`.
 *
 * If a whole round ends with no turn in which a side or a unit could act and nothing on the field counts down a
 * duration that could change it, the battle ends in a draw, because nobody can act any more.
 */
export function roundSteps(mechanics: () => Registry<MechanicExtension>): readonly StepKind[] {
  return Object.freeze([
    kernelStep(KERNEL_STEPS.battleStart, (context) => battleStart(context, mechanics())),
    kernelStep(KERNEL_STEPS.roundStart, (context) => roundStart(context, mechanics())),
    kernelStep(KERNEL_STEPS.nextTurn, (context) => nextTurn(context, mechanics())),
    kernelStep(KERNEL_STEPS.roundEnd, (context) => roundEnd(context, mechanics())),
  ]);
}

function battleStart(context: StepContext, mechanics: Registry<MechanicExtension>): StepResult {
  const { content, state } = context;

  if (state.phase.kind !== 'deployment') return DONE;

  const fixed = fixedUnits(scenarioDefinition(content, state.scenario));
  const revealed = state.units
    .filter((unit) => unit.cell !== undefined && !fixed.has(unit.id))
    .map(({ cell = '', facing, id, visibleTo }) => {
      const placed = { cell, unit: id, ...(facing === undefined ? {} : { facing }) };

      return kernelEventDraft(KERNEL_EVENTS.unitPlaced, placed, visibleTo);
    });

  return {
    events: [...revealed, phaseChanged(0, { kind: 'between-turns' })],
    kind: 'done',
    steps: [...momentSteps(context, mechanics, { moment: BATTLE_MOMENTS.battleStart }), roundStartDraft()],
  };
}

function roundStart(context: StepContext, mechanics: Registry<MechanicExtension>): StepResult {
  const { state } = context;

  return {
    events: [phaseChanged(state.round + 1, { kind: 'round-start' })],
    kind: 'done',
    steps: [
      abilityTickDraft({ moment: 'round-start' }),
      ...momentSteps(context, mechanics, { moment: BATTLE_MOMENTS.roundStart }),
      nextTurnDraft(),
    ],
  };
}

function nextTurn(context: StepContext, mechanics: Registry<MechanicExtension>): StepResult {
  const { state } = context;
  const { kind } = state.phase;

  if (kind !== 'between-turns' && kind !== 'round-start') return DONE;

  const next = nextTurnOf(context, mechanics);

  if (next === undefined && state.turns.every(({ skipped }) => skipped) && !counting(state)) {
    return { events: [battleEnded({ kind: 'draw', winners: [] })], kind: 'done' };
  }

  if (next === undefined) return stepsDone([roundEndDraft()]);

  const { holder, side } = next;
  const phase: ActivePhase = holder.kind === 'unit'
    ? { kind: 'turn', side, unit: holder.unit }
    : { kind: 'turn', side };

  return { events: [phaseChanged(state.round, phase)], kind: 'done', steps: [turnStartDraft({ holder })] };
}

function roundEnd(context: StepContext, mechanics: Registry<MechanicExtension>): StepResult {
  return stepsDone([
    tickDraft({ moment: 'round-end' }),
    ...momentSteps(context, mechanics, { moment: BATTLE_MOMENTS.roundEnd }),
    roundStartDraft(),
  ]);
}

function counting(state: BattleState): boolean {
  const effects: readonly AppliedEffect[] = [
    ...state.units.filter((unit) => standsOnField(unit)).flatMap((unit) => unit.effects),
    ...state.sides.flatMap((side) => side.effects),
    ...state.field.effects,
    ...state.field.hazards.flatMap((hazard) => hazard.effects),
  ];

  return effects.some(({ remaining }) => remaining !== undefined);
}

function phaseChanged(round: number, phase: ActivePhase): EventDraft {
  return kernelEventDraft(KERNEL_EVENTS.phaseChanged, { phase, round }, VISIBLE_TO_ALL);
}
