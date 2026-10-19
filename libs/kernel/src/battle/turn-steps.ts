import { abilityTickDraft } from '../abilities/index.ts';
import { scenarioDefinition } from '../content/index.ts';
import { tickDraft } from '../effects/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { MechanicExtension, StepContext, StepDraft, StepKind, StepResult } from '../extensions/index.ts';
import { VISIBLE_TO_ALL } from '../ids/index.ts';
import { hasActed, sameHolder, turnHolderOf, turnRecordsOf, type TurnHolder } from '../model/index.ts';
import { BATTLE_MOMENTS, KERNEL_STEPS, type Registry } from '../names/index.ts';
import { DONE, kernelStep, stepsDone } from '../operations/index.ts';
import { closingSteps, momentSteps } from './boundaries.ts';
import {
  nextTurnDraft,
  outcomeCheckDraft,
  startCheckDraft,
  turnCheckDraft,
  turnCountsDraft,
  turnEndDraft,
} from './drafts.ts';
import { mechanicContext, turnOrderOf } from './mechanics.ts';
import type {
  ActionEndParams,
  StartCheckParams,
  TurnCountsParams,
  TurnEndParams,
  TurnOrderHookParams,
  TurnStartParams,
} from './params.ts';
import { turnOver, turnParticipants } from './turn-actions.ts';
import { hookSteps } from './turn-order.ts';

/**
 * Returns the steps with which the kernel leads the turns of the battle: the start and the end of a turn, the counts
 * of a turn for its participants, the end of a game action, the check whether a turn is over and the hooks of the
 * order of turns, which the steps ask through `mechanics`.
 *
 * A turn counts for the unit or the side that has it and for those that take part in it: the side of a unit, or the
 * units of a side on the field when the count is made. At the start of the first turn of a holder in a round its uses
 * of the turn start again, cooldowns go down, actions come back, resources of the turn are restored, and durations
 * that count at the start of a turn go down; at the end of that turn the durations that count at the end of a turn go
 * down. A turn put off by waiting goes on later with nothing counted again, and another turn of the same holder in
 * the round only gives the actions back.
 */
export function turnSteps(mechanics: () => Registry<MechanicExtension>): readonly StepKind[] {
  return Object.freeze([
    kernelStep(KERNEL_STEPS.turnStart, (context: StepContext<TurnStartParams>) => turnStart(context, mechanics())),
    kernelStep(KERNEL_STEPS.turnEnd, (context: StepContext<TurnEndParams>) => turnEnd(context, mechanics())),
    kernelStep(KERNEL_STEPS.turnCounts, turnCounts),
    kernelStep(KERNEL_STEPS.actionEnd, actionEnd),
    kernelStep(KERNEL_STEPS.turnCheck, turnCheck),
    kernelStep(KERNEL_STEPS.turnOrderHook, (context: StepContext<TurnOrderHookParams>) => hook(context, mechanics())),
  ]);
}

function turnStart(context: StepContext<TurnStartParams>, mechanics: Registry<MechanicExtension>): StepResult {
  const { params, state } = context;
  const { holder } = params;
  const records = turnRecordsOf(state, holder);
  const holders = turnParticipants(state, holder);
  const counts = records.length === 0
    ? [turnCountsDraft({ counts: 'abilities', holders }), turnCountsDraft({ counts: 'effects-start', holders })]
    : [];
  const refills = records.at(-1)?.waited === false
    ? [turnCountsDraft({ counts: 'actions', holders: holders.filter(({ kind }) => kind === 'unit') })]
    : [];

  return stepsDone([
    ...counts,
    ...refills,
    ...momentSteps(context, mechanics, { holder, moment: BATTLE_MOMENTS.turnStart }),
    startCheckDraft(holder),
  ]);
}

function turnEnd(context: StepContext<TurnEndParams>, mechanics: Registry<MechanicExtension>): StepResult {
  const { params, state } = context;
  const { holder, skipped, waited } = params;

  if (!sameHolder(turnHolderOf(state.phase), holder)) return DONE;

  const counts = waited || hasActed(state, holder)
    ? []
    : [turnCountsDraft({ counts: 'effects-end', holders: turnParticipants(state, holder) })];

  return {
    events: [kernelEventDraft(KERNEL_EVENTS.turnEnded, { holder, skipped, waited }, VISIBLE_TO_ALL)],
    kind: 'done',
    steps: [...counts, ...momentSteps(context, mechanics, { holder, moment: BATTLE_MOMENTS.turnEnd }), nextTurnDraft()],
  };
}

function turnCounts({ params }: StepContext<TurnCountsParams>): StepResult {
  const [holder, ...rest] = params.holders;

  if (holder === undefined) return DONE;

  return stepsDone([
    countDraft(params.counts, holder),
    ...(rest.length === 0 ? [] : [turnCountsDraft({ counts: params.counts, holders: rest })]),
  ]);
}

function actionEnd(context: StepContext<ActionEndParams>): StepResult {
  const { end, holder } = context.params;
  const last = end === undefined
    ? turnCheckDraft({ holder })
    : turnEndDraft({ holder, skipped: false, waited: end === 'waited' });

  return stepsDone([...closingSteps(context), last]);
}

function turnCheck(context: StepContext<StartCheckParams>): StepResult {
  const { params, state } = context;
  const holder = turnHolderOf(state.phase);

  if (holder === undefined || (params.holder !== undefined && !sameHolder(params.holder, holder))) return DONE;

  const skipped = params.start === true;

  if (params.end === true) return stepsDone([turnEndDraft({ holder, skipped, waited: false })]);

  const over = turnOver(context, holder);

  if (over.kind !== 'value') return over;

  return over.value ? stepsDone([turnEndDraft({ holder, skipped, waited: false })]) : DONE;
}

function hook(context: StepContext<TurnOrderHookParams>, mechanics: Registry<MechanicExtension>): StepResult {
  const { content, params, state } = context;
  const { params: variantParams, variant } = turnOrderOf(mechanics, state.ruleset);
  const steps = hookSteps(variant, mechanicContext(context, variantParams), params.moment, params.holder);
  const outcomes = steps.length > 0 && scenarioDefinition(content, state.scenario).outcomes.length > 0;

  return stepsDone(outcomes ? [...steps, outcomeCheckDraft()] : steps);
}

function countDraft(counts: TurnCountsParams['counts'], holder: TurnHolder): StepDraft {
  switch (counts) {
    case 'abilities': {
      return abilityTickDraft({ holder, moment: 'holder-turn-start' });
    }

    case 'actions': {
      return abilityTickDraft({ actionsOnly: true, holder, moment: 'holder-turn-start' });
    }

    case 'effects-end': {
      return tickDraft({ holder, moment: 'holder-turn-end' });
    }

    case 'effects-start': {
      return tickDraft({ holder, moment: 'holder-turn-start' });
    }

    default: {
      throw new TypeError(`The kernel has no counts ${JSON.stringify(counts)} of a turn.`);
    }
  }
}
