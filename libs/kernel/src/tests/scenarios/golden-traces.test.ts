import { describe, expect, it } from 'vitest';
import {
  abilityDefinition,
  creatureDefinition,
  hashJson,
  standsOnField,
  type BattleState,
  type Command,
  type ContentRegistry,
  type FieldGeometry,
  type Target,
  type Unit,
} from '../../index.ts';
import { act, answerRoll, deployed, DRIVE, endTurn, move, use, type Drive } from './driver.ts';
import { created, SKIRMISH, WORLD, worldWith } from './world.ts';

interface Trace {
  readonly hashes: readonly string[];
  readonly outcome: unknown;
}

describe('the traces of whole battles', () => {
  it('stay the same at the pass with rolls of the generator', () => {
    expect(trace(deployed(created()), DRIVE)).toStrictEqual(PASS_TRACE);
  });

  it('stay the same at the pass with rolls from outside', () => {
    const options = { ruleset: { randomSources: { 'demo:damage': 'external' as const } } };

    expect(trace(deployed(created(WORLD, options)), DRIVE)).toStrictEqual(EXTERNAL_TRACE);
  });

  it('stay the same when the sides take turns', () => {
    const drive = { ...DRIVE, content: SIDES };

    expect(trace(deployed(created(SIDES), drive), drive)).toStrictEqual(SIDES_TRACE);
  });
});

const SIDES: ContentRegistry = worldWith({}, {
  mechanics: { ...SKIRMISH.mechanics, 'kernel:turn-order': { variant: 'acme:sides' } },
  turnOwner: 'side',
});

const PASS_TRACE: Trace = {
  hashes: [
    'c65161e8a906d6b6',
    '5258232595877e72',
    '302c637b032ad47d',
    '72ca2a06450af0a1',
    'df9c90c3d97d0fac',
    '46015388c06def59',
    'e2aaaa59a953a1f5',
    '50c17f5ef7a8516c',
    '6032c8d8300a829c',
    '26e45e32de751667',
    '3ba59b599eb3b9c6',
    '01d0f09e05a54cef',
    '2a3e987e73548943',
    '21526ba6ffaf1811',
    'b3fcf5df7e4afe4f',
    '0e2ee0602d25199a',
    'e539e2c88fbc041b',
    'ffa6743c714bca25',
    'c4da64d4118bf17c',
    'f95cad7bb9044fe4',
    '12f831f657494aa0',
    '14a2b2fc13f0eb78',
    '958264bc855c61c7',
    '7329a1c226c14b90',
    '7b9487a147d46ee7',
    '1f37cbd2f767af2f',
    '8d9e607f4dcf84d4',
    '96f27e442e6f8208',
    '13656b6ec09102b1',
    '573ca21ad903c6b2',
    '5107811e5e4cd81c',
    '62f73e41d545c273',
    '84d9157c66633f93',
    '4a57a9c8fdc45a22',
    '1a83de0a9a26dea1',
    '8299254d9288d1f0',
    'a79efb9339976e91',
    'ec563fd53c164bb3',
    '1704b6731eaa8c18',
    '44befe6f44726dd0',
    'd2743977d66148a0',
  ],
  outcome: { condition: 'held', kind: 'victory', side: 'defender', winners: ['defender'] },
};

const EXTERNAL_TRACE: Trace = {
  hashes: [
    '8008357042f62a1c',
    'afcd318e4127e8cb',
    '03b9c0985bc921df',
    '9a7ff62f8c10f6d0',
    '74176a0402c0af1a',
    '73d326f3c4cd0c79',
    'ee9bdf8be602c988',
    'c349040737bcb85e',
    '683f159b0cd717fb',
    '9b1247b6b6e1b770',
    '6bc443efa717c44a',
    'b62f31e0f2637ab1',
    '0024c844809160d9',
    'eee87ed2f09764da',
    'ada758a1dda72bad',
    '4685fe48a61fc213',
    '5ba1c9aaeb2fa8a8',
    '28aec25272f956b7',
    '6b40c80cd8f61900',
    '2286cc81d25750ef',
    'ebcd73bd0fbe1bb5',
    '228139300ab8b778',
    '009afdc690244125',
    '1114022bf1b46d2f',
    '18273d61916f1f07',
    '38f658a7460a0bd0',
    '29eed1fac9394762',
    '2146c35f7b5a7295',
    '2c1e8fb73a9f47bf',
    'c2f448d727b12e2c',
    '696ee8927ea935a5',
    '8008b9ba63f6fae5',
    '0898ee4ef24870bd',
    'f6d5e8410e48b925',
    'b5b78fa779a18f67',
    '1e53b1a67aad220c',
    'f189b71fe2fa2c10',
    '0828abd708febbe8',
    '979424306d2a4dce',
    '084f9bd5702541e7',
    '22d7c7c42abe6c47',
    '0fedd7bbc7b4e177',
    'bfbc0fecf595d98a',
  ],
  outcome: { condition: 'held', kind: 'victory', side: 'defender', winners: ['defender'] },
};

const SIDES_TRACE: Trace = {
  hashes: [
    '4936e9fb717e35c5',
    'ea2241034211b544',
    'b36a480078e418e9',
    'e530cd40c9c958e3',
    '0bbb67f7a183dd4a',
    '01820b351a5812d6',
    '8c1ef58017b8d008',
    'fd5198937b2d7309',
    '25a4411052a26c2d',
    '3fd766ab6590530e',
    '99473c0448c6d408',
    'a6012f5775ed2428',
    'a2917d3edf9e3711',
    'afb94f77c73a75ab',
    '5d5ba72b91a66b75',
    'adc980837ba1133b',
    '3837bea0e273de11',
    'af463d0c3163c444',
    '1bf3493d6a38aac2',
    '3dfdc04c3aa32c50',
    'fadc800a54887679',
    '379e8c879d6bfd36',
    '2a26cb69a1cca636',
    '55c2d3577527dcf4',
    '700a93c81785366f',
    '624782b8373b34fa',
    'cf1f30b59d82ad75',
    'e8f700dac9a6d8d3',
    '3c21aa35b52989bd',
    '0688c346d640c580',
    'e36fcee7cb34c3b6',
    'dede17724bf17e73',
    'abb8a5eeeab00321',
    'e244cf004b6ae9dd',
    'ab86789e028c9cc5',
    '7e0ed0041f6f77a2',
  ],
  outcome: { condition: 'wiped-out', kind: 'victory', side: 'defender', winners: ['defender'] },
};

function trace(first: BattleState, drive: Drive): Trace {
  const hashes: string[] = [];
  let state = first;

  while (state.phase.kind !== 'ended' && hashes.length < 300) {
    state = act(state, nextCommand(state, drive), drive).state;
    hashes.push(hashJson(state).slice(0, 16));
  }

  return { hashes, outcome: state.phase.kind === 'ended' ? state.phase.outcome : undefined };
}

function nextCommand(state: BattleState, { content, kernel }: Drive): Command {
  const { inputRequest, phase } = state;

  if (inputRequest?.kind === 'roll') {
    return answerRoll(inputRequest.id, ...Array.from({ length: inputRequest.count }, () => 1 + (inputRequest.id % 6)));
  }

  if (phase.kind !== 'turn') throw new Error(`No turn in ${phase.kind}`);

  const actors = state.units.filter((one) => standsOnField(one)
    && (phase.unit === undefined ? one.side === phase.side : one.id === phase.unit));

  for (const actor of actors) {
    for (const [ability, targets] of choices(state, actor, content)) {
      const request = { ability, targets, user: { kind: 'unit', unit: actor.id } } as const;

      if (kernel.checkAbility(state, request, content) === undefined) return use(actor.id, ability, ...targets);
    }

    const closer = approach(state, actor, kernel.field(state, content), content);

    if (closer !== undefined) return move(actor.id, closer);
  }

  return phase.unit === undefined ? { kind: 'game', side: phase.side, type: 'end-turn' } : endTurn(phase.unit);
}

function approach(state: BattleState, actor: Unit, field: FieldGeometry, content: ContentRegistry): string | undefined {
  if (actor.spentActions['core:move'] !== undefined) return undefined;

  const enemies = state.units.filter((one) => standsOnField(one) && one.side !== actor.side);
  const budget = creatureDefinition(content, actor.creature).attributes['core:move'] ?? 0;
  let best = actor.cell === undefined ? undefined : { cell: actor.cell, distance: nearest(field, actor.cell, enemies) };

  for (const { cell } of field.reachable(actor.id, budget)) {
    const distance = nearest(field, cell, enemies);

    if (best === undefined || distance < best.distance) best = { cell, distance };
  }

  return best?.cell === actor.cell ? undefined : best?.cell;
}

function nearest(field: FieldGeometry, cell: string, enemies: readonly Unit[]): number {
  return Math.min(...enemies.map((one) => field.distanceBetween([cell], field.cellsOf(one.id)) ?? 99));
}

function choices(
  state: BattleState,
  actor: Unit,
  content: ContentRegistry,
): ReadonlyArray<readonly [string, readonly Target[]]> {
  const living = state.units
    .filter((one) => standsOnField(one))
    .toSorted((left, right) => Number(left.side === actor.side) - Number(right.side === actor.side));

  return creatureDefinition(content, actor.creature).abilities.flatMap((ability) => {
    const { kind } = abilityDefinition(content, ability).target;

    return living.map((one): readonly [string, readonly Target[]] => [
      ability,
      [kind === 'area' ? { cell: one.cell ?? '', kind: 'cell' } : { kind: 'unit', unit: one.id }],
    ]);
  });
}
